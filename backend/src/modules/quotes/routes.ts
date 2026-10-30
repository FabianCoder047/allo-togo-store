import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../lib/asyncHandler.js"
import { validate } from "../../middleware/validate.js"
import { requireAuth, requirePermission } from "../../middleware/auth.js"
import { checkoutLimiter } from "../../middleware/rateLimit.js"
import { createQuote, getQuote, listQuotes, updateQuote } from "./service.js"
import {
  quoteCreateSchema,
  quoteListQuerySchema,
  quoteUpdateSchema,
} from "./schemas.js"

export const quotesRouter = Router()

quotesRouter.post(
  "/",
  checkoutLimiter,
  validate({ body: quoteCreateSchema }),
  asyncHandler(async (req, res) => {
    const quote = await createQuote(
      req.body,
      req.ip,
      req.get("user-agent") ?? undefined,
    )
    res.status(201).json({
      data: {
        id: quote.id,
        reference: quote.reference,
        status: quote.status,
        createdAt: quote.createdAt,
      },
    })
  }),
)

quotesRouter.use(requireAuth)

quotesRouter.get(
  "/",
  requirePermission("quotes:read"),
  validate({ query: quoteListQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof quoteListQuerySchema>
    const result = await listQuotes(query)
    res.json(result)
  }),
)

quotesRouter.get(
  "/:id",
  requirePermission("quotes:read"),
  asyncHandler(async (req, res) => {
    const data = await getQuote(req.params.id)
    res.json({ data })
  }),
)

quotesRouter.patch(
  "/:id",
  requirePermission("quotes:write"),
  validate({ body: quoteUpdateSchema }),
  asyncHandler(async (req, res) => {
    const data = await updateQuote(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get("user-agent") ?? undefined,
    )
    res.json({ data })
  }),
)
