import { createHmac } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prisma } from "../../db/prisma.js"
import { env } from "../../config/env.js"
import { AppError, badRequest, conflict, notFound } from "../../lib/errors.js"
import { formatFcfa } from "../../lib/money.js"
import { audit } from "../audit/service.js"
import { PAYABLE_ORDER_STATUSES } from "../orders/stateMachine.js"
import { getBictorysProvider } from "./bictorys.js"

export const createBictorysAttempt = async (
  orderId: string,
  actor: { id: string , name: string },
  ip?: string,
  userAgent?: string,
) => {
  if (!env.BICTORYS_ENABLED) {
    throw new AppError(
      503,
      "BICTORYS_DISABLED",
      "Le paiement Bictorys n’est pas activé pour cet environnement.",
    )
  }
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { id: orderId },
        { trackingCode: orderId },
        { orderNumber: orderId },
      ],
    },
  })
  if (!order) throw notFound("Commande introuvable.")
  if (order.status === "ANNULEE")
    throw conflict("Impossible de payer une commande annulée.")
  if (!PAYABLE_ORDER_STATUSES.includes(order.status)) {
    throw conflict(
      "Le paiement en ligne doit être initié avant la validation de la livraison ou du retrait.",
    )
  }
  if (order.paymentStatus === "PAYE" || order.paidAmount >= order.total) {
    throw conflict("Cette commande est déjà intégralement payée.")
  }

  const remaining = order.total - order.paidAmount
  if (remaining <= 0) throw conflict("Aucun solde à régler.")

  const existing = await prisma.paymentAttempt.findFirst({
    where: {
      orderId: order.id,
      provider: "bictorys",
      status: "PENDING",
      amount: remaining,
    },
    orderBy: { createdAt: "desc" },
  })
  if (existing) return existing

  const provider = getBictorysProvider()
  const result = await provider.createAttempt({
    orderId: order.id,
    amount: remaining,
    currency: "XOF",
    reference: order.orderNumber,
  })

  const attempt = await prisma.$transaction(async (tx) => {
    const created = await tx.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: "bictorys",
        providerRef: result.providerRef,
        amount: remaining,
        checkoutUrl: result.checkoutUrl,
        status: "PENDING",
      },
    })
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: "PAIEMENT_EN_COURS" },
    })
    return created
  })

  await audit({
    actorId: actor.id,
    actorType: "STAFF",
    action: "BICTORYS_ATTEMPT_CREATED",
    entity: "PaymentAttempt",
    entityId: attempt.id,
    metadata: {
      orderNumber: order.orderNumber,
      amount: remaining,
      providerRef: attempt.providerRef,
    },
    ip,
    userAgent,
  })
  return attempt
}

const applySuccessfulPayment = async (
  attemptId: string,
  providerRef: string,
) => {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: { order: true },
    })
    if (!attempt) throw notFound("Tentative de paiement introuvable.")
    if (attempt.status === "SUCCEEDED")
      return { alreadyProcessed: true, order: attempt.order }

    const order = attempt.order
    if (order.status === "ANNULEE")
      throw conflict("La commande a été annulée entre-temps.")
    const idempotencyKey = `bictorys:${providerRef}`
    const existingPayment = await tx.payment.findUnique({
      where: { idempotencyKey },
    })
    if (existingPayment) {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "SUCCEEDED" },
      })
      return { alreadyProcessed: true, order }
    }

    const paidAmount = order.paidAmount + attempt.amount
    if (paidAmount > order.total) {
      throw badRequest(
        "Le montant de la notification dépasse le total de la commande.",
      )
    }
    const paymentStatus =
      paidAmount >= order.total ? "PAYE" : "PARTIELLEMENT_PAYE"
    await tx.payment.create({
      data: {
        orderId: order.id,
        amount: attempt.amount,
        method: "BICTORYS",
        reference: providerRef,
        idempotencyKey,
      },
    })
    const next = await tx.order.update({
      where: { id: order.id },
      data: {
        paidAmount,
        paymentStatus,
      },
    })
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "SUCCEEDED" },
    })
    await tx.fulfillmentEvent.create({
      data: {
        orderId: order.id,
        type: "PAYMENT_RECEIVED",
        comment: `${formatFcfa(attempt.amount)} reçus via Bictorys (${providerRef}).`,
      },
    })
    return { alreadyProcessed: false, order: next }
  })
}

export const handleBictorysWebhook = async (
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
) => {
  const provider = getBictorysProvider()
  const event = await provider.verifyWebhook(rawBody, headers)
  if (!event.eventId || !event.providerRef) {
    throw badRequest("Notification Bictorys incomplète.")
  }

  let webhook
  try {
    webhook = await prisma.paymentWebhookEvent.create({
      data: {
        provider: "bictorys",
        eventId: event.eventId,
        payload: event.raw as Prisma.InputJsonValue,
        status: "RECEIVED",
      },
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { duplicate: true }
    }
    throw error
  }

  const attempt = await prisma.paymentAttempt.findUnique({
    where: { providerRef: event.providerRef },
  })
  if (!attempt) {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhook.id },
      data: { status: "UNKNOWN_REFERENCE", processedAt: new Date() },
    })
    throw notFound("Référence de transaction inconnue.")
  }

  if (event.amount !== attempt.amount) {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhook.id },
      data: {
        status: "INVALID_AMOUNT",
        error: `Montant ${event.amount} ≠ ${attempt.amount}`,
        processedAt: new Date(),
      },
    })
    throw badRequest(
      "Le montant de la notification ne correspond pas à la tentative de paiement.",
    )
  }

  if (event.currency !== "XOF" && event.currency !== "FCFA") {
    await prisma.paymentWebhookEvent.update({
      where: { id: webhook.id },
      data: {
        status: "INVALID_CURRENCY",
        error: event.currency,
        processedAt: new Date(),
      },
    })
    throw badRequest("Devise de paiement non supportée.")
  }

  if (event.status === "succeeded") {
    const result = await applySuccessfulPayment(attempt.id, event.providerRef)
    await prisma.paymentWebhookEvent.update({
      where: { id: webhook.id },
      data: {
        status: result.alreadyProcessed ? "DUPLICATE" : "PROCESSED",
        processedAt: new Date(),
      },
    })
    return { duplicate: result.alreadyProcessed, orderId: result.order.id }
  }

  if (event.status === "failed" || event.status === "expired") {
    await prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: event.status === "failed" ? "FAILED" : "EXPIRED" },
      })
      const order = await tx.order.findUniqueOrThrow({
        where: { id: attempt.orderId },
      })
      if (order.paidAmount === 0) {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: "ECHEC_PAIEMENT" },
        })
      }
      await tx.paymentWebhookEvent.update({
        where: { id: webhook.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      })
    })
    return { processed: true }
  }

  await prisma.paymentWebhookEvent.update({
    where: { id: webhook.id },
    data: { status: "PENDING", processedAt: new Date() },
  })
  return { processed: true, pending: true }
}

export const listBictorysAttempts = async (orderId?: string) => {
  return prisma.paymentAttempt.findMany({
    where: { ...(orderId ? { orderId } : {}), provider: "bictorys" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      order: {
        select: {
          orderNumber: true,
          trackingCode: true,
          total: true,
          paidAmount: true,
        },
      },
    },
  })
}

/**
 * Utilitaire réservé au mode mock (développement/test). Il construit une
 * notification signée localement pour tester le parcours complet.
 */
export const simulateMockSuccess = async (providerRef: string) => {
  if (!env.BICTORYS_MOCK || env.isProduction) {
    throw new AppError(404, "NOT_FOUND", "Route introuvable.")
  }
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { providerRef },
  })
  if (!attempt) throw notFound("Tentative de paiement introuvable.")
  const payload = JSON.stringify({
    eventId: `evt_mock_${Date.now()}`,
    providerRef,
    status: "succeeded",
    amount: attempt.amount,
    currency: "XOF",
  })
  const signature = createHmac(
    "sha256",
    env.BICTORYS_WEBHOOK_SECRET ?? "mock-webhook-secret",
  )
    .update(payload)
    .digest("hex")
  return handleBictorysWebhook(Buffer.from(payload), {
    [env.BICTORYS_SIGNATURE_HEADER.toLowerCase()]: signature,
  })
}
