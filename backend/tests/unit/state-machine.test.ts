import { describe, expect, it } from 'vitest'
import {
  ORDER_STATUSES,
  PICKUP_EXPIRED_REASON,
  PICKUP_TIMEOUT_MS,
  canCloseOrder,
  canRecordPayment,
  canTransitionStatus,
  computePaymentStatus,
  isFullyPaid,
  isTerminalStatus,
  orderProgressSteps,
  pickupDeadlineFrom,
  remainingDue,
  type OrderClosureContext,
} from '../../src/modules/orders/stateMachine.js'

const deliveryContext: OrderClosureContext = {
  status: 'COMMANDE_EN_COURS_DE_LIVRAISON',
  fulfillmentMode: 'LIVRAISON',
  total: 35_000,
  paidAmount: 0,
  fulfillmentCompleted: false,
}

const paidDeliveryContext: OrderClosureContext = {
  ...deliveryContext,
  paidAmount: deliveryContext.total,
}

describe('Source de vérité des statuts', () => {
  it('expose exactement les huit statuts métier, sans doublon', () => {
    expect(ORDER_STATUSES).toEqual([
      'EN_ATTENTE_CONFIRMATION',
      'COMMANDE_ACCEPTEE',
      'COMMANDE_EN_PREPARATION',
      'COMMANDE_EN_COURS_DE_LIVRAISON',
      'LIVREE',
      'ECHEC_LIVRAISON',
      'REJETEE',
      'ANNULEE',
    ])
    expect(new Set(ORDER_STATUSES).size).toBe(ORDER_STATUSES.length)
  })

  it('identifie les quatre statuts terminaux', () => {
    for (const status of ['LIVREE', 'ECHEC_LIVRAISON', 'REJETEE', 'ANNULEE'] as const) {
      expect(isTerminalStatus(status)).toBe(true)
    }
    for (const status of ['EN_ATTENTE_CONFIRMATION', 'COMMANDE_ACCEPTEE', 'COMMANDE_EN_PREPARATION', 'COMMANDE_EN_COURS_DE_LIVRAISON'] as const) {
      expect(isTerminalStatus(status)).toBe(false)
    }
  })
})

describe('Règles de clôture des commandes', () => {
  const closedContext: OrderClosureContext = {
    status: 'LIVREE',
    fulfillmentMode: 'LIVRAISON',
    total: 35_000,
    paidAmount: 35_000,
    fulfillmentCompleted: true,
  }

  it('autorise la clôture d’une commande livrée, remise et soldée', () => {
    expect(canCloseOrder(closedContext)).toEqual({ allowed: true, reason: null })
  })

  it('refuse la clôture d’une commande non soldée', () => {
    const result = canCloseOrder({ ...closedContext, paidAmount: 0 })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('paiement intégral')
  })

  it('refuse la clôture si la livraison n’est pas confirmée', () => {
    const result = canCloseOrder({ ...closedContext, status: 'COMMANDE_EN_COURS_DE_LIVRAISON' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('confirmé')
  })

  it('refuse la clôture si la remise effective n’est pas enregistrée', () => {
    const result = canCloseOrder({ ...closedContext, fulfillmentCompleted: false })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('remise')
  })

  it('refuse la clôture d’une commande annulée', () => {
    const result = canCloseOrder({ ...closedContext, status: 'ANNULEE' })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('annulée')
  })
})

describe('Transitions de statut', () => {
  it('accepte la confirmation d’une commande en attente', () => {
    expect(
      canTransitionStatus('EN_ATTENTE_CONFIRMATION', 'COMMANDE_ACCEPTEE', {
        ...deliveryContext,
        status: 'EN_ATTENTE_CONFIRMATION',
      }).allowed,
    ).toBe(true)
  })

  it('autorise le rejet uniquement depuis l’attente de confirmation', () => {
    const pending = { ...deliveryContext, status: 'EN_ATTENTE_CONFIRMATION' as const }
    expect(canTransitionStatus('EN_ATTENTE_CONFIRMATION', 'REJETEE', pending).allowed).toBe(true)
    expect(
      canTransitionStatus('COMMANDE_ACCEPTEE', 'REJETEE', { ...pending, status: 'COMMANDE_ACCEPTEE' }).allowed,
    ).toBe(false)
  })

  it('refuse une transition non prévue', () => {
    const result = canTransitionStatus('EN_ATTENTE_CONFIRMATION', 'LIVREE', {
      ...deliveryContext,
      status: 'EN_ATTENTE_CONFIRMATION',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('non autorisée')
  })

  it('impose préparation puis course pour une livraison', () => {
    expect(
      canTransitionStatus('COMMANDE_ACCEPTEE', 'LIVREE', { ...deliveryContext, status: 'COMMANDE_ACCEPTEE' })
        .allowed,
    ).toBe(false)
    expect(
      canTransitionStatus('COMMANDE_ACCEPTEE', 'COMMANDE_EN_PREPARATION', {
        ...deliveryContext,
        status: 'COMMANDE_ACCEPTEE',
      }).allowed,
    ).toBe(true)
    expect(
      canTransitionStatus('COMMANDE_EN_PREPARATION', 'COMMANDE_EN_COURS_DE_LIVRAISON', {
        ...deliveryContext,
        status: 'COMMANDE_EN_PREPARATION',
      }).allowed,
    ).toBe(true)
    expect(canTransitionStatus('COMMANDE_EN_COURS_DE_LIVRAISON', 'LIVREE', paidDeliveryContext).allowed).toBe(true)
    expect(
      canTransitionStatus('COMMANDE_EN_COURS_DE_LIVRAISON', 'ECHEC_LIVRAISON', deliveryContext).allowed,
    ).toBe(true)
  })

  it('refuse la clôture d’une livraison non soldée', () => {
    const result = canTransitionStatus('COMMANDE_EN_COURS_DE_LIVRAISON', 'LIVREE', deliveryContext)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('paiement intégral')
  })

  it('autorise le retrait en agence depuis l’acceptation uniquement, une fois soldé', () => {
    const pickup = {
      ...paidDeliveryContext,
      fulfillmentMode: 'RETRAIT_AGENCE' as const,
      status: 'COMMANDE_ACCEPTEE' as const,
    }
    expect(canTransitionStatus('COMMANDE_ACCEPTEE', 'LIVREE', pickup).allowed).toBe(true)
    expect(
      canTransitionStatus('COMMANDE_ACCEPTEE', 'LIVREE', { ...pickup, paidAmount: 0 }).allowed,
    ).toBe(false)
    expect(canTransitionStatus('COMMANDE_ACCEPTEE', 'COMMANDE_EN_PREPARATION', pickup).allowed).toBe(false)
    expect(canTransitionStatus('EN_ATTENTE_CONFIRMATION', 'LIVREE', { ...pickup, status: 'EN_ATTENTE_CONFIRMATION' }).allowed).toBe(false)
  })

  it('interdit l’annulation après encaissement', () => {
    const result = canTransitionStatus('COMMANDE_ACCEPTEE', 'ANNULEE', {
      ...deliveryContext,
      status: 'COMMANDE_ACCEPTEE',
      paidAmount: 5_000,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('remboursement')
  })

  it('autorise l’annulation sans paiement', () => {
    expect(
      canTransitionStatus('COMMANDE_ACCEPTEE', 'ANNULEE', {
        ...deliveryContext,
        status: 'COMMANDE_ACCEPTEE',
      }).allowed,
    ).toBe(true)
  })

  it('ne rouvre jamais un statut terminal', () => {
    for (const terminal of ['LIVREE', 'ECHEC_LIVRAISON', 'REJETEE', 'ANNULEE'] as const) {
      for (const target of ORDER_STATUSES) {
        if (target === terminal) continue
        expect(
          canTransitionStatus(terminal, target, { ...deliveryContext, status: terminal }).allowed,
        ).toBe(false)
      }
    }
  })
})

describe('Progression et délai de retrait', () => {
  it('expose une progression livraison et une progression retrait distinctes', () => {
    expect(orderProgressSteps('LIVRAISON')).toHaveLength(5)
    expect(orderProgressSteps('RETRAIT_AGENCE')).toEqual([
      'EN_ATTENTE_CONFIRMATION',
      'COMMANDE_ACCEPTEE',
      'LIVREE',
    ])
    expect(new Set(orderProgressSteps('LIVRAISON')).size).toBe(5)
  })

  it('calcule l’échéance de retrait à 72 heures après acceptation', () => {
    const confirmedAt = new Date('2026-10-01T10:00:00.000Z')
    expect(pickupDeadlineFrom(confirmedAt).toISOString()).toBe('2026-10-04T10:00:00.000Z')
    expect(PICKUP_TIMEOUT_MS).toBe(72 * 60 * 60 * 1000)
    expect(PICKUP_EXPIRED_REASON).toBe('Retrait non effectué dans le délai de 72 heures')
  })
})

describe('Encaissements', () => {
  it('accepte un paiement partiel avant la clôture', () => {
    expect(
      canRecordPayment({
        status: 'COMMANDE_EN_COURS_DE_LIVRAISON',
        total: 10_000,
        paidAmount: 0,
        amount: 4_000,
      }).allowed,
    ).toBe(true)
    expect(
      canRecordPayment({ status: 'COMMANDE_ACCEPTEE', total: 10_000, paidAmount: 0, amount: 4_000 }).allowed,
    ).toBe(true)
  })

  it('refuse un montant supérieur au solde restant dû', () => {
    const result = canRecordPayment({
      status: 'COMMANDE_EN_COURS_DE_LIVRAISON',
      total: 10_000,
      paidAmount: 0,
      amount: 10_001,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('dépasse')
  })

  it('refuse un second paiement sur une commande déjà soldée', () => {
    expect(
      canRecordPayment({
        status: 'COMMANDE_EN_COURS_DE_LIVRAISON',
        total: 10_000,
        paidAmount: 10_000,
        amount: 1_000,
      }).allowed,
    ).toBe(false)
  })

  it('refuse un montant nul ou négatif', () => {
    expect(
      canRecordPayment({ status: 'COMMANDE_EN_COURS_DE_LIVRAISON', total: 10_000, paidAmount: 0, amount: 0 })
        .allowed,
    ).toBe(false)
    expect(
      canRecordPayment({ status: 'COMMANDE_EN_COURS_DE_LIVRAISON', total: 10_000, paidAmount: 0, amount: -500 })
        .allowed,
    ).toBe(false)
  })

  it('refuse tout encaissement après clôture ou sur une commande annulée', () => {
    expect(
      canRecordPayment({ status: 'LIVREE', total: 10_000, paidAmount: 0, amount: 1_000 }).allowed,
    ).toBe(false)
    const cancelled = canRecordPayment({ status: 'ANNULEE', total: 10_000, paidAmount: 0, amount: 1_000 })
    expect(cancelled.allowed).toBe(false)
    expect(cancelled.reason).toContain('annulée')
  })
})

describe('Utilitaires de paiement', () => {
  it('calcule le statut de paiement', () => {
    expect(computePaymentStatus(10_000, 0)).toBe('NON_PAYE')
    expect(computePaymentStatus(10_000, 5_000)).toBe('PARTIELLEMENT_PAYE')
    expect(computePaymentStatus(10_000, 10_000)).toBe('PAYE')
  })

  it('calcule le solde restant sans valeur négative', () => {
    expect(remainingDue(10_000, 4_000)).toBe(6_000)
    expect(remainingDue(10_000, 12_000)).toBe(0)
  })

  it('détecte le paiement intégral', () => {
    expect(isFullyPaid({ total: 10_000, paidAmount: 10_000 })).toBe(true)
    expect(isFullyPaid({ total: 10_000, paidAmount: 9_999 })).toBe(false)
    expect(isFullyPaid({ total: 0, paidAmount: 0 })).toBe(false)
  })
})
