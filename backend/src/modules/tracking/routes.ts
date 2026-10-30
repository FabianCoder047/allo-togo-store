import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../lib/asyncHandler.js"
import { validate } from "../../middleware/validate.js"
import {
  trackingAccessLimiter,
  trackingLimiter,
} from "../../middleware/rateLimit.js"
import {
  createTrackingAccess,
  getTrackingMessages,
  normalizeTrackingCode,
  publicTracking,
  setTrackingPaymentChoice,
  sendTrackingMessage,
} from "./service.js"
import {
  trackingAccessSchema,
  trackingPaymentChoiceSchema,
} from "../orders/schemas.js"
import { chatMessageSchema } from "../messaging/schemas.js"

const codeSchema = z.object({ code: z.string().min(6).max(20) })
const tokenQuerySchema = z.object({ token: z.string().min(16) })

export const trackingRouter = Router()

trackingRouter.get(
  "/:code",
  trackingLimiter,
  validate({ params: codeSchema }),
  asyncHandler(async (req, res) => {
    const data = await publicTracking(normalizeTrackingCode(req.params.code))
    res.json({ data })
  }),
)

trackingRouter.post(
  "/:code/access",
  trackingAccessLimiter,
  validate({ params: codeSchema, body: trackingAccessSchema }),
  asyncHandler(async (req, res) => {
    const data = await createTrackingAccess(
      normalizeTrackingCode(req.params.code),
      req.body.phone,
    )
    res.status(201).json({ data })
  }),
)

trackingRouter.get(
  "/:code/messages",
  trackingLimiter,
  validate({ params: codeSchema, query: tokenQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await getTrackingMessages(
      normalizeTrackingCode(req.params.code),
      req.query.token as string,
    )
    res.json({ data })
  }),
)

trackingRouter.post(
  "/:code/payment-choice",
  trackingLimiter,
  validate({
    params: codeSchema,
    query: tokenQuerySchema,
    body: trackingPaymentChoiceSchema,
  }),
  asyncHandler(async (req, res) => {
    const data = await setTrackingPaymentChoice(
      normalizeTrackingCode(req.params.code),
      req.query.token as string,
      req.body,
      req.ip,
      req.get("user-agent") ?? undefined,
    )
    res.json({ data })
  }),
)

trackingRouter.post(
  "/:code/messages",
  trackingLimiter,
  validate({
    params: codeSchema,
    query: tokenQuerySchema,
    body: chatMessageSchema,
  }),
  asyncHandler(async (req, res) => {
    const message = await sendTrackingMessage(
      normalizeTrackingCode(req.params.code),
      req.query.token as string,
      req.body,
    )
    res.status(201).json({
      data: {
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
      },
    })
  }),
)
