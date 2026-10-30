import type { StaffRole } from "@prisma/client"
import { prisma } from "../../db/prisma.js"
import { logger } from "../../config/logger.js"
import { conflict, notFound, serviceUnavailable } from "../../lib/errors.js"
import { generateTemporaryPassword } from "../../lib/ids.js"
import { hashPassword, revokeAllSessions } from "../auth/service.js"
import { audit } from "../audit/service.js"
import { sendStaffCredentialsEmail } from "../notifications/email.js"
import type { z } from "zod"
import type {
  resetPasswordSchema,
  userCreateSchema,
  userUpdateSchema,
} from "./schemas.js"

const publicUserSelect = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
} as const

export const listUsers = async (
  options: { role?: StaffRole includeInactive?: boolean } = {},
) => {
  return prisma.user.findMany({
    where: {
      ...(options.role ? { role: options.role } : {}),
      ...(options.includeInactive ? {} : { active: true }),
    },
    select: publicUserSelect,
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })
}

/**
 * Le nom complet reste la valeur affichée ; prénom et nom sont dérivés pour
 * que le membre puisse ensuite modifier chaque partie depuis ses paramètres.
 */
const splitFullName = (fullName: string) => {
  const name = fullName.trim()
  const separator = name.indexOf(" ")
  if (separator < 0) return { firstName: name, lastName: null }
  return {
    firstName: name.slice(0, separator),
    lastName: name.slice(separator + 1).trim() || null,
  }
}

export const createUser = async (
  input: z.infer<typeof userCreateSchema>,
  actor: { id: string name: string },
  ip?: string,
  userAgent?: string,
) => {
  const email = input.email.toLowerCase().trim()
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) throw conflict("Un compte utilise déjà cette adresse email.")

  const temporaryPassword = generateTemporaryPassword(6)
  const fullName = input.name.trim()
  const user = await prisma.user.create({
    data: {
      name: fullName,
      ...splitFullName(fullName),
      email,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      role: input.role,
      phone: input.phone?.trim() || null,
    },
    select: publicUserSelect,
  })

  try {
    await sendStaffCredentialsEmail({
      name: user.name,
      email: user.email,
      role: user.role,
      temporaryPassword,
    })
  } catch (error) {
    logger.error(
      { err: error, email: user.email },
      "Échec de l’envoi des identifiants du nouveau compte",
    )
    try {
      await prisma.user.delete({ where: { id: user.id } })
    } catch (cleanupError) {
      logger.error(
        { err: cleanupError, userId: user.id },
        "Impossible de supprimer le compte après l’échec de l’email",
      )
    }
    throw serviceUnavailable(
      "Le compte n’a pas été créé : l’email contenant le mot de passe provisoire n’a pas pu être envoyé. Vérifiez la configuration email puis réessayez.",
    )
  }

  await audit({
    actorId: actor.id,
    actorType: "STAFF",
    action: "USER_CREATED",
    entity: "User",
    entityId: user.id,
    metadata: {
      email: user.email,
      role: user.role,
      credentialsEmailSent: true,
    },
    ip,
    userAgent,
  })
  return user
}

export const updateUser = async (
  id: string,
  input: z.infer<typeof userUpdateSchema>,
  actor: { id: string name: string },
  ip?: string,
  userAgent?: string,
) => {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: publicUserSelect,
  })
  if (!existing) throw notFound("Compte introuvable.")
  if (existing.id === actor.id && input.active === false) {
    throw conflict("Vous ne pouvez pas désactiver votre propre compte.")
  }
  if (existing.id === actor.id && input.role && input.role !== existing.role) {
    throw conflict("Vous ne pouvez pas modifier votre propre rôle.")
  }
  const email = input.email?.toLowerCase().trim()
  if (email && email !== existing.email) {
    const emailOwner = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (emailOwner)
      throw conflict("Un compte utilise déjà cette adresse email.")
  }
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name
        ? { name: input.name.trim(), ...splitFullName(input.name) }
        : {}),
      ...(email ? { email } : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone?.trim() || null }
        : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    select: publicUserSelect,
  })
  if (input.active === false || input.role || email) {
    await revokeAllSessions(id)
  }
  await audit({
    actorId: actor.id,
    actorType: "STAFF",
    action: "USER_UPDATED",
    entity: "User",
    entityId: id,
    metadata: input,
    ip,
    userAgent,
  })
  return user
}

export const deactivateUser = async (
  id: string,
  actor: { id: string name: string },
  ip?: string,
  userAgent?: string,
) => {
  if (id === actor.id)
    throw conflict("Vous ne pouvez pas supprimer votre propre compte.")
  const existing = await prisma.user.findUnique({
    where: { id },
    select: publicUserSelect,
  })
  if (!existing) throw notFound("Compte introuvable.")
  if (!existing.active) return existing

  const user = await prisma.user.update({
    where: { id },
    data: { active: false },
    select: publicUserSelect,
  })
  await revokeAllSessions(id)
  await audit({
    actorId: actor.id,
    actorType: "STAFF",
    action: "USER_DEACTIVATED",
    entity: "User",
    entityId: id,
    metadata: { email: existing.email },
    ip,
    userAgent,
  })
  return user
}

export const resetUserPassword = async (
  id: string,
  input: z.infer<typeof resetPasswordSchema>,
  actor: { id: string name: string },
  ip?: string,
  userAgent?: string,
) => {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) throw notFound("Compte introuvable.")
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      mustChangePassword: true,
    },
  })
  await revokeAllSessions(id)
  await audit({
    actorId: actor.id,
    actorType: "STAFF",
    action: "USER_PASSWORD_RESET",
    entity: "User",
    entityId: id,
    ip,
    userAgent,
  })
  return { id }
}

export const listStaffMembers = async () => {
  return prisma.user.findMany({
    where: { active: true, role: { in: ["TECHNICIAN", "DELIVERY"] } },
    select: { id: true, name: true, role: true, phone: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })
}

export const listPayments = async (query: {
  from?: string
  to?: string
  method?: string
  orderId?: string
  page: number
  pageSize: number
}) => {
  const where = {
    ...(query.method ? { method: query.method as never } : {}),
    ...(query.orderId ? { orderId: query.orderId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  }
  const [total, data, aggregate] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            trackingCode: true,
            categoryType: true,
          },
        },
        receivedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.payment.aggregate({ _sum: { amount: true }, where }),
  ])
  return {
    data,
    totalAmount: aggregate._sum.amount ?? 0,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}

export const listAuditLogs = async (query: {
  entity?: string
  action?: string
  from?: string
  to?: string
  page: number
  pageSize: number
}) => {
  const where = {
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  }
  const [total, data] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { actor: { select: { id: true, name: true, role: true } } },
    }),
  ])
  return {
    data,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}
