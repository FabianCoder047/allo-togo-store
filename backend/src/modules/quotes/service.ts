import { prisma } from "../../db/prisma.js"
import { notFound } from "../../lib/errors.js"
import { generateQuoteReference } from "../../lib/ids.js"
import { audit } from "../audit/service.js"
import type { z } from "zod"
import type {
  quoteCreateSchema,
  quoteListQuerySchema,
  quoteUpdateSchema,
} from "./schemas.js"

const attachServices = async <T extends { serviceId: string | null },>(
  quotes: T[],
) => {
  const serviceIds = [
    ...new Set(
      quotes.flatMap((quote) => (quote.serviceId ? [quote.serviceId] : [])),
    ),
  ]
  const services = serviceIds.length
    ? await prisma.product.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true },
      })
    : []
  const byId = new Map(services.map((service) => [service.id, service]))
  return quotes.map((quote) => ({
    ...quote,
    service: quote.serviceId ? (byId.get(quote.serviceId) ?? null) : null,
  }))
}

const uniqueReference = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = generateQuoteReference()
    const exists = await prisma.quoteRequest.findUnique({
      where: { reference },
    })
    if (!exists) return reference
  }
  throw new Error("Impossible de générer une référence de devis.")
}

export const createQuote = async (
  input: z.infer<typeof quoteCreateSchema>,
  ip?: string,
  userAgent?: string,
) => {
  if (input.serviceId) {
    const service = await prisma.product.findUnique({
      where: { id: input.serviceId },
    })
    if (!service || service.type !== "SERVICE" || !service.active) {
      throw notFound("Le service demandé est introuvable ou inactif.")
    }
  }
  const quote = await prisma.quoteRequest.create({
    data: {
      reference: await uniqueReference(),
      serviceId: input.serviceId || null,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      message: input.message.trim(),
    },
  })
  await prisma.notification.create({
    data: {
      channel: "IN_APP",
      recipient: "DIRECTOR",
      template: "QUOTE_CREATED",
      payload: {
        reference: quote.reference,
        name: quote.name,
        phone: quote.phone,
      },
    },
  })
  await audit({
    actorType: "CLIENT",
    action: "QUOTE_CREATED",
    entity: "QuoteRequest",
    entityId: quote.id,
    metadata: { reference: quote.reference, serviceId: quote.serviceId },
    ip,
    userAgent,
  })
  return quote
}

export const listQuotes = async (
  query: z.infer<typeof quoteListQuerySchema>,
) => {
  const where = query.status ? { status: query.status as never } : {}
  const [total, data] = await prisma.$transaction([
    prisma.quoteRequest.count({ where }),
    prisma.quoteRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { assignedTo: { select: { id: true, name: true } } },
    }),
  ])
  return {
    data: await attachServices(data),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  }
}

export const getQuote = async (id: string) => {
  const quote = await prisma.quoteRequest.findUnique({
    where: { id },
    include: { assignedTo: { select: { id: true, name: true } } },
  })
  if (!quote) throw notFound("Demande de devis introuvable.")
  return (await attachServices([quote]))[0]
}

export const updateQuote = async (
  id: string,
  input: z.infer<typeof quoteUpdateSchema>,
  actor: { id: string , name: string },
  ip?: string,
  userAgent?: string,
) => {
  await getQuote(id)
  const quote = await prisma.quoteRequest.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.assignedToId !== undefined
        ? { assignedToId: input.assignedToId }
        : {}),
      ...(input.adminNotes !== undefined
        ? { adminNotes: input.adminNotes }
        : {}),
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  })
  await audit({
    actorId: actor.id,
    actorType: "STAFF",
    action: "QUOTE_UPDATED",
    entity: "QuoteRequest",
    entityId: quote.id,
    metadata: input,
    ip,
    userAgent,
  })
  return (await attachServices([quote]))[0]
}
