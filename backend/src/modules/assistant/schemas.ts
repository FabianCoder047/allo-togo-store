import { z } from "zod"

const historyItemSchema = z.object({
  role: z.enum(["client", "ai"]),
  text: z.string().trim().min(1).max(2000),
})

/**
 * L’assistant reçoit le message courant et un court historique pour résoudre
 * les relances du type « et pour une moto ? » sans conserver de session en base.
 */
export const assistantAskSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Le message ne peut pas être vide.")
    .max(1200),
  sessionId: z.string().trim().min(8).max(80).optional(),
  history: z.array(historyItemSchema).max(10).optional(),
})

export type AssistantAskInput = z.infer<typeof assistantAskSchema>

export const knowledgeQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
  q: z.string().max(120).optional(),
})

export const knowledgeInputSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  answer: z.string().trim().min(1).max(4000),
  keywords: z.string().trim().min(1).max(500),
  sourceThreadId: z.string().optional().nullable(),
  sourceMessageId: z.string().optional().nullable(),
})
