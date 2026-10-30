import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { forbidden, notFound } from '../../lib/errors.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requirePasswordChanged, requirePermission } from '../../middleware/auth.js'
import { prisma } from '../../db/prisma.js'
import { realtime } from '../../realtime/events.js'
import { listOrders } from '../orders/service.js'

const missionQuerySchema = z.object({
  status: z.string().optional(),
  categoryType: z.enum(['GPS', 'DRINK']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const assistantThreadParamsSchema = z.object({
  key: z.string().trim().min(1).max(120),
})

const assistantThreadReplySchema = z.object({
  body: z.string().trim().min(1, 'La réponse ne peut pas être vide.').max(2000),
})

const assistantThreadStatusSchema = z.object({
  status: z.enum(['OPEN', 'ANSWERED', 'RESOLVED']),
})

const assistantThreadSelect = {
  id: true,
  reference: true,
  sessionId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  messages: {
    orderBy: { createdAt: 'asc' as const },
    take: 200,
    select: {
      id: true,
      authorType: true,
      authorName: true,
      body: true,
      createdAt: true,
    },
  },
}

const ensureAssistantAccess = (role: string) => {
  if (role !== 'DIRECTOR' && role !== 'COMMERCIAL') {
    throw forbidden('Les alertes de l’assistant sont réservées aux comptes employés.')
  }
}

const findAssistantThread = (key: string) =>
  prisma.assistantThread.findFirst({
    where: { OR: [{ id: key }, { reference: key }] },
    select: assistantThreadSelect,
  })

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/**
 * Les alertes créées avant l’ajout des fils de discussion n’ont pas de
 * `assistantThreadId`. On reconstitue le fil à la première ouverture à partir
 * du payload de la notification, puis on relie toutes les copies de l’alerte.
 */
const ensureAssistantThread = async (key: string, userId: string) => {
  const existing = await findAssistantThread(key)
  if (existing) return existing

  const candidates = await prisma.notification.findMany({
    where: { recipient: userId, template: 'ASSISTANT_ESCALATION' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, payload: true },
  })
  const matches = candidates.filter((item) => asRecord(item.payload).reference === key)
  if (matches.length === 0) return null

  const payload = asRecord(matches[0].payload)
  const sessionId = typeof payload.sessionId === 'string' && payload.sessionId.trim() ? payload.sessionId : null
  if (sessionId) {
    const bySession = await prisma.assistantThread.findUnique({
      where: { sessionId },
      select: assistantThreadSelect,
    })
    if (bySession) {
      await prisma.notification.updateMany({
        where: { id: { in: matches.map((item) => item.id) } },
        data: { assistantThreadId: bySession.id },
      })
      return bySession
    }
  }

  const conversation = Array.isArray(payload.conversation)
    ? payload.conversation.filter((item): item is string => typeof item === 'string')
    : []
  const customerMessage = typeof payload.customerMessage === 'string' ? payload.customerMessage : ''
  if (customerMessage && conversation[conversation.length - 1] !== customerMessage) {
    conversation.push(customerMessage)
  }
  const parsedCreatedAt = typeof payload.createdAt === 'string' ? new Date(payload.createdAt) : null
  const createdAt = parsedCreatedAt && !Number.isNaN(parsedCreatedAt.getTime()) ? parsedCreatedAt : new Date()
  const messages = conversation.map((body, index) => ({
    authorType: 'CLIENT',
    authorName: 'Client',
    body,
    createdAt: new Date(createdAt.getTime() - (conversation.length - index) * 1000),
  }))

  try {
    const thread = await prisma.assistantThread.create({
      data: {
        sessionId,
        reference: key,
        status: 'OPEN',
        messages: messages.length > 0 ? { create: messages } : undefined,
      },
      select: assistantThreadSelect,
    })
    await prisma.notification.updateMany({
      where: { id: { in: matches.map((item) => item.id) } },
      data: { assistantThreadId: thread.id },
    })
    return thread
  } catch (error) {
    // Un autre employé a pu créer le fil entre-temps.
    const raced = await findAssistantThread(key)
    if (raced) return raced
    throw error
  }
}

export const staffRouter = Router()
staffRouter.use(requireAuth, requirePasswordChanged)

staffRouter.get(
  '/missions',
  requirePermission('orders:read:own'),
  validate({ query: missionQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof missionQuerySchema>
    const result = await listOrders(
      { ...query, assignedToId: req.user!.id, search: undefined } as never,
      req.user!,
    )
    res.json(result)
  }),
)

staffRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const data = await prisma.notification.findMany({
      where: { recipient: req.user!.id, channel: 'IN_APP' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        orderId: true,
        assistantThreadId: true,
        template: true,
        status: true,
        payload: true,
        createdAt: true,
      },
    })
    res.json({ data })
  }),
)

staffRouter.get(
  '/assistant-alerts',
  asyncHandler(async (req, res) => {
    ensureAssistantAccess(req.user!.role)
    const data = await prisma.notification.findMany({
      where: { recipient: req.user!.id, template: 'ASSISTANT_ESCALATION' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, assistantThreadId: true, status: true, payload: true, createdAt: true },
    })
    res.json({ data })
  }),
)

staffRouter.get(
  '/assistant-threads/:key',
  validate({ params: assistantThreadParamsSchema }),
  asyncHandler(async (req, res) => {
    ensureAssistantAccess(req.user!.role)
    const thread = await ensureAssistantThread(req.params.key, req.user!.id)
    if (!thread) throw notFound('Discussion introuvable.')
    res.json({ data: thread })
  }),
)

staffRouter.post(
  '/assistant-threads/:key/messages',
  validate({ params: assistantThreadParamsSchema, body: assistantThreadReplySchema }),
  asyncHandler(async (req, res) => {
    ensureAssistantAccess(req.user!.role)
    const thread = await ensureAssistantThread(req.params.key, req.user!.id)
    if (!thread) throw notFound('Discussion introuvable.')

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.assistantThreadMessage.create({
        data: {
          threadId: thread.id,
          authorType: 'STAFF',
          authorId: req.user!.id,
          authorName: req.user!.name,
          body: req.body.body,
        },
        select: {
          id: true,
          authorType: true,
          authorName: true,
          body: true,
          createdAt: true,
        },
      })
      await tx.assistantThread.update({
        where: { id: thread.id },
        data: { status: 'ANSWERED' },
      })
      await tx.notification.updateMany({
        where: { assistantThreadId: thread.id },
        data: { status: 'SENT', sentAt: new Date() },
      })
      return created
    })

    realtime.emit('assistant:support-message', {
      threadId: thread.id,
      sessionId: thread.sessionId,
      reference: thread.reference,
      message,
    })
    res.status(201).json({ data: message })
  }),
)

staffRouter.patch(
  '/assistant-threads/:key',
  validate({ params: assistantThreadParamsSchema, body: assistantThreadStatusSchema }),
  asyncHandler(async (req, res) => {
    ensureAssistantAccess(req.user!.role)
    const thread = await ensureAssistantThread(req.params.key, req.user!.id)
    if (!thread) throw notFound('Discussion introuvable.')

    const updated = await prisma.assistantThread.update({
      where: { id: thread.id },
      data: { status: req.body.status },
      select: assistantThreadSelect,
    })
    realtime.emit('assistant:support-status', {
      threadId: updated.id,
      sessionId: updated.sessionId,
      reference: updated.reference,
      status: updated.status,
    })
    res.json({ data: updated })
  }),
)

staffRouter.get(
  '/missions/:id',
  requirePermission('orders:read:own'),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, assignments: { some: { staffId: req.user!.id, active: true } } },
      include: {
        items: true,
        history: { orderBy: { createdAt: 'desc' } },
        assignments: { where: { active: true }, include: { staff: { select: { id: true, name: true } } } },
        group: { select: { publicRef: true } },
      },
    })
    if (!order) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Mission introuvable.' } })
      return
    }
    res.json({ data: order })
  }),
)
