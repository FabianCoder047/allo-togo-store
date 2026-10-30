import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../lib/asyncHandler.js"
import { prisma } from "../../db/prisma.js"
import { validate } from "../../middleware/validate.js"
import { assistantLimiter } from "../../middleware/rateLimit.js"
import { requireAuth } from "../../middleware/auth.js"
import {
  assistantAskSchema,
  knowledgeInputSchema,
  knowledgeQuerySchema,
} from "./schemas.js"
import { askAssistant, createKnowledge, listKnowledge } from "./service.js"

export const assistantRouter = Router()

const threadParamsSchema = z.object({
  sessionId: z.string().trim().min(8).max(80),
})

assistantRouter.get(
  "/assistant/thread/:sessionId",
  validate({ params: threadParamsSchema }),
  asyncHandler(async (req, res) => {
    const thread = await prisma.assistantThread.findUnique({
      where: { sessionId: req.params.sessionId },
      select: {
        id: true,
        reference: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: "asc" },
          take: 200,
          select: {
            id: true,
            authorType: true,
            authorName: true,
            body: true,
            createdAt: true,
          },
        },
      },
    })
    res.json({ data: thread })
  }),
)

assistantRouter.post(
  "/assistant",
  assistantLimiter,
  validate({ body: assistantAskSchema }),
  asyncHandler(async (req, res) => {
    const data = await askAssistant(req.body)
    res.json({ data })
  }),
)

assistantRouter.get(
  "/assistant/knowledge",
  requireAuth,
  validate({ query: knowledgeQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await listKnowledge(req.query as never)
    res.json({ data })
  }),
)

assistantRouter.post(
  "/assistant/knowledge",
  requireAuth,
  validate({ body: knowledgeInputSchema }),
  asyncHandler(async (req, res) => {
    const data = await createKnowledge({
      ...req.body,
      createdById: req.user!.id,
    })
    res.status(201).json({ data })
  }),
)
