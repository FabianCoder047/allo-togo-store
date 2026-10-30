import { Router } from "express"
import { z } from "zod"
import { prisma } from "../../db/prisma.js"
import { asyncHandler } from "../../lib/asyncHandler.js"
import { forbidden, notFound } from "../../lib/errors.js"
import { requireAuth, requirePermission } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import { realtime } from "../../realtime/events.js"
import { chatMessageSchema, toMessageData } from "./schemas.js"

const conversationParams = z.object({ id: z.string().min(1) })
const orderParams = z.object({ id: z.string().min(1) })

const loadConversation = async (
  id: string,
  user: { id: string , role: string },
) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          categoryType: true,
          assignments: { where: { active: true }, select: { staffId: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
    },
  })
  if (!conversation) throw notFound("Conversation introuvable.")
  if (
    (user.role === "TECHNICIAN" || user.role === "DELIVERY") &&
    !conversation.order.assignments.some(
      (assignment) => assignment.staffId === user.id,
    )
  ) {
    throw forbidden(
      "Cette conversation ne concerne pas une commande qui vous est attribuée.",
    )
  }
  return conversation
}

export const messagingRouter = Router()

messagingRouter.get(
  "/orders/:id/conversations",
  requireAuth,
  requirePermission("conversations:read"),
  validate({ params: orderParams }),
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: req.params.id },
          { trackingCode: req.params.id },
          { orderNumber: req.params.id },
        ],
      },
      select: {
        id: true,
        orderNumber: true,
        assignments: { where: { active: true }, select: { staffId: true } },
      },
    })
    if (!order) throw notFound("Commande introuvable.")
    if (
      (req.user!.role === "TECHNICIAN" || req.user!.role === "DELIVERY") &&
      !order.assignments.some(
        (assignment) => assignment.staffId === req.user!.id,
      )
    ) {
      throw forbidden("Cette commande ne vous est pas attribuée.")
    }
    const conversations = await prisma.conversation.findMany({
      where: { orderId: order.id },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
        participants: true,
      },
      orderBy: { visibility: "asc" },
    })
    res.json({ data: conversations })
  }),
)

messagingRouter.get(
  "/conversations/:id/messages",
  requireAuth,
  requirePermission("conversations:read"),
  validate({ params: conversationParams }),
  asyncHandler(async (req, res) => {
    const conversation = await loadConversation(req.params.id, req.user!)
    res.json({
      data: {
        id: conversation.id,
        visibility: conversation.visibility,
        order: conversation.order,
        messages: conversation.messages,
      },
    })
  }),
)

messagingRouter.post(
  "/conversations/:id/messages",
  requireAuth,
  requirePermission("conversations:write"),
  validate({ params: conversationParams, body: chatMessageSchema }),
  asyncHandler(async (req, res) => {
    const conversation = await loadConversation(req.params.id, req.user!)
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        authorType: "STAFF",
        authorId: req.user!.id,
        authorName: req.user!.name,
        ...toMessageData(req.body),
      },
    })
    realtime.emit("message:new", {
      orderId: conversation.order.id,
      conversationId: conversation.id,
      visibility: conversation.visibility,
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
    res.status(201).json({ data: message })
  }),
)
