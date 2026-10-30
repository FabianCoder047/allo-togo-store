import { z } from 'zod'

export const quoteCreateSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z
    .string()
    .min(6)
    .max(30)
    .regex(/^[+0-9 ().-]+$/, 'Numéro de téléphone invalide.'),
  email: z.string().email().max(160).optional().or(z.literal('')).nullable(),
  serviceId: z.string().optional().nullable(),
  message: z.string().min(10).max(4000),
})

export const quoteUpdateSchema = z.object({
  status: z
    .enum(['NOUVELLE', 'EN_COURS_DE_TRAITEMENT', 'DEVIS_ENVOYE', 'ACCEPTEE', 'REFUSEE', 'CLOTUREE'])
    .optional(),
  assignedToId: z.string().nullable().optional(),
  adminNotes: z.string().max(4000).nullable().optional(),
})

export const quoteListQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
