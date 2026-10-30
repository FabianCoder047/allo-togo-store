import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'

export type BictorysWebhookEvent = {
  eventId: string
  providerRef: string
  status: 'succeeded' | 'failed' | 'expired' | 'pending'
  amount: number
  currency: string
  raw: Record<string, unknown>
}

export type BictorysAttemptResult = {
  providerRef: string
  checkoutUrl: string | null
  status: 'PENDING'
}

export interface BictorysProvider {
  readonly name: string
  createAttempt(input: { orderId: string; amount: number; currency: string; reference: string }): Promise<BictorysAttemptResult>
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<BictorysWebhookEvent>
  verifyTransaction(providerRef: string): Promise<{ status: string; amount: number; currency: string }>
}

/**
 * Fournisseur local utilisé uniquement pour les tests automatisés et le
 * développement. Il n'appelle aucun service externe.
 */
export class MockBictorysProvider implements BictorysProvider {
  readonly name = 'mock'

  async createAttempt(input: { orderId: string; amount: number; currency: string; reference: string }) {
    const providerRef = `mock_${randomBytes(10).toString('hex')}`
    return {
      providerRef,
      checkoutUrl: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/paiement/simule/${providerRef}`,
      status: 'PENDING' as const,
    }
  }

  async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    const signature = headers[env.BICTORYS_SIGNATURE_HEADER.toLowerCase()]
    const provided = Array.isArray(signature) ? signature[0] : signature
    const secret = env.BICTORYS_WEBHOOK_SECRET ?? 'mock-webhook-secret'
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    if (!provided || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'Signature de notification invalide.')
    }
    const payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>
    return {
      eventId: String(payload.eventId ?? ''),
      providerRef: String(payload.providerRef ?? ''),
      status: String(payload.status ?? 'pending') as BictorysWebhookEvent['status'],
      amount: Number(payload.amount ?? 0),
      currency: String(payload.currency ?? 'XOF'),
      raw: payload,
    }
  }

  async verifyTransaction(providerRef: string) {
    return { status: 'succeeded', amount: 0, currency: 'XOF' }
  }
}

/**
 * Adaptateur réel volontairement non finalisé : la documentation officielle
 * Bictorys (URLs, en-têtes, signature et format de webhook) n'est pas fournie.
 * Aucun paramètre n'est inventé ici. Voir docs/BICTORYS.md.
 */
export class HttpBictorysProvider implements BictorysProvider {
  readonly name = 'bictorys'

  async createAttempt(): Promise<BictorysAttemptResult> {
    throw new AppError(
      501,
      'BICTORYS_NOT_CONFIGURED',
      'L’intégration Bictorys doit être finalisée avec la documentation officielle et les identifiants de test Allo Togo.',
    )
  }

  async verifyWebhook(): Promise<BictorysWebhookEvent> {
    throw new AppError(
      501,
      'BICTORYS_NOT_CONFIGURED',
      'La vérification des notifications Bictorys doit être configurée selon le mécanisme officiel du fournisseur.',
    )
  }

  async verifyTransaction(): Promise<{ status: string; amount: number; currency: string }> {
    throw new AppError(
      501,
      'BICTORYS_NOT_CONFIGURED',
      'La vérification serveur-à-serveur Bictorys doit être configurée selon la documentation officielle.',
    )
  }
}

export const getBictorysProvider = (): BictorysProvider => {
  if (env.BICTORYS_MOCK && !env.isProduction) return new MockBictorysProvider()
  return new HttpBictorysProvider()
}
