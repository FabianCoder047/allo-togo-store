import type { Notification, Order, OrderItem } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { formatFcfa } from '../../lib/money.js'
import { realtime } from '../../realtime/events.js'
import {
  HttpWhatsAppProvider,
  SimulatedWhatsAppProvider,
  SimulatedSmsProvider,
  HttpSmsProvider,
  type NotificationProvider,
  type OutgoingNotification,
} from './provider.js'

const buildProvider = (): NotificationProvider => {
  if (env.WHATSAPP_PROVIDER === 'http') {
    if (!env.WHATSAPP_API_URL || !env.WHATSAPP_TOKEN) {
      throw new Error('WHATSAPP_API_URL et WHATSAPP_TOKEN sont requis lorsque WHATSAPP_PROVIDER=http.')
    }
    return new HttpWhatsAppProvider(env.WHATSAPP_API_URL, env.WHATSAPP_TOKEN, env.WHATSAPP_SENDER)
  }
  return new SimulatedWhatsAppProvider()
}

const buildSmsProvider = (): NotificationProvider => {
  if (env.SMS_PROVIDER === 'http') {
    if (!env.SMS_API_URL || !env.SMS_TOKEN) {
      throw new Error('SMS_API_URL et SMS_TOKEN sont requis lorsque SMS_PROVIDER=http.')
    }
    return new HttpSmsProvider(env.SMS_API_URL, env.SMS_TOKEN, env.SMS_SENDER)
  }
  return new SimulatedSmsProvider()
}

export const smsMode = () => ({
  provider: env.SMS_PROVIDER,
  simulated: env.SMS_PROVIDER === 'simulated' || env.SMS_SIMULATION,
  configured:
    env.SMS_PROVIDER === 'simulated' ||
    Boolean(env.SMS_API_URL && env.SMS_TOKEN),
})

export const notificationMode = () => ({
  provider: env.WHATSAPP_PROVIDER,
  simulated: env.WHATSAPP_PROVIDER === 'simulated' || env.WHATSAPP_SIMULATION,
  configured:
    env.WHATSAPP_PROVIDER === 'simulated' ||
    Boolean(env.WHATSAPP_API_URL && env.WHATSAPP_TOKEN),
})

type OrderForNotification = Order & { items: OrderItem[] }

export const buildOrderNotificationPayload = (order: OrderForNotification) => {
  const trackingUrl = `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/suivi/${order.trackingCode}`
  const items = order.items.map((item) => `${item.quantity} × ${item.productName}`).join(', ')
  return {
    business: 'Allo Togo',
    reference: order.trackingCode,
    orderNumber: order.orderNumber,
    category: order.categoryType,
    items,
    fulfillmentMode: order.fulfillmentMode,
    total: formatFcfa(order.total),
    trackingUrl,
    message: [
      `Allo Togo — votre commande ${order.orderNumber} a bien été enregistrée.`,
      `Référence de suivi : ${order.trackingCode}`,
      `Articles : ${items}.`,
      `Mode de réception : ${order.fulfillmentMode === 'LIVRAISON' ? 'livraison' : 'retrait en agence'}.`,
      `Suivi : ${trackingUrl}`,
      'Notre équipe vous contactera pour confirmer la commande. Aucun paiement en ligne n’a été effectué.',
    ].join('\n'),
  }
}

export const enqueueOrderCreatedNotification = async (order: OrderForNotification) => {
  return prisma.notification.create({
    data: {
      orderId: order.id,
      channel: 'WHATSAPP',
      recipient: order.customerWhatsapp || order.customerPhone,
      template: 'ORDER_CREATED',
      payload: buildOrderNotificationPayload(order),
      status: 'PENDING',
    },
  })
}

export const enqueueOrderCreatedSmsNotification = async (order: OrderForNotification) => {
  const trackingUrl = `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/suivi/${order.trackingCode}`
  const message = `Allo Togo: commande ${order.orderNumber} enregistree. Suivi: ${order.trackingCode}. Lien: ${trackingUrl}`
  return prisma.notification.create({
    data: {
      orderId: order.id,
      channel: 'SMS',
      recipient: order.customerPhone,
      template: 'ORDER_CREATED',
      payload: {
        business: 'Allo Togo',
        reference: order.trackingCode,
        orderNumber: order.orderNumber,
        trackingUrl,
        message,
      },
      status: 'PENDING',
    },
  })
}

export const enqueueStaffNewOrderNotifications = async (order: Order) => {
  const recipients = await prisma.user.findMany({
    where: { active: true, role: { in: ['DIRECTOR', 'COMMERCIAL'] } },
    select: { id: true },
  })
  if (recipients.length === 0) return { count: 0 }
  const created = await prisma.notification.createMany({
    data: recipients.map(({ id }) => ({
      orderId: order.id,
      channel: 'IN_APP' as const,
      recipient: id,
      template: 'ORDER_TO_CONFIRM',
      payload: {
        orderNumber: order.orderNumber,
        category: order.categoryType,
        message: `Nouvelle commande ${order.orderNumber} à confirmer après appel du client.`,
      },
      status: 'SENT' as const,
      sentAt: new Date(),
    })),
  })
  realtime.emit('order:new', { orderId: order.id })
  return created
}

export const enqueueStaffAssignmentNotification = async (order: Order, staffId: string, staffName: string) => {
  return prisma.notification.create({
    data: {
      orderId: order.id,
      channel: 'IN_APP',
      recipient: staffId,
      template: 'MISSION_ASSIGNED',
      payload: {
        staffName,
        orderNumber: order.orderNumber,
        category: order.categoryType,
        message: `Nouvelle mission ${order.orderNumber} attribuée.`,
      },
      status: 'PENDING',
    },
  })
}

export const enqueuePaymentValidationNotification = async (order: Order) => {
  // Notifier le chef d'équipe assigné (isLead) ou, à défaut, les comptes
  // DIRECTOR / COMMERCIAL actifs.
  let recipientIds: string[] = []
  const leadAssignment = await prisma.deliveryAssignment.findFirst({
    where: { orderId: order.id, isLead: true, active: true },
    select: { staffId: true },
  })
  if (leadAssignment) {
    recipientIds = [leadAssignment.staffId]
  } else {
    const staff = await prisma.user.findMany({
      where: { active: true, role: { in: ['DIRECTOR', 'COMMERCIAL'] } },
      select: { id: true },
    })
    recipientIds = staff.map((s) => s.id)
  }
  if (recipientIds.length === 0) return { count: 0 }
  const created = await prisma.notification.createMany({
    data: recipientIds.map((id) => ({
      orderId: order.id,
      channel: 'IN_APP' as const,
      recipient: id,
      template: 'PAYMENT_TO_VALIDATE' as const,
      payload: {
        orderNumber: order.orderNumber,
        category: order.categoryType,
        choice: order.customerPaymentChoice,
        message:
          order.customerPaymentChoice === 'ESPECES'
            ? `Paiement en espèces à valider pour ${order.orderNumber}. Le chef d'équipe doit confirmer la remise.`
            : `Paiement ${order.customerPaymentChoice} déclaré pour ${order.orderNumber}. Vérifiez la capture dans le chat.`,
      },
      status: 'SENT' as const,
      sentAt: new Date(),
    })),
  })
  realtime.emit('order:new', { orderId: order.id })
  return created
}
export const enqueueCashPaymentRecordedNotification = async (
  order: Order,
  paymentAmount: number,
  recordedBy: { id: string; name: string },
) => {
  // Notifier celui qui a remis la somme (chef d'équipe assigné) que
  // l'encaissement a été enregistré par le commercial ou le directeur.
  let recipientIds: string[] = []
  if (order.assignedToId) {
    recipientIds = [order.assignedToId]
  } else {
    const leadAssignment = await prisma.deliveryAssignment.findFirst({
      where: { orderId: order.id, isLead: true, active: true },
      select: { staffId: true },
    })
    if (leadAssignment) {
      recipientIds = [leadAssignment.staffId]
    }
  }
  if (recipientIds.length === 0) return { count: 0 }
  // Ne pas notifier celui qui a enregistré le paiement lui-même.
  recipientIds = recipientIds.filter((id) => id !== recordedBy.id)
  if (recipientIds.length === 0) return { count: 0 }
  const created = await prisma.notification.createMany({
    data: recipientIds.map((id) => ({
      orderId: order.id,
      channel: 'IN_APP' as const,
      recipient: id,
      template: 'CASH_PAYMENT_RECORDED' as const,
      payload: {
        orderNumber: order.orderNumber,
        amount: paymentAmount,
        recordedBy: recordedBy.name,
        message: `L'encaissement de ${paymentAmount} FCFA pour ${order.orderNumber} a été enregistré par ${recordedBy.name}.`,
      },
      status: 'SENT' as const,
      sentAt: new Date(),
    })),
  })
  realtime.emit('order:new', { orderId: order.id })
  return created
}
const toOutgoing = (notification: Notification): OutgoingNotification => ({
  id: notification.id,
  channel: notification.channel,
  recipient: notification.recipient,
  template: notification.template,
  payload: (notification.payload as Record<string, unknown> | null) ?? null,
})

export const processPendingNotifications = async (limit = 20) => {
  const pending = await prisma.notification.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  })

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const notification of pending) {
    if (notification.channel === 'IN_APP') {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
      })
      sent += 1
      continue
    }

    if (notification.channel !== 'WHATSAPP' && notification.channel !== 'SMS') {
      skipped += 1
      continue
    }

    try {
      const provider = notification.channel === 'SMS' ? buildSmsProvider() : buildProvider()
      const result = await provider.send(toOutgoing(notification))
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          payload: {
            ...(notification.payload as Record<string, unknown>),
            providerMessageId: result.providerMessageId,
            simulated: provider.name === 'simulated',
          },
        },
      })
      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue'
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: notification.attempts + 1 >= 5 ? 'FAILED' : 'PENDING',
          attempts: { increment: 1 },
          lastError: message.slice(0, 500),
        },
      })
      logger.warn({ notificationId: notification.id, err: error }, 'Échec d’envoi de notification')
      failed += 1
    }
  }

  return { processed: pending.length, sent, failed, skipped }
}

export const retryNotification = async (id: string) => {
  const notification = await prisma.notification.update({
    where: { id },
    data: { status: 'PENDING', scheduledAt: new Date(), lastError: null },
  })
  return notification
}

export const notificationQueue = async (status?: Notification['status']) => {
  return prisma.notification.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { order: { select: { orderNumber: true, trackingCode: true, categoryType: true } } },
  })
}
