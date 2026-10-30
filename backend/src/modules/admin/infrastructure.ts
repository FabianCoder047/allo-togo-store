import { prisma } from '../../db/prisma.js'
import { env } from '../../config/env.js'
import { emailMode } from '../notifications/email.js'
import { notificationMode } from '../notifications/service.js'

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000)

/**
 * Vue technique réservée au Directeur et à l'informaticien.
 *
 * Elle ne contient aucune donnée commerciale détaillée : uniquement des
 * volumes et l'état des sessions. L'affluence
 * réelle des visiteurs et leur parcours sont suivis par PostHog côté frontend.
 */
export const getInfrastructureOverview = async () => {
  const now = new Date()
  const dayAgo = hoursAgo(24)
  const weekAgo = hoursAgo(24 * 7)
  const startedAt = Date.now()

  const databaseProbe = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`
  const databaseLatencyMs = Date.now() - startedAt

  const [
    activeUsers,
    validSessions,
    totalUsers,
    roleGroups,
    activeProducts,
    totalProducts,
    totalCategories,
    logins24h,
    logins7d,
    orders24h,
    orders7d,
    quotes24h,
    quotes7d,
  ] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.refreshSession.count({
      where: { revokedAt: null, expiresAt: { gt: now } },
    }),
    prisma.user.count(),
    prisma.user.groupBy({
      by: ['role'],
      where: { active: true },
      _count: { _all: true },
    }),
    prisma.product.count({ where: { active: true } }),
    prisma.product.count(),
    prisma.category.count({ where: { active: true } }),
    prisma.auditLog.count({
      where: { action: 'AUTH_LOGIN', createdAt: { gte: dayAgo } },
    }),
    prisma.auditLog.count({
      where: { action: 'AUTH_LOGIN', createdAt: { gte: weekAgo } },
    }),
    prisma.order.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.quoteRequest.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.quoteRequest.count({ where: { createdAt: { gte: weekAgo } } }),
  ])

  return {
    generatedAt: now.toISOString(),
    system: {
      environment: env.NODE_ENV,
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: databaseProbe.length > 0 ? ('ok' as const) : ('degraded' as const),
        latencyMs: databaseLatencyMs,
      },
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    },
    users: {
      active: activeUsers,
      total: totalUsers,
      byRole: Object.fromEntries(
        roleGroups.map((row) => [row.role, row._count._all]),
      ) as Record<string, number>,
    },
    catalog: {
      activeProducts,
      totalProducts,
      activeCategories: totalCategories,
    },
    activity: {
      validSessions,
      logins24h,
      logins7d,
      orders24h,
      orders7d,
      quotes24h,
      quotes7d,
    },
    integrations: {
      whatsapp: notificationMode(),
      email: emailMode(),
      bictorys: {
        enabled: env.BICTORYS_ENABLED,
        mode: env.BICTORYS_MODE,
        mock: env.BICTORYS_MOCK,
      },
    },
  }
}

export type InfrastructureOverview = Awaited<
  ReturnType<typeof getInfrastructureOverview>
>
