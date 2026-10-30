import type { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { logger } from '../../config/logger.js'

type AuditInput = {
  actorId?: string | null
  actorType?: 'STAFF' | 'CLIENT' | 'SYSTEM'
  action: string
  entity: string
  entityId: string
  metadata?: Prisma.InputJsonValue
  ip?: string
  userAgent?: string
}

/**
 * Journalise une action critique. L'audit ne doit jamais faire échouer
 * l'opération métier : une erreur est enregistrée dans les logs techniques.
 */
export const audit = async (input: AuditInput) => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorType: input.actorType ?? 'SYSTEM',
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        metadata: input.metadata,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    })
  } catch (error) {
    logger.error({ err: error, action: input.action, entity: input.entity }, 'Échec de journalisation d’audit')
  }
}
