import type {
  AssignmentType,
  Order,
  OrderItem,
  Prisma,
  ProductType,
  StaffRole,
} from "@prisma/client"
import { prisma } from "../../db/prisma.js"
import { env } from "../../config/env.js"
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  unprocessable,
} from "../../lib/errors.js"
import { formatFcfa } from "../../lib/money.js"
import { googleMapsUrlForCoordinates } from "../../lib/googleMaps.js"
import {
  generateOrderNumber,
  generatePublicRef,
  generateTrackingCode,
} from "../../lib/ids.js"
import { logger } from "../../config/logger.js"
import { priceForQuantity } from "../catalog/pricing.js"
import { audit } from "../audit/service.js"
import {
  enqueueOrderCreatedNotification,
  enqueueOrderCreatedSmsNotification,
  enqueueCashPaymentRecordedNotification,
  enqueueStaffAssignmentNotification,
  enqueueStaffNewOrderNotifications,
} from "../notifications/service.js"
import {
  PICKUP_EXPIRED_REASON,
  PICKUP_TIMEOUT_MS,
  canRecordPayment,
  canTransitionStatus,
  computePaymentStatus,
  isFullyPaid,
  pickupDeadlineFrom,
  remainingDue,
  type OrderClosureContext,
} from "./stateMachine.js"
import {
  assignmentTypeForRole,
  availableOrderActions,
  hasOrderAction,
  requiredAssignmentRoles,
  type OrderAction,
  type OrderActionContext,
} from "./actions.js"
import type { z } from "zod"
import type {
  assignSchema,
  checkoutSchema,
  deliveryOutcomeSchema,
  orderListQuerySchema,
  paymentSchema,
  pickupSchema,
  statusUpdateSchema,
} from "./schemas.js"

type Tx = Prisma.TransactionClient

const assertFullyPaidForClosure = (
  order: { total: number , paidAmount: number },
  actionLabel: string,
) => {
  if (isFullyPaid(order)) return
  throw conflict(
    `Le paiement intégral est requis avant de ${actionLabel}. Reste à payer : ${formatFcfa(
      remainingDue(order.total, order.paidAmount),
    )}.`,
  )
}

const closureContext = (order: {
  status: Order["status"]
  fulfillmentMode: Order["fulfillmentMode"]
  total: number
  paidAmount: number
  fulfillmentCompletedAt: Date | null
}): OrderClosureContext => ({
  status: order.status,
  fulfillmentMode: order.fulfillmentMode,
  total: order.total,
  paidAmount: order.paidAmount,
  fulfillmentCompleted: Boolean(order.fulfillmentCompletedAt),
})

/** Statut opérationnel hérité, dérivé du statut métier (jamais décisionnel). */
const derivedOperationalStatus = (
  status: Order["status"],
): Order["operationalStatus"] => {
  switch (status) {
    case "COMMANDE_EN_PREPARATION":
      return "EN_PREPARATION"
    case "COMMANDE_EN_COURS_DE_LIVRAISON":
      return "EN_COURS_DE_LIVRAISON"
    case "LIVREE":
      return "TERMINE"
    case "ECHEC_LIVRAISON":
      return "ECHEC"
    default:
      return "NON_DEMARRE"
  }
}

const createTrackingCode = async (tx: Tx) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateTrackingCode(12)
    const exists = await tx.order.findUnique({ where: { trackingCode: code } })
    if (!exists) return code
  }
  throw new Error("Impossible de générer un code de suivi unique.")
}

const createOrderNumber = async (tx: Tx, type: "GPS" | "DRINK") => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const number = generateOrderNumber(type)
    const exists = await tx.order.findUnique({ where: { orderNumber: number } })
    if (!exists) return number
  }
  throw new Error("Impossible de générer un numéro de commande unique.")
}

const createGroupRef = async (tx: Tx) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ref = generatePublicRef()
    const exists = await tx.orderGroup.findUnique({ where: { publicRef: ref } })
    if (!exists) return ref
  }
  throw new Error("Impossible de générer une référence de groupe unique.")
}

const orderInclude = {
  items: { orderBy: { id: "asc" as const } },
  history: {
    orderBy: { createdAt: "asc" as const },
    include: { actor: { select: { name: true } } },
  },
  assignments: {
    orderBy: { createdAt: "desc" as const },
    include: {
      staff: { select: { id: true, name: true, role: true, phone: true } },
    },
  },
  payments: {
    orderBy: { createdAt: "desc" as const },
    include: { receivedBy: { select: { name: true } } },
  },
  notes: {
    orderBy: { createdAt: "desc" as const },
    include: { author: { select: { name: true } } },
  },
  conversations: {
    include: {
      messages: { orderBy: { createdAt: "asc" as const }, take: 100 },
      participants: true,
    },
  },
  assignedTo: { select: { id: true, name: true, role: true, phone: true } },
  group: {
    include: {
      orders: {
        select: {
          id: true,
          orderNumber: true,
          trackingCode: true,
          categoryType: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.OrderInclude

export type OrderWithDetails = Prisma.OrderGetPayload<{
  include: typeof orderInclude
}>

/**
 * Crée un groupe de commandes à partir du panier. Les articles sont séparés
 * par type de produit (GPS / boissons) et toutes les écritures sont
 * transactionnelles. Les prix et disponibilités sont toujours relus en base.
 */
export const createOrderGroup = async (
  input: z.infer<typeof checkoutSchema>,
  ip?: string,
  userAgent?: string,
) => {
  const merged = new Map<string, number>()
  for (const item of input.items) {
    merged.set(
      item.productId,
      (merged.get(item.productId) ?? 0) + item.quantity,
    )
  }
  if ([...merged.values()].some((quantity) => quantity > 99)) {
    throw unprocessable("La quantité maximale par produit est de 99.")
  }

  const productIds = [...merged.keys()]
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: { category: true },
  })

  if (products.length !== productIds.length) {
    throw unprocessable(
      "Un ou plusieurs produits du panier ne sont plus disponibles.",
    )
  }

  for (const product of products) {
    if (!product.active || !product.category.active) {
      throw unprocessable(`Le produit « ${product.name} » n’est plus proposé.`)
    }
    if (!product.available || product.quoteOnly) {
      throw unprocessable(
        `Le produit « ${product.name} » n’est pas commandable en ligne.`,
      )
    }
    if (product.type === "SERVICE") {
      throw unprocessable(
        "Les services en pack font l’objet d’une demande de devis, pas d’une commande directe.",
      )
    }
    if (!Number.isSafeInteger(product.price) || product.price <= 0) {
      throw unprocessable(
        `Le prix du produit « ${product.name} » doit être confirmé par Allo Togo.`,
      )
    }
    if (product.manageStock && product.stock !== null) {
      const quantity = merged.get(product.id) ?? 0
      if (product.stock < quantity) {
        throw conflict(
          `Stock insuffisant pour « ${product.name} » (${product.stock} restant).`,
        )
      }
    }
  }

  const groups = new Map<ProductType, typeof products>()
  for (const product of products) {
    const list = groups.get(product.type) ?? []
    list.push(product)
    groups.set(product.type, list)
  }

  const groupRef = await createGroupRef(prisma)
  const deliveryFee =
    input.fulfillmentMode === "LIVRAISON" ? env.DELIVERY_FEE_FCFA : 0
  const deliveryLatitude =
    input.fulfillmentMode === "LIVRAISON"
      ? (input.delivery.latitude ?? null)
      : null
  const deliveryLongitude =
    input.fulfillmentMode === "LIVRAISON"
      ? (input.delivery.longitude ?? null)
      : null
  const deliveryMapUrl =
    input.fulfillmentMode === "LIVRAISON"
      ? input.delivery.mapUrl?.trim() ||
        (deliveryLatitude !== null && deliveryLongitude !== null
          ? googleMapsUrlForCoordinates(deliveryLatitude, deliveryLongitude)
          : null)
      : null

  const created = await prisma.$transaction(async (tx) => {
    const group = await tx.orderGroup.create({
      data: {
        publicRef: groupRef,
        customerName: input.customer.name.trim(),
        customerPhone: input.customer.phone.trim(),
        customerWhatsapp: input.customer.whatsapp?.trim() || null,
        customerEmail: input.customer.email?.trim() || null,
      },
    })

    const orders: Array<Order & { items: OrderItem[] }> = []

    for (const [type, typeProducts] of groups.entries()) {
      const items = typeProducts.map((product) => {
        const quantity = merged.get(product.id) ?? 0
        const unitPrice = priceForQuantity(
          product.price,
          product.wholesalePrices,
          quantity,
        )
        return {
          product,
          quantity,
          unitPrice,
          lineTotal: unitPrice * quantity,
        }
      })
      const subtotal = items.reduce((total, item) => total + item.lineTotal, 0)
      const total = subtotal + deliveryFee
      const trackingCode = await createTrackingCode(tx)
      const orderNumber = await createOrderNumber(tx, type as "GPS" | "DRINK")

      const order = await tx.order.create({
        data: {
          orderNumber,
          trackingCode,
          groupId: group.id,
          categoryType: type,
          paymentMode:
            input.fulfillmentMode === "RETRAIT_AGENCE"
              ? "PAIEMENT_EN_AGENCE"
              : "PAIEMENT_A_LA_LIVRAISON",
          fulfillmentMode: input.fulfillmentMode,
          requiresTechnician: type === "GPS" && input.requiresTechnician,
          customerName: input.customer.name.trim(),
          customerPhone: input.customer.phone.trim(),
          customerWhatsapp: input.customer.whatsapp?.trim() || null,
          customerEmail: input.customer.email?.trim() || null,
          deliveryZone:
            input.fulfillmentMode === "LIVRAISON"
              ? input.delivery.zone?.trim() || null
              : null,
          deliveryAddress:
            input.fulfillmentMode === "LIVRAISON"
              ? input.delivery.address?.trim() || null
              : null,
          deliveryInstructions: input.delivery.instructions?.trim() || null,
          deliveryLatitude,
          deliveryLongitude,
          deliveryMapUrl,
          subtotal,
          deliveryFee,
          total,
          items: {
            create: items.map((item) => ({
              productId: item.product.id,
              productName: item.product.name,
              productSku: item.product.sku,
              productType: item.product.type,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              lineTotal: item.lineTotal,
              specsSnapshot: item.product.specs ?? undefined,
            })),
          },
          history: {
            create: {
              fromStatus: null,
              toStatus: "EN_ATTENTE_CONFIRMATION",
              actorType: "CLIENT",
              actorName: input.customer.name.trim(),
              comment: "Commande soumise depuis la boutique.",
              publicComment: true,
            },
          },
          conversations: {
            create: [
              {
                visibility: "CLIENT",
                participants: {
                  create: [
                    { role: "CLIENT", displayName: input.customer.name.trim() },
                    { role: "STAFF", displayName: "Service client Allo Togo" },
                  ],
                },
                messages: {
                  create: {
                    authorType: "SYSTEM",
                    authorName: "Allo Togo",
                    body: `Votre commande ${orderNumber} a été enregistrée. Un conseiller va vous contacter pour la confirmer.`,
                  },
                },
              },
              {
                visibility: "INTERNAL",
                participants: {
                  create: [{ role: "STAFF", displayName: "Équipe Allo Togo" }],
                },
                messages: {
                  create: {
                    authorType: "SYSTEM",
                    authorName: "Système",
                    body: `Commande ${orderNumber} créée — à confirmer par téléphone.`,
                  },
                },
              },
            ],
          },
        },
        include: { items: true },
      })

      for (const item of items) {
        if (item.product.manageStock && item.product.stock !== null) {
          const updated = await tx.product.updateMany({
            where: { id: item.product.id, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          })
          if (updated.count === 0) {
            throw conflict(`Stock insuffisant pour « ${item.product.name} ».`)
          }
          await tx.inventoryMovement.create({
            data: {
              productId: item.product.id,
              type: "OUT",
              quantity: -item.quantity,
              reason: `Commande ${orderNumber}`,
            },
          })
        }
      }

      orders.push(order)
    }

    return { group, orders }
  })

  // L'outbox ne doit pas bloquer la création de la commande.
  for (const order of created.orders) {
    try {
      await enqueueOrderCreatedNotification(order)
    } catch (error) {
      logger.error(
        { err: error, orderId: order.id },
        "Impossible de mettre la notification en file d’attente",
      )
    }
    try {
      await enqueueOrderCreatedSmsNotification(order)
      await enqueueStaffNewOrderNotifications(order)
    } catch (error) {
      logger.error(
        { err: error, orderId: order.id },
        "Impossible de notifier les équipes commerciales",
      )
    }
  }

  await audit({
    actorType: "CLIENT",
    action: "ORDER_GROUP_CREATED",
    entity: "OrderGroup",
    entityId: created.group.id,
    metadata: {
      publicRef: created.group.publicRef,
      orders: created.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        trackingCode: order.trackingCode,
        categoryType: order.categoryType,
        total: order.total,
      })),
    },
    ip,
    userAgent,
  })

  return {
    ...created.group,
    orders: created.orders,
  }
}

const scopedWhere = (user: {
  id: string
  role: StaffRole
}): Prisma.OrderWhereInput => {
  if (user.role === "TECHNICIAN" || user.role === "DELIVERY") {
    return { assignments: { some: { staffId: user.id, active: true } } }
  }
  return {}
}

export const listOrders = async (
  query: z.infer<typeof orderListQuerySchema>,
  user: { id: string , role: StaffRole },
) => {
  const where: Prisma.OrderWhereInput = {
    ...scopedWhere(user),
    ...(query.status ? { status: query.status as Order["status"] } : {}),
    ...(query.categoryType ? { categoryType: query.categoryType } : {}),
    ...(query.paymentStatus
      ? { paymentStatus: query.paymentStatus as Order["paymentStatus"] }
      : {}),
    ...(query.fulfillmentMode
      ? { fulfillmentMode: query.fulfillmentMode }
      : {}),
    ...(query.assignedToId
      ? { assignments: { some: { staffId: query.assignedToId, active: true } } }
      : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { orderNumber: { contains: query.search, mode: "insensitive" } },
            { trackingCode: { contains: query.search, mode: "insensitive" } },
            { customerName: { contains: query.search, mode: "insensitive" } },
            { customerPhone: { contains: query.search } },
          ],
        }
      : {}),
  }

  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        items: true,
        assignedTo: { select: { id: true, name: true, role: true } },
        group: { select: { id: true, publicRef: true } },
        _count: { select: { payments: true, notes: true } },
      },
    }),
  ])

  return {
    data: orders.map((order) => ({
      ...order,
      remainingDue: remainingDue(order.total, order.paidAmount),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}

const assertOrderAccess = (
  order: OrderWithDetails,
  user: { id: string , role: StaffRole },
) => {
  if (user.role === "TECHNICIAN" || user.role === "DELIVERY") {
    if (
      !order.assignments.some(
        (assignment) => assignment.active && assignment.staffId === user.id,
      )
    ) {
      throw forbidden("Cette commande ne vous est pas attribuée.")
    }
  }
}

export const getOrderById = async (
  id: string,
  user: { id: string , name: string , role: StaffRole },
) => {
  const order = await prisma.order.findFirst({
    where: { OR: [{ id }, { trackingCode: id }, { orderNumber: id }] },
    include: orderInclude,
  })
  if (!order) throw notFound("Commande introuvable.")
  assertOrderAccess(order, user)
  return order
}

const addHistory = async (
  tx: Tx,
  orderId: string,
  data: {
    fromStatus?: Order["status"] | null
    toStatus: Order["status"]
    fromOperational?: Order["operationalStatus"] | null
    toOperational?: Order["operationalStatus"] | null
    actorId?: string | null
    actorType?: string
    actorName?: string | null
    comment?: string | null
    publicComment?: boolean
  },
) => {
  return tx.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: data.fromStatus ?? null,
      toStatus: data.toStatus,
      fromOperational: data.fromOperational ?? null,
      toOperational: data.toOperational ?? null,
      actorId: data.actorId ?? null,
      actorType: data.actorType ?? "STAFF",
      actorName: data.actorName ?? null,
      comment: data.comment ?? null,
      publicComment: data.publicComment ?? false,
    },
  })
}

/** Charge une commande avec les données nécessaires aux décisions d'action. */
const loadActionOrder = async (
  client: Pick<Prisma.TransactionClient, "order">,
  id: string,
) => {
  const order = await client.order.findFirst({
    where: { OR: [{ id }, { trackingCode: id }, { orderNumber: id }] },
    include: {
      items: true,
      group: true,
      assignments: {
        where: { active: true },
        select: { staffId: true, active: true, isLead: true },
      },
    },
  })
  if (!order) throw notFound("Commande introuvable.")
  return order
}

/** Statut de commande après une action, pour les appels hérités. */
const loadOrderForUpdate = async (tx: Tx, id: string) =>
  tx.order
    .findFirst({
      where: { OR: [{ id }, { trackingCode: id }, { orderNumber: id }] },
      include: { items: true, group: true },
    })
    .then((order) => {
      if (!order) throw notFound("Commande introuvable.")
      return order
    })

const assertOrderAction = (
  order: {
    status: Order["status"]
    fulfillmentMode: Order["fulfillmentMode"]
    assignments: Array<{ staffId: string ,active: boolean , isLead: boolean }>
  },
  action: OrderAction,
  user: { id: string , role: StaffRole },
) => {
  const context: OrderActionContext = {
    status: order.status,
    fulfillmentMode: order.fulfillmentMode,
    assignments: order.assignments,
  }
  if (!hasOrderAction(context, user, action)) {
    throw forbidden(
      action === "start"
        ? "Cette action est réservée au chef d’équipe."
        : action === "deliver" || action === "fail"
          ? "Cette action est réservée aux intervenants affectés à la commande."
          : "Votre rôle ne permet pas cette action sur le statut actuel de la commande.",
    )
  }
}

const restoreOrderStock = async (
  tx: Tx,
  order: {
    id: string
    orderNumber: string
    stockRestored: boolean
    items: OrderItem[]
  },
  actorId?: string,
) => {
  if (order.stockRestored) return
  for (const item of order.items) {
    if (!item.productId) continue
    const product = await tx.product.findUnique({
      where: { id: item.productId },
    })
    if (!product?.manageStock) continue
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    })
    await tx.inventoryMovement.create({
      data: {
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        reason: `Annulation ${order.orderNumber}`,
        actorId,
      },
    })
  }
}

type TransitionOptions = {
  user: { id: string , name: string , role?: StaffRole }
  actorType?: string
  comment?: string | null
  publicComment?: boolean
  event?: "STARTED" | "DELIVERED" | "FAILED"
}

/**
 * Applique une transition de statut de façon atomique : la mise à jour n'est
 * acceptée que si le statut est encore celui lu juste avant (protection contre
 * les doubles clics et les requêtes concurrentes). L'historique est écrit dans
 * la même transaction.
 */
const applyTransition = async (
  tx: Tx,
  order: {
    id: string
    status: Order["status"]
    operationalStatus: Order["operationalStatus"]
  },
  to: Order["status"],
  data: Prisma.OrderUpdateManyMutationInput,
  options: TransitionOptions,
) => {
  const changed = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data: {
      status: to,
      operationalStatus: derivedOperationalStatus(to),
      ...data,
    },
  })
  if (changed.count !== 1) {
    throw conflict(
      "La commande a changé de statut entre-temps. Rechargez la fiche avant de réessayer.",
    )
  }
  await addHistory(tx, order.id, {
    fromStatus: order.status,
    toStatus: to,
    fromOperational: order.operationalStatus,
    toOperational: derivedOperationalStatus(to),
    actorId: options.user.id,
    actorType: options.actorType ?? "STAFF",
    actorName: options.user.name,
    comment: options.comment ?? null,
    publicComment: options.publicComment ?? false,
  })
  if (options.event) {
    await tx.fulfillmentEvent.create({
      data: {
        orderId: order.id,
        type: options.event,
        actorId: options.user.id,
        comment: options.comment ?? undefined,
      },
    })
  }
  return tx.order.findUniqueOrThrow({ where: { id: order.id } })
}

export const confirmOrder = async (
  id: string,
  comment: string | undefined,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadActionOrder(prisma, id)
  assertOrderAction(order, "confirm", user)
  const confirmedAt = new Date()
  const pickupDeadlineAt =
    order.fulfillmentMode === "RETRAIT_AGENCE"
      ? pickupDeadlineFrom(confirmedAt)
      : null

  const updated = await prisma.$transaction(async (tx) =>
    applyTransition(
      tx,
      order,
      "COMMANDE_ACCEPTEE",
      { confirmedAt, pickupDeadlineAt },
      {
        user,
        comment:
          comment?.trim() || "Commande confirmée après contact avec le client.",
        publicComment: true,
      },
    ),
  )

  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_CONFIRMED",
    entity: "Order",
    entityId: order.id,
    metadata: {
      orderNumber: order.orderNumber,
      comment,
      pickupDeadlineAt: pickupDeadlineAt?.toISOString() ?? null,
    },
    ip,
    userAgent,
  })
  return updated
}

export const cancelOrder = async (
  id: string,
  reason: string,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadActionOrder(prisma, id)
  assertOrderAction(order, "cancel", user)
  const transition = canTransitionStatus(
    order.status,
    "ANNULEE",
    closureContext(order),
  )
  if (!transition.allowed)
    throw conflict(transition.reason ?? "Annulation impossible.")

  const updated = await prisma.$transaction(async (tx) => {
    await restoreOrderStock(tx, order, user.id)
    return applyTransition(
      tx,
      order,
      "ANNULEE",
      {
        cancelledAt: new Date(),
        cancellationReason: reason,
        stockRestored: true,
      },
      { user, comment: reason, publicComment: true },
    )
  })

  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_CANCELLED",
    entity: "Order",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, reason },
    ip,
    userAgent,
  })
  return updated
}

/**
 * Annule les retraits en agence dont l'échéance de 72 h est dépassée.
 * Idempotent : la mise à jour conditionnelle ne s'applique qu'une fois et
 * n'annule jamais une commande déjà retirée, rejetée ou annulée.
 */
export const expireUncollectedPickupOrders = async (now = new Date()) => {
  const legacyDeadline = new Date(now.getTime() - PICKUP_TIMEOUT_MS)
  const expiredWhere: Prisma.OrderWhereInput = {
    fulfillmentMode: "RETRAIT_AGENCE",
    status: "COMMANDE_ACCEPTEE",
    fulfillmentCompletedAt: null,
    OR: [
      { pickupDeadlineAt: { lte: now } },
      { pickupDeadlineAt: null, confirmedAt: { lte: legacyDeadline } },
    ],
  }
  const candidates = await prisma.order.findMany({
    where: expiredWhere,
    select: { id: true },
  })
  let expiredCount = 0

  for (const candidate of candidates) {
    const expiredOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: candidate.id },
        include: { items: true },
      })
      if (!order) return null
      const changed = await tx.order.updateMany({
        where: { id: order.id, ...expiredWhere },
        data: {
          status: "ANNULEE",
          cancelledAt: now,
          cancellationReason: PICKUP_EXPIRED_REASON,
          stockRestored: true,
          operationalStatus: derivedOperationalStatus("ANNULEE"),
        },
      })
      if (changed.count === 0) return null
      await restoreOrderStock(tx, order)
      await addHistory(tx, order.id, {
        fromStatus: order.status,
        toStatus: "ANNULEE",
        fromOperational: order.operationalStatus,
        toOperational: derivedOperationalStatus("ANNULEE"),
        actorType: "SYSTEM",
        actorName: "Système",
        comment: PICKUP_EXPIRED_REASON,
        publicComment: true,
      })
      return order
    })

    if (!expiredOrder) continue
    expiredCount += 1
    await audit({
      actorType: "SYSTEM",
      action: "PICKUP_ORDER_EXPIRED",
      entity: "Order",
      entityId: expiredOrder.id,
      metadata: {
        orderNumber: expiredOrder.orderNumber,
        confirmedAt: expiredOrder.confirmedAt?.toISOString(),
        pickupDeadlineAt: expiredOrder.pickupDeadlineAt?.toISOString(),
      },
    })
  }

  return { expired: expiredCount }
}

export const rejectOrder = async (
  id: string,
  reason: string,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadActionOrder(prisma, id)
  assertOrderAction(order, "reject", user)
  const trimmedReason = reason.trim()
  if (trimmedReason.length < 3)
    throw badRequest("Un motif de rejet est obligatoire.")

  const updated = await prisma.$transaction(async (tx) => {
    await restoreOrderStock(tx, order, user.id)
    return applyTransition(tx, order, "REJETEE", { stockRestored: true }, {
      user,
      comment: trimmedReason,
      publicComment: true,
    })
  })

  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_REJECTED",
    entity: "Order",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, reason: trimmedReason },
    ip,
    userAgent,
  })
  return updated
}

/**
 * « Démarrer la course » : réservé au chef d'équipe actif désigné lors de
 * l'affectation. Le contrôle est refait ici, donc un appel direct à l'API par
 * un intervenant non chef est refusé.
 */
export const startOrderCourse = async (
  id: string,
  comment: string | undefined,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadActionOrder(prisma, id)
  assertOrderAction(order, "start", user)

  const updated = await prisma.$transaction(async (tx) =>
    applyTransition(tx, order, "COMMANDE_EN_COURS_DE_LIVRAISON", {}, {
      user,
      comment: comment?.trim() || "Course démarrée par l’équipe affectée.",
      publicComment: true,
      event: "STARTED",
    }),
  )

  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_COURSE_STARTED",
    entity: "Order",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber },
    ip,
    userAgent,
  })
  return updated
}

/** Valide la livraison : la commande devient LIVREE et le workflow se ferme. */
export const completeOrderDelivery = async (
  id: string,
  input: z.infer<typeof deliveryOutcomeSchema>,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadActionOrder(prisma, id)
  assertOrderAction(order, "deliver", user)
  const cashToRegularize =
    order.customerPaymentChoice === "ESPECES" && !isFullyPaid(order)
  const mobilePaymentDeclared =
    (order.customerPaymentChoice === "FLOOZ" ||
      order.customerPaymentChoice === "MIXX_BY_YAS") &&
    !isFullyPaid(order)
  const canValidateWithoutFullPayment =
    cashToRegularize || mobilePaymentDeclared
  if (
    canValidateWithoutFullPayment &&
    !order.assignments.some(
      (assignment) => assignment.isLead && assignment.staffId === user.id,
    )
  ) {
    throw forbidden(
      "Seul le chef d’équipe peut confirmer la livraison pour un paiement déclaré (espèces ou mobile).",
    )
  }
  if (!canValidateWithoutFullPayment)
    assertFullyPaidForClosure(order, "valider la livraison")
  const now = new Date()

  const updated = await prisma.$transaction(async (tx) =>
    applyTransition(
      tx,
      order,
      "LIVREE",
      {
        fulfillmentCompletedAt: order.fulfillmentCompletedAt ?? now,
        ...(isFullyPaid(order) ? { closedAt: now } : {}),
      },
      {
        user,
        comment:
          input.comment?.trim() ||
          (cashToRegularize
            ? "Livraison confirmée; encaissement en espèces à régulariser au retour de l’équipe."
            : mobilePaymentDeclared
              ? "Livraison confirmée; paiement mobile déclaré par le client, capture à vérifier."
              : "Livraison confirmée auprès du client."),
        publicComment: true,
        event: "DELIVERED",
      },
    ),
  )

  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_DELIVERED",
    entity: "Order",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, comment: input.comment },
    ip,
    userAgent,
  })
  return updated
}

/** Déclare un échec de livraison avec motif obligatoire (jamais LIVREE). */
export const failOrderDelivery = async (
  id: string,
  input: z.infer<typeof deliveryOutcomeSchema>,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadActionOrder(prisma, id)
  assertOrderAction(order, "fail", user)
  const reason = input.comment?.trim()
  if (!reason)
    throw badRequest(
      "Un motif est obligatoire pour déclarer un échec de livraison.",
    )

  const updated = await prisma.$transaction(async (tx) =>
    applyTransition(tx, order, "ECHEC_LIVRAISON", {}, {
      user,
      comment: reason,
      publicComment: true,
      event: "FAILED",
    }),
  )

  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_DELIVERY_FAILED",
    entity: "Order",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, reason },
    ip,
    userAgent,
  })
  return updated
}

/**
 * « Confirmer le retrait » : uniquement pour une commande RETRAIT_AGENCE déjà
 * acceptée. Elle devient LIVREE (affichée « Retirée en agence »), sans passer
 * par la préparation, l'affectation ou la livraison.
 */
export const confirmOrderPickup = async (
  id: string,
  input: z.infer<typeof pickupSchema>,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadActionOrder(prisma, id)
  assertOrderAction(order, "pickup", user)
  assertFullyPaidForClosure(order, "confirmer le retrait")
  const now = new Date()

  const updated = await prisma.$transaction(async (tx) =>
    applyTransition(
      tx,
      order,
      "LIVREE",
      {
        fulfillmentCompletedAt: now,
        closedAt: now,
        pickupDeadlineAt: order.pickupDeadlineAt ?? null,
      },
      {
        user,
        comment:
          input.comment?.trim() || "Commande retirée en agence par le client.",
        publicComment: true,
        event: "DELIVERED",
      },
    ),
  )

  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_PICKED_UP",
    entity: "Order",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, comment: input.comment },
    ip,
    userAgent,
  })
  return updated
}

/**
 * Endpoint hérité `PATCH /orders/:id/status` : ne permet plus que les trois
 * transitions commerciales, déléguées aux actions dédiées.
 */
export const updateOrderStatus = async (
  id: string,
  input: z.infer<typeof statusUpdateSchema>,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  if (input.status === "ANNULEE") {
    if (!input.comment?.trim())
      throw badRequest("Un motif est obligatoire pour annuler une commande.")
    return cancelOrder(id, input.comment.trim(), user, ip, userAgent)
  }
  if (input.status === "COMMANDE_ACCEPTEE") {
    return confirmOrder(id, input.comment, user, ip, userAgent)
  }
  if (input.status === "REJETEE") {
    if (!input.comment?.trim())
      throw badRequest("Un motif est obligatoire pour rejeter une commande.")
    return rejectOrder(id, input.comment.trim(), user, ip, userAgent)
  }
  throw forbidden(
    "Ce statut doit être atteint via l’action dédiée (affectation, démarrage de course, livraison ou retrait).",
  )
}

const roleLabelForAssignment = (role: StaffRole) =>
  role === "TECHNICIAN" ? "technicien" : "livreur"

export const assignOrder = async (
  id: string,
  input: z.infer<typeof assignSchema>,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadActionOrder(prisma, id)
  assertOrderAction(order, "assign", user)
  const staffIds = [
    ...new Set(input.staffIds ?? (input.staffId ? [input.staffId] : [])),
  ]
  if (staffIds.length === 0)
    throw badRequest("Sélectionnez au moins un intervenant.")
  const leadStaffId = input.leadStaffId ?? staffIds[0]
  if (!staffIds.includes(leadStaffId)) {
    throw unprocessable(
      "Le chef du groupe doit faire partie des intervenants sélectionnés.",
    )
  }

  const staff = await prisma.user.findMany({
    where: { id: { in: staffIds }, active: true },
  })
  if (staff.length !== staffIds.length) {
    throw notFound(
      "Un ou plusieurs membres du personnel sont introuvables ou inactifs.",
    )
  }
  if (
    staff.some(
      (member) => member.role !== "DELIVERY" && member.role !== "TECHNICIAN",
    )
  ) {
    throw unprocessable(
      "Seuls les livreurs et les techniciens peuvent être affectés à une commande.",
    )
  }

  const requiredRoles = requiredAssignmentRoles(order)
  const selectedRoles = new Set(staff.map((member) => member.role))
  const missingRoles = requiredRoles.filter((role) => !selectedRoles.has(role))
  if (missingRoles.length > 0) {
    throw unprocessable(
      `Affectation incomplète : ${missingRoles.map(roleLabelForAssignment).join(" et ")} requis pour cette commande.`,
    )
  }

  const teamDescription = staff
    .map(
      (member) =>
        `${member.name} (${roleLabelForAssignment(member.role)})${
          member.id === leadStaffId ? " — chef" : ""
        }`,
    )
    .join(", ")

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.deliveryAssignment.updateMany({
      where: { orderId: order.id, active: true },
      data: { active: false, endedAt: new Date() },
    })
    const created = []
    for (const member of staff) {
      created.push(
        await tx.deliveryAssignment.create({
          data: {
            orderId: order.id,
            staffId: member.id,
            type: assignmentTypeForRole(member.role) as AssignmentType,
            assignedById: user.id,
            instructions: input.instructions,
            isLead: member.id === leadStaffId,
          },
          include: {
            staff: {
              select: { id: true, name: true, role: true, phone: true },
            },
          },
        }),
      )
    }
    const changed = await tx.order.updateMany({
      where: { id: order.id, status: "COMMANDE_ACCEPTEE" },
      data: {
        status: "COMMANDE_EN_PREPARATION",
        operationalStatus: derivedOperationalStatus("COMMANDE_EN_PREPARATION"),
        assignedToId: leadStaffId,
      },
    })
    if (changed.count !== 1) {
      throw conflict(
        "La commande a changé de statut entre-temps. Rechargez la fiche avant de réessayer.",
      )
    }
    await addHistory(tx, order.id, {
      fromStatus: "COMMANDE_ACCEPTEE",
      toStatus: "COMMANDE_EN_PREPARATION",
      fromOperational: order.operationalStatus,
      toOperational: derivedOperationalStatus("COMMANDE_EN_PREPARATION"),
      actorId: user.id,
      actorName: user.name,
      comment: `Affectation à ${staff.length} intervenant(s) : ${teamDescription}.`,
      publicComment: true,
    })
    for (const member of staff) {
      await tx.fulfillmentEvent.create({
        data: {
          orderId: order.id,
          type: "ASSIGNED",
          actorId: user.id,
          comment: `Affectation à ${member.name} (${assignmentTypeForRole(member.role)})${
            member.id === leadStaffId ? ", chef d’équipe" : ""
          }.`,
        },
      })
    }
    return created
  })

  for (const member of assignment) {
    try {
      await enqueueStaffAssignmentNotification(
        order,
        member.staff.id,
        member.staff.name,
      )
    } catch (error) {
      logger.error(
        { err: error, orderId: order.id, staffId: member.staff.id },
        "Impossible de notifier l’intervenant affecté",
      )
    }
  }

  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_ASSIGNED",
    entity: "Order",
    entityId: order.id,
    metadata: {
      orderNumber: order.orderNumber,
      staffIds,
      leadStaffId,
      requiredRoles,
      instructions: input.instructions,
    },
    ip,
    userAgent,
  })
  return {
    ...assignment.find((item) => item.isLead)!,
    team: assignment,
  }
}

export const addOrderNote = async (
  id: string,
  body: string,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await prisma.order.findFirst({
    where: { OR: [{ id }, { trackingCode: id }, { orderNumber: id }] },
  })
  if (!order) throw notFound("Commande introuvable.")
  const note = await prisma.orderNote.create({
    data: { orderId: order.id, authorId: user.id, body },
    include: { author: { select: { name: true } } },
  })
  await audit({
    actorId: user.id,
    actorType: "STAFF",
    action: "ORDER_NOTE_ADDED",
    entity: "Order",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber },
    ip,
    userAgent,
  })
  return note
}

export const recordPayment = async (
  id: string,
  input: z.infer<typeof paymentSchema>,
  user: { id: string , name: string , role: StaffRole },
  ip?: string,
  userAgent?: string,
) => {
  const order = await loadOrderForUpdate(prisma, id)
  if (user.role === "DELIVERY" && !env.DELIVERY_CAN_RECORD_PAYMENT) {
    throw forbidden("L’encaissement n’est pas autorisé pour ce rôle.")
  }
  if (user.role === "TECHNICIAN")
    throw forbidden("Un technicien ne peut pas confirmer un paiement.")
  if (order.status === "LIVREE") {
    if (user.role !== "COMMERCIAL" && user.role !== "DIRECTOR") {
      throw forbidden(
        "Seul le commercial ou le directeur peut enregistrer la remise des espèces au retour de l’équipe.",
      )
    }
    if (
      order.fulfillmentMode !== "LIVRAISON" ||
      order.customerPaymentChoice !== "ESPECES" ||
      input.method !== "ESPECES"
    ) {
      throw forbidden(
        "La régularisation après livraison est réservée aux espèces déclarées à la livraison.",
      )
    }
  } else if (
    order.fulfillmentMode === "LIVRAISON" &&
    order.customerPaymentChoice === "ESPECES" &&
    input.method === "ESPECES" &&
    order.status === "COMMANDE_EN_COURS_DE_LIVRAISON"
  ) {
    throw forbidden(
      "Les espèces de la livraison sont enregistrées au bureau après le retour de l’équipe.",
    )
  }
  if (user.role === "DELIVERY") {
    const assignment = await prisma.deliveryAssignment.findFirst({
      where: { orderId: order.id, staffId: user.id, active: true },
      select: { id: true },
    })
    if (!assignment)
      throw forbidden("Cette commande ne vous est pas attribuée.")
  }

  const allowed = canRecordPayment({
    status: order.status,
    total: order.total,
    paidAmount: order.paidAmount,
    amount: input.amount,
    fulfillmentMode: order.fulfillmentMode,
    customerPaymentChoice: order.customerPaymentChoice,
  })
  if (!allowed.allowed) throw conflict(allowed.reason ?? "Paiement impossible.")

  const idempotencyKey =
    input.idempotencyKey?.trim() ||
    `manual:${order.id}:${Date.now()}:${user.id}`

  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey },
  })
  if (existing) {
    if (existing.orderId !== order.id || existing.amount !== input.amount) {
      throw conflict(
        "Cette clé d’idempotence a déjà été utilisée pour un autre paiement.",
      )
    }
    const currentOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    })
    return { created: existing, order: currentOrder }
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        orderId: order.id,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        receivedById: user.id,
        idempotencyKey,
      },
    })
    const paidAmount = order.paidAmount + input.amount
    const paymentStatus = computePaymentStatus(order.total, paidAmount)

    const next = await tx.order.update({
      where: { id: order.id },
      data: {
        paidAmount,
        paymentStatus,
        ...(order.status === "LIVREE" && paidAmount >= order.total
          ? { closedAt: new Date() }
          : {}),
      },
    })

    await tx.fulfillmentEvent.create({
      data: {
        orderId: order.id,
        type: "PAYMENT_RECEIVED",
        actorId: user.id,
        comment:
          order.status === "LIVREE"
            ? `${formatFcfa(input.amount)} remis par l’équipe au bureau (${input.method}).`
            : `${formatFcfa(input.amount)} encaissés (${input.method}).`,
      },
    })
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorType: "STAFF",
        action: "PAYMENT_RECORDED",
        entity: "Payment",
        entityId: created.id,
        metadata: {
          orderNumber: order.orderNumber,
          amount: input.amount,
          method: input.method,
          reference: input.reference,
          idempotencyKey,
          ...(order.status === "LIVREE" ? { stage: "TEAM_CASH_HANDOVER" } : {}),
        },
        ip,
        userAgent,
      },
    })

    return { created, order: next }
  })
  // Notifier celui qui a remis la somme (chef d'équipe) que l'encaissement
  // a été enregistré par le commercial ou le directeur.
  if (order.status === "LIVREE" && input.method === "ESPECES") {
    await enqueueCashPaymentRecordedNotification(payment.order, input.amount, {
      id: user.id,
      name: user.name,
    }).catch(() => undefined)
  }
  return payment
}

export const orderSummary = (
  order: OrderWithDetails,
  user: { id: string , name: string , role: StaffRole },
) => ({
  ...order,
  remainingDue: remainingDue(order.total, order.paidAmount),
  closureAllowed:
    isFullyPaid(order) &&
    order.status === "LIVREE" &&
    Boolean(order.fulfillmentCompletedAt),
  availableActions: availableOrderActions(
    {
      status: order.status,
      fulfillmentMode: order.fulfillmentMode,
      assignments: order.assignments.map((assignment) => ({
        staffId: assignment.staffId,
        active: assignment.active,
        isLead: assignment.isLead,
      })),
    },
    user,
  ),
})
