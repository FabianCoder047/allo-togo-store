import http from 'node:http'
import { Server as SocketServer } from 'socket.io'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { isAllowedOrigin } from './config/cors.js'
import { logger } from './config/logger.js'
import { prisma } from './db/prisma.js'
import { pruneTechnicalLogs } from './config/technicalLogs.js'
import { verifyAccessToken } from './modules/auth/service.js'
import { expireUncollectedPickupOrders } from './modules/orders/service.js'
import { processPendingNotifications } from './modules/notifications/service.js'
import { realtime } from './realtime/events.js'

const app = createApp()
const server = http.createServer(app)

const io = new SocketServer(server, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  },
  path: '/socket.io',
})

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined
  if (!token) return next(new Error('UNAUTHORIZED'))
  try {
    const user = verifyAccessToken(token)
    if (user.mustChangePassword) return next(new Error('PASSWORD_CHANGE_REQUIRED'))
    socket.data.user = user
    return next()
  } catch {
    return next(new Error('UNAUTHORIZED'))
  }
})

io.on('connection', (socket) => {
  const user = socket.data.user as { id: string; role: string; name: string }
  socket.join(`staff:${user.id}`)
  if (user.role === 'DIRECTOR' || user.role === 'EMPLOYEE' || user.role === 'COMMERCIAL') socket.join('staff:all')

  socket.on('join:order', async (orderId: string, ack?: (response: { ok: boolean; error?: string }) => void) => {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { assignments: { where: { active: true }, select: { staffId: true } } },
      })
      if (!order) {
        ack?.({ ok: false, error: 'Commande introuvable.' })
        return
      }
      if (
        (user.role === 'TECHNICIAN' || user.role === 'DELIVERY') &&
        !order.assignments.some((assignment) => assignment.staffId === user.id)
      ) {
        ack?.({ ok: false, error: 'Accès refusé.' })
        return
      }
      await socket.join(`order:${orderId}`)
      ack?.({ ok: true })
    } catch {
      ack?.({ ok: false, error: 'Erreur serveur.' })
    }
  })
})

realtime.on('message:new', (payload: { orderId: string; visibility: string }) => {
  io.to(`order:${payload.orderId}`).emit('message:new', payload)
})

realtime.on('order:new', (payload: { orderId: string }) => {
  io.to('staff:all').emit('order:new', payload)
})

// Les questions que l’assistant ne peut pas résoudre sont diffusées aux
// comptes DIRECTOR, EMPLOYEE et COMMERCIAL connectés (salon staff:all).
realtime.on(
  'assistant:escalation',
  (payload: {
    reference: string
    customerMessage: string
    createdAt: string
    staffIds: string[]
    threadId: string
    sessionId: string | null
  }) => {
    io.to('staff:all').emit('assistant:escalation', payload)
  },
)

// Une réponse d'employé dans une discussion assistant est poussée aux autres
// employés connectés pour que le panneau reste synchronisé.
realtime.on(
  'assistant:support-message',
  (payload: { threadId: string; sessionId: string | null; reference: string; message: unknown }) => {
    io.to('staff:all').emit('assistant:support-message', payload)
  },
)

realtime.on(
  'assistant:support-status',
  (payload: { threadId: string; sessionId: string | null; reference: string; status: string }) => {
    io.to('staff:all').emit('assistant:support-status', payload)
  },
)

const notificationTimer = setInterval(() => {
  processPendingNotifications(20).catch((error) => logger.error({ err: error }, 'Échec du traitement des notifications'))
}, 30_000)
notificationTimer.unref()

const technicalLogCleanupTimer = setInterval(() => {
  pruneTechnicalLogs().catch((error) =>
    logger.error({ err: error }, 'Échec du nettoyage des journaux techniques'),
  )
}, 24 * 60 * 60 * 1000)
technicalLogCleanupTimer.unref()

pruneTechnicalLogs().catch((error) =>
  logger.error({ err: error }, 'Échec du nettoyage initial des journaux techniques'),
)

const pickupExpiryTimer = setInterval(() => {
  expireUncollectedPickupOrders().catch((error) => logger.error({ err: error }, 'Échec de l’expiration des retraits'))
}, 30_000)
pickupExpiryTimer.unref()

// Balayage initial : une commande déjà expirée est annulée au démarrage, sans
// attendre qu'un utilisateur ouvre l'application.
expireUncollectedPickupOrders().catch((error) =>
  logger.error({ err: error }, 'Échec du balayage initial des retraits expirés'),
)

server.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
      docs: `http://localhost:${env.PORT}/api/docs`,
      whatsapp: env.WHATSAPP_PROVIDER,
      email: env.EMAIL_PROVIDER,
      bictorys: { enabled: env.BICTORYS_ENABLED, mode: env.BICTORYS_MODE, mock: env.BICTORYS_MOCK },
    },
    'API Allo Togo Store démarrée',
  )
})

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Arrêt du serveur')
  clearInterval(notificationTimer)
  clearInterval(technicalLogCleanupTimer)
  clearInterval(pickupExpiryTimer)
  io.close()
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
