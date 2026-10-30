import { Prisma } from "@prisma/client"
import { prisma } from "../../db/prisma.js"
import { env } from "../../config/env.js"
import { badRequest, notFound, unauthorized } from "../../lib/errors.js"
import {
  hashPhone,
  normalizePhone,
  randomToken,
  sha256,
} from "../../lib/ids.js"
import { formatFcfa } from "../../lib/money.js"
import {
  operationalLabel,
  orderStatusLabel,
  statusLabel,
} from "../orders/stateMachine.js"
import { realtime } from "../../realtime/events.js"
import { enqueuePaymentValidationNotification } from "../notifications/service.js"
import { toMessageData, type ChatMessageInput } from "../messaging/schemas.js"

type TrackingPaymentChoice = { choice: "ESPECES" } | {
  choice: "FLOOZ" | "MIXX_BY_YAS"
  phone: string
}

const findOrderByCode = async (code: string) => {
  const order = await prisma.order.findUnique({
    where: { trackingCode: code.trim().toUpperCase() },
    include: {
      items: true,
      history: {
        where: { publicComment: true },
        orderBy: { createdAt: "asc" },
      },
      group: {
        include: {
          orders: {
            select: { orderNumber: true, categoryType: true, status: true },
          },
        },
      },
    },
  })
  if (!order) throw notFound("Code de suivi introuvable.")
  return order
}

export const publicTracking = async (code: string) => {
  const order = await findOrderByCode(code)
  return {
    groupRef: order.group.publicRef,
    orderNumber: order.orderNumber,
    trackingCode: order.trackingCode,
    categoryType: order.categoryType,
    status: order.status,
    statusLabel: orderStatusLabel(order.status, order.fulfillmentMode),
    paymentStatus: order.paymentStatus,
    operationalStatus: order.operationalStatus,
    operationalLabel: operationalLabel[order.operationalStatus],
    fulfillmentMode: order.fulfillmentMode,
    customerPaymentChoice: order.customerPaymentChoice,
    customerPaymentChoiceAt: order.customerPaymentChoiceAt,
    requiresTechnician: order.requiresTechnician,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    total: order.total,
    totalLabel: formatFcfa(order.total),
    items: order.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    timeline: order.history.map((entry) => ({
      status: entry.toStatus,
      statusLabel: statusLabel[entry.toStatus],
      comment: entry.comment,
      createdAt: entry.createdAt,
    })),
    otherOrders: order.group.orders
      .filter((sibling) => sibling.orderNumber !== order.orderNumber)
      .map((sibling) => ({
        orderNumber: sibling.orderNumber,
        categoryType: sibling.categoryType,
        status: sibling.status,
        statusLabel: statusLabel[sibling.status],
      })),
    access: {
      conversationProtected: true,
      message:
        "La messagerie est protégée par la vérification du numéro de téléphone utilisé lors de la commande.",
    },
  }
}

export const createTrackingAccess = async (code: string, phone: string) => {
  const order = await findOrderByCode(code)
  const providedHash = hashPhone(phone)
  const expectedHashes = [
    hashPhone(order.customerPhone),
    order.customerWhatsapp ? hashPhone(order.customerWhatsapp) : null,
  ].filter(Boolean) as string[]

  if (!expectedHashes.includes(providedHash)) {
    // Message générique pour empêcher l'énumération des codes et des numéros.
    throw notFound("Code de suivi ou numéro de téléphone invalide.")
  }

  const token = randomToken(32)
  const expiresAt = new Date(
    Date.now() + env.TRACKING_ACCESS_TTL_HOURS * 60 * 60 * 1000,
  )
  await prisma.trackingAccess.create({
    data: {
      orderId: order.id,
      tokenHash: sha256(token),
      phoneHash: providedHash,
      expiresAt,
    },
  })
  return {
    token,
    expiresAt,
    orderNumber: order.orderNumber,
    trackingCode: order.trackingCode,
  }
}

export const setTrackingPaymentChoice = async (
  code: string,
  token: string | undefined,
  input: TrackingPaymentChoice,
  ip?: string,
  userAgent?: string,
) => {
  const order = await verifyToken(code, token)
  if (
    order.fulfillmentMode !== "LIVRAISON" ||
    order.status !== "COMMANDE_EN_COURS_DE_LIVRAISON"
  ) {
    throw badRequest(
      "Le choix du paiement est disponible lorsque la livraison est en cours.",
    )
  }
  const now = new Date()
  const phone = input.choice === "ESPECES" ? null : (input.phone ?? null)
  const lastFour = phone?.slice(-4)
  const idempotencyKey = `tracking-mobile:${order.id}:${sha256(token ?? "")}`

  if (input.choice !== "ESPECES") {
    const existing = await prisma.payment.findUnique({
      where: { idempotencyKey },
    })
    if (existing) {
      const current = await prisma.order.findUniqueOrThrow({
        where: { id: existing.orderId },
      })
      return {
        choice: current.customerPaymentChoice ?? input.choice,
        paymentStatus: current.paymentStatus,
        paidAmount: current.paidAmount,
        paymentId: existing.id,
      }
    }
  }
  if (order.paidAmount >= order.total) {
    throw badRequest("Cette commande est déjà intégralement payée.")
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
      })
      if (
        current.status !== "COMMANDE_EN_COURS_DE_LIVRAISON" ||
        current.fulfillmentMode !== "LIVRAISON"
      ) {
        throw badRequest(
          "Le choix du paiement est disponible lorsque la livraison est en cours.",
        )
      }
      if (current.paidAmount >= current.total) {
        throw badRequest("Cette commande est déjà intégralement payée.")
      }

      const remaining = current.total - current.paidAmount
      if (input.choice === "ESPECES") {
        if (current.customerPaymentChoice === "ESPECES") {
          return {
            choice: input.choice,
            paymentStatus: current.paymentStatus,
            paidAmount: current.paidAmount,
            customerPaymentChoiceAt: current.customerPaymentChoiceAt,
          }
        }
        await tx.order.update({
          where: { id: current.id },
          data: {
            customerPaymentChoice: input.choice,
            customerPaymentPhone: null,
            customerPaymentChoiceAt: now,
          },
        })
        await tx.fulfillmentEvent.create({
          data: {
            orderId: current.id,
            type: "PAYMENT_CHOICE_SELECTED",
            comment:
              "Le client a choisi le paiement en espèces à la livraison.",
          },
        })
        await tx.auditLog.create({
          data: {
            actorType: "CLIENT",
            action: "CUSTOMER_PAYMENT_CHOICE_SET",
            entity: "Order",
            entityId: current.id,
            metadata: {
              orderNumber: current.orderNumber,
              choice: input.choice,
            },
            ip,
            userAgent,
          },
        })
        await enqueuePaymentValidationNotification(order)
        return {
          choice: input.choice,
          paymentStatus: current.paymentStatus,
          paidAmount: current.paidAmount,
        }
      }

      await tx.order.update({
        where: { id: current.id },
        data: {
          customerPaymentChoice: input.choice,
          customerPaymentPhone: phone ?? null,
          customerPaymentChoiceAt: now,
        },
      })
      await tx.fulfillmentEvent.create({
        data: {
          orderId: current.id,
          type: "PAYMENT_CHOICE_SELECTED",
          comment:
            "Le client a choisi le paiement " + input.choice + " (mobile money). " +
            "En attente de la capture dans le chat pour validation par le chef d'equipe.",
        },
      })
      await tx.auditLog.create({
        data: {
          actorType: "CLIENT",
          action: "CUSTOMER_MOBILE_MONEY_DECLARED",
          entity: "Order",
          entityId: current.id,
          metadata: {
            orderNumber: current.orderNumber,
            choice: input.choice,
            phoneLastFour: lastFour,
            verification: "CUSTOMER_DECLARATION",
          },
          ip,
          userAgent,
        },
      })
      await enqueuePaymentValidationNotification(order)
      return {
        choice: input.choice,
        paymentStatus: current.paymentStatus,
        paidAmount: current.paidAmount,
      }
    })
  } catch (error) {
    if (
      input.choice !== "ESPECES" &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey },
      })
      if (existing) {
        const current = await prisma.order.findUniqueOrThrow({
          where: { id: existing.orderId },
        })
        return {
          choice: current.customerPaymentChoice ?? input.choice,
          paymentStatus: current.paymentStatus,
          paidAmount: current.paidAmount,
          paymentId: existing.id,
        }
      }
    }
    throw error
  }
}
const verifyToken = async (code: string, token: string | undefined) => {
  if (!token)
    throw unauthorized(
      "Un code d’accès est requis pour consulter la conversation.",
    )
  const access = await prisma.trackingAccess.findUnique({
    where: { tokenHash: sha256(token) },
    include: { order: true },
  })
  if (
    !access ||
    access.revokedAt ||
    access.expiresAt.getTime() < Date.now() ||
    access.order.trackingCode !== code.trim().toUpperCase()
  ) {
    throw unauthorized(
      "Accès expiré ou invalide. Vérifiez à nouveau votre numéro de téléphone.",
    )
  }
  await prisma.trackingAccess.update({
    where: { id: access.id },
    data: { lastUsedAt: new Date() },
  })
  return access.order
}

const clientConversation = async (orderId: string) => {
  let conversation = await prisma.conversation.findUnique({
    where: { orderId_visibility: { orderId, visibility: "CLIENT" } },
  })
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        orderId,
        visibility: "CLIENT",
        participants: {
          create: [{ role: "STAFF", displayName: "Service client Allo Togo" }],
        },
      },
    })
  }
  return conversation
}

export const getTrackingMessages = async (
  code: string,
  token: string | undefined,
) => {
  const order = await verifyToken(code, token)
  const conversation = await clientConversation(order.id)
  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 200,
  })
  return {
    conversationId: conversation.id,
    messages: messages.map((message) => ({
      id: message.id,
      authorType: message.authorType,
      authorName: message.authorName,
      body: message.body,
      kind: message.kind,
      audioData: message.audioData,
      mediaData: message.mediaData,
      mediaMimeType: message.mediaMimeType,
      mediaName: message.mediaName,
      mediaSize: message.mediaSize,
      durationMs: message.durationMs,
      latitude: message.latitude,
      longitude: message.longitude,
      accuracy: message.accuracy,
      locationLabel: message.locationLabel,
      createdAt: message.createdAt,
    })),
  }
}

export const sendTrackingMessage = async (
  code: string,
  token: string | undefined,
  input: ChatMessageInput,
) => {
  const order = await verifyToken(code, token)
  const conversation = await clientConversation(order.id)
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      authorType: "CLIENT",
      authorName: order.customerName,
      ...toMessageData(input),
    },
  })
  realtime.emit("message:new", {
    orderId: order.id,
    conversationId: conversation.id,
    visibility: "CLIENT",
    message: {
      id: message.id,
      authorType: message.authorType,
      authorName: message.authorName,
      body: message.body,
      kind: message.kind,
      audioData: message.audioData,
      mediaData: message.mediaData,
      mediaMimeType: message.mediaMimeType,
      mediaName: message.mediaName,
      mediaSize: message.mediaSize,
      durationMs: message.durationMs,
      latitude: message.latitude,
      longitude: message.longitude,
      accuracy: message.accuracy,
      locationLabel: message.locationLabel,
      createdAt: message.createdAt.toISOString(),
    },
  })
  return message
}

export const normalizeTrackingCode = (code: string) => {
  const normalized = code.trim().toUpperCase()
  if (!/^[A-HJ-NP-Z2-9]{6,20}$/.test(normalized)) {
    throw badRequest("Format de code de suivi invalide.")
  }
  return normalized
}

export const maskPhone = (phone: string) => {
  const normalized = normalizePhone(phone)
  return normalized.length > 4
    ? `${"•".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`
    : "••••"
}
