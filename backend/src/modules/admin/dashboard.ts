import type { Prisma } from "@prisma/client"
import { prisma } from "../../db/prisma.js"
import type { z } from "zod"
import type { dashboardQuerySchema } from "./schemas.js"

const startOfDay = (date: Date) => {
  const copy = new Date(date)
  copy.setUTCHours(0, 0, 0, 0)
  return copy
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

const rangeFromQuery = (query: z.infer<typeof dashboardQuerySchema>) => {
  const to = query.to ? new Date(query.to) : new Date()
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000)
  from.setUTCHours(0, 0, 0, 0)
  to.setUTCHours(23, 59, 59, 999)
  return { from, to }
}

export const getDashboard = async (
  query: z.infer<typeof dashboardQuerySchema>,
) => {
  const { from, to } = rangeFromQuery(query)
  const period = { createdAt: { gte: from, lte: to } }
  const categoryFilter = query.categoryType
    ? { categoryType: query.categoryType }
    : {}
  const baseWhere = { ...period, ...categoryFilter }
  const notCancelled: Prisma.OrderWhereInput = {
    ...baseWhere,
    status: { notIn: ["ANNULEE", "REJETEE"] },
  }

  const [
    pendingConfirmation,
    accepted,
    preparing,
    inProgress,
    readyPickup,
    deliveredPaid,
    cancelled,
    failed,
    deliveredUnpaid,
    paymentsReceived,
    outstandingAggregate,
    pendingQuotes,
    statusGroups,
    fulfillmentGroups,
    salesGroups,
    recentOrders,
    paymentsByDayRows,
    ordersForTimeline,
    assignments,
    completedByStaff,
  ] = await Promise.all([
    prisma.order.count({
      where: { ...baseWhere, status: "EN_ATTENTE_CONFIRMATION" },
    }),
    prisma.order.count({
      where: { ...baseWhere, status: "COMMANDE_ACCEPTEE" },
    }),
    prisma.order.count({
      where: { ...baseWhere, status: "COMMANDE_EN_PREPARATION" },
    }),
    prisma.order.count({
      where: { ...baseWhere, status: "COMMANDE_EN_COURS_DE_LIVRAISON" },
    }),
    prisma.order.count({
      where: {
        ...baseWhere,
        status: "COMMANDE_ACCEPTEE",
        fulfillmentMode: "RETRAIT_AGENCE",
      },
    }),
    prisma.order.count({
      where: { ...baseWhere, status: "LIVREE", paymentStatus: "PAYE" },
    }),
    prisma.order.count({ where: { ...baseWhere, status: "ANNULEE" } }),
    prisma.order.count({ where: { ...baseWhere, status: "ECHEC_LIVRAISON" } }),
    prisma.order.count({
      where: {
        ...baseWhere,
        status: { not: "ANNULEE" },
        fulfillmentCompletedAt: { not: null },
        paymentStatus: { not: "PAYE" },
      },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: from, lte: to }, order: categoryFilter },
    }),
    prisma.order.aggregate({
      _sum: { total: true, paidAmount: true },
      where: notCancelled,
    }),
    prisma.quoteRequest.count({ where: { status: "NOUVELLE" } }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: baseWhere,
    }),
    prisma.order.groupBy({
      by: ["fulfillmentMode"],
      _count: { _all: true },
      where: baseWhere,
    }),
    prisma.order.groupBy({
      by: ["categoryType"],
      _sum: { total: true },
      _count: { _all: true },
      where: notCancelled,
    }),
    prisma.order.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        items: { select: { productName: true, quantity: true } },
        assignedTo: { select: { name: true, role: true } },
      },
    }),
    prisma.payment.findMany({
      where: { createdAt: { gte: from, lte: to }, order: categoryFilter },
      select: { createdAt: true, amount: true },
    }),
    prisma.order.findMany({ where: baseWhere, select: { createdAt: true } }),
    prisma.deliveryAssignment.groupBy({
      by: ["staffId"],
      _count: { _all: true },
      where: { createdAt: { gte: from, lte: to } },
    }),
    prisma.order.groupBy({
      by: ["assignedToId"],
      _count: { _all: true },
      where: { ...notCancelled, assignedToId: { not: null }, status: "LIVREE" },
    }),
  ])

  const days: string[] = []
  const cursor = startOfDay(from)
  while (cursor <= to) {
    days.push(isoDay(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const orderCounts = new Map<string, number>()
  for (const order of ordersForTimeline) {
    const key = isoDay(order.createdAt)
    orderCounts.set(key, (orderCounts.get(key) ?? 0) + 1)
  }
  const paymentCounts = new Map<string, number>()
  for (const payment of paymentsByDayRows) {
    const key = isoDay(payment.createdAt)
    paymentCounts.set(key, (paymentCounts.get(key) ?? 0) + payment.amount)
  }

  const staffIds = [
    ...new Set([
      ...assignments.map((row) => row.staffId),
      ...completedByStaff.map((row) => row.assignedToId).filter(Boolean),
    ]),
  ] as string[]
  const staff = staffIds.length
    ? await prisma.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true, role: true },
      })
    : []
  const completedMap = new Map(
    completedByStaff.map((row) => [row.assignedToId, row._count._all]),
  )
  const staffActivity = staff.map((member) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    assignments:
      assignments.find((row) => row.staffId === member.id)?._count._all ?? 0,
    completed: completedMap.get(member.id) ?? 0,
  }))

  const total = outstandingAggregate._sum.total ?? 0
  const paid = outstandingAggregate._sum.paidAmount ?? 0

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    indicators: {
      pendingConfirmation,
      accepted,
      preparing,
      inProgress,
      readyPickup,
      deliveredPaid,
      deliveredUnpaid,
      cancelled,
      failed,
      paymentsReceived: paymentsReceived._sum.amount ?? 0,
      outstanding: Math.max(0, total - paid),
      pendingQuotes,
    },
    charts: {
      ordersByDay: days.map((date) => ({
        date,
        count: orderCounts.get(date) ?? 0,
      })),
      paymentsByDay: days.map((date) => ({
        date,
        amount: paymentCounts.get(date) ?? 0,
      })),
      statusDistribution: statusGroups.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      fulfillmentDistribution: fulfillmentGroups.map((row) => ({
        fulfillmentMode: row.fulfillmentMode,
        count: row._count._all,
      })),
      salesByCategory: salesGroups.map((row) => ({
        categoryType: row.categoryType,
        total: row._sum.total ?? 0,
        count: row._count._all,
      })),
      staffActivity,
    },
    recentOrders,
  }
}
