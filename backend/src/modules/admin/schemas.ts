import { z } from 'zod'

export const dashboardQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  categoryType: z.enum(['GPS', 'DRINK']).optional(),
})

export const userCreateSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  role: z.enum(['DIRECTOR', 'ADMIN', 'COMMERCIAL', 'TECHNICIAN', 'DELIVERY']),
  phone: z.string().max(30).optional().or(z.literal('')).nullable(),
})

export const userUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().max(160).optional(),
  phone: z.string().max(30).optional().or(z.literal('')).nullable(),
  role: z.enum(['DIRECTOR', 'ADMIN', 'COMMERCIAL', 'TECHNICIAN', 'DELIVERY']).optional(),
  active: z.boolean().optional(),
})

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8)
    .max(200)
    .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule.')
    .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule.')
    .regex(/[0-9]/, 'Le mot de passe doit contenir un chiffre.'),
})

export const adminPaymentsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  method: z.string().optional(),
  orderId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const auditQuerySchema = z.object({
  entity: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const technicalLogsQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'La date de début doit précéder la date de fin.',
    path: ['from'],
  })

export const notificationQuerySchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'CANCELLED']).optional(),
})
