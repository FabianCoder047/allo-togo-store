import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../lib/asyncHandler.js"
import { validate } from "../../middleware/validate.js"
import { requireAuth, requirePermission } from "../../middleware/auth.js"
import { env } from "../../config/env.js"
import {
  createBictorysAttempt,
  handleBictorysWebhook,
  listBictorysAttempts,
  simulateMockSuccess,
} from "./service.js"

const attemptSchema = z.object({ orderId: z.string().min(1) })

export const paymentsRouter = Router()

paymentsRouter.post(
  "/bictorys/webhook",
  asyncHandler(async (req, res) => {
    if (!req.rawBody) {
      res
        .status(400)
        .json({
          error: { code: "BAD_REQUEST", message: "Corps brut manquant." },
        })
      return
    }
    const result = await handleBictorysWebhook(req.rawBody, req.headers)
    res.json({ data: result })
  }),
)

paymentsRouter.use(requireAuth)

paymentsRouter.post(
  "/bictorys/attempts",
  requirePermission("payments:record"),
  validate({ body: attemptSchema }),
  asyncHandler(async (req, res) => {
    const data = await createBictorysAttempt(
      req.body.orderId,
      req.user!,
      req.ip,
      req.get("user-agent") ?? undefined,
    )
    res.status(201).json({ data })
  }),
)

paymentsRouter.get(
  "/bictorys/attempts",
  requirePermission("payments:read"),
  validate({ query: z.object({ orderId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const data = await listBictorysAttempts(
      req.query.orderId as string | undefined,
    )
    res.json({ data })
  }),
)

paymentsRouter.post(
  "/bictorys/mock/:providerRef/complete",
  requirePermission("payments:record"),
  asyncHandler(async (req, res) => {
    if (!env.BICTORYS_MOCK) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Route introuvable." } })
      return
    }
    const data = await simulateMockSuccess(req.params.providerRef)
    res.json({ data })
  }),
)
