import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/db/prisma.js'
import { expireUncollectedPickupOrders } from '../../src/modules/orders/service.js'
import { TEST_ADMIN, TEST_STAFF } from '../helpers/testEnv.js'
import {
  assignOrder,
  assignTeam,
  assertStatus,
  bearer,
  checkout,
  client,
  confirmOrder,
  deliverOrder,
  failOrder,
  getOrder,
  login,
  pickupOrder,
  productBySku,
  recordPayment,
  startCourse,
  type Session,
} from '../helpers/api.js'

/**
 * Scénarios A–E du correctif workflow :
 * - A : confirmation, affectation, course, remise ;
 * - B : rejet motivé et immuabilité ;
 * - C : assistance technique, échec de livraison ;
 * - D : retrait en agence et expiration 72 h idempotente ;
 * - E : intégrité (concurrence, historique, matrice d'actions).
 */

let admin: Session
let employee: Session
let commercial: Session
let technician: Session
let delivery: Session
let otherDelivery: Session
let drinkProductId: string
let gpsProductId: string

const orderDetail = async (orderId: string, token: string) => {
  const response = await getOrder(orderId, token)
  expect(response.status).toBe(200)
  return response.body.data as {
    id: string
    status: string
    fulfillmentMode: string
    pickupDeadlineAt: string | null
    confirmedAt: string | null
    fulfillmentCompletedAt: string | null
    stockRestored: boolean
    cancellationReason: string | null
    deliveryLatitude: number | null
    deliveryLongitude: number | null
    deliveryMapUrl: string | null
    availableActions: string[]
    history: Array<{
      fromStatus: string | null
      toStatus: string
      actorName: string | null
      actorType: string
      comment: string | null
      createdAt: string
    }>
    assignments: Array<{ isLead: boolean; active: boolean; staff: { id: string; role: string } }>
  }
}

beforeAll(async () => {
  admin = await login(TEST_ADMIN.email, TEST_ADMIN.password)
  employee = await login(TEST_STAFF.employee.email, TEST_STAFF.employee.password)
  commercial = await login(TEST_STAFF.commercial.email, TEST_STAFF.commercial.password)
  technician = await login(TEST_STAFF.technician.email, TEST_STAFF.technician.password)
  delivery = await login(TEST_STAFF.delivery.email, TEST_STAFF.delivery.password)

  const password = 'AutreLivreurAlloTogo!2026'
  await prisma.user.create({
    data: {
      name: 'Livreur Non Affecté',
      email: 'livreur-workflow@allotogo.test',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'DELIVERY',
      active: true,
    },
  })
  otherDelivery = await login('livreur-workflow@allotogo.test', password)

  drinkProductId = (await productBySku('BOIS-EAU-06')).id
  gpsProductId = (await productBySku('GPS-COMPACT-01')).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('Scénario A — parcours de livraison nominal', () => {
  it('confirme, affecte, démarre la course et valide la remise', async () => {
    const order = (await checkout([{ productId: drinkProductId, quantity: 1 }])).orders[0]
    expect(order.status).toBe('EN_ATTENTE_CONFIRMATION')

    const pending = await orderDetail(order.id, admin.token)
    expect(pending.availableActions).toEqual(expect.arrayContaining(['confirm', 'reject', 'cancel']))
    expect(pending.availableActions).not.toContain('start')
    expect(pending.deliveryLatitude).toBeCloseTo(6.1319)
    expect(pending.deliveryLongitude).toBeCloseTo(1.2228)
    expect(pending.deliveryMapUrl).toContain('google.com/maps')

    // L'employé n'a plus le droit de confirmer ni d'affecter.
    expect((await confirmOrder(order.id, employee.token)).status).toBe(403)
    expect((await assignOrder(order.id, employee.token, delivery.user.id)).status).toBe(403)

    const confirmation = await confirmOrder(order.id, commercial.token)
    expect(confirmation.status).toBe(200)
    expect(confirmation.body.data.status).toBe('COMMANDE_ACCEPTEE')

    const accepted = await orderDetail(order.id, admin.token)
    expect(accepted.availableActions).toContain('assign')
    expect(accepted.history.map((entry) => entry.toStatus)).toEqual([
      'EN_ATTENTE_CONFIRMATION',
      'COMMANDE_ACCEPTEE',
    ])

    const assignment = await assignOrder(order.id, admin.token, delivery.user.id)
    expect(assignment.status).toBe(201)
    expect(assignment.body.data.isLead).toBe(true)

    const prepared = await orderDetail(order.id, delivery.token)
    expect(prepared.status).toBe('COMMANDE_EN_PREPARATION')
    expect(prepared.availableActions).toEqual(expect.arrayContaining(['start']))
    expect(prepared.availableActions).not.toContain('assign')

    // Un livreur non affecté est refusé côté API.
    expect((await startCourse(order.id, otherDelivery.token)).status).toBe(403)

    const started = await startCourse(order.id, delivery.token, 'Départ agence.')
    expect(started.status).toBe(200)
    expect(started.body.data.status).toBe('COMMANDE_EN_COURS_DE_LIVRAISON')

    expect((await failOrder(order.id, otherDelivery.token, 'Tentative non autorisée')).status).toBe(403)
    expect((await deliverOrder(order.id, otherDelivery.token)).status).toBe(403)

    const unpaid = await deliverOrder(order.id, delivery.token)
    expect(unpaid.status).toBe(409)
    expect(unpaid.body.error.message).toContain('paiement intégral')

    assertStatus(await recordPayment(order.id, employee.token, order.total), 201, 'paiement')
    const delivered = await deliverOrder(order.id, delivery.token, 'Remis au client.')
    expect(delivered.status).toBe(200)
    expect(delivered.body.data.status).toBe('LIVREE')

    const final = await orderDetail(order.id, admin.token)
    expect(final.fulfillmentCompletedAt).toBeTruthy()
    expect(final.availableActions).toEqual([])
    expect(final.history.map((entry) => entry.toStatus)).toEqual([
      'EN_ATTENTE_CONFIRMATION',
      'COMMANDE_ACCEPTEE',
      'COMMANDE_EN_PREPARATION',
      'COMMANDE_EN_COURS_DE_LIVRAISON',
      'LIVREE',
    ])
    const timestamps = final.history.map((entry) => new Date(entry.createdAt).getTime())
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b))

    // Aucune transition ordinaire sur un statut terminal.
    expect((await deliverOrder(order.id, delivery.token)).status).toBe(403)
    expect((await startCourse(order.id, delivery.token)).status).toBe(403)
    expect(
      (
        await client()
          .patch(`/api/orders/${order.id}/status`)
          .set(bearer(commercial.token))
          .send({ status: 'COMMANDE_ACCEPTEE' })
      ).status,
    ).toBe(403)
  })
})

describe('Scénario B — rejet motivé', () => {
  it('exige un motif, journalise le rejet et bloque la confirmation', async () => {
    const order = (await checkout([{ productId: drinkProductId, quantity: 1 }])).orders[0]

    expect(
      (await client().post(`/api/orders/${order.id}/reject`).set(bearer(commercial.token)).send({ reason: '' }))
        .status,
    ).toBe(400)
    expect(
      (await client().post(`/api/orders/${order.id}/reject`).set(bearer(commercial.token)).send({ reason: '   ' }))
        .status,
    ).toBe(400)
    expect(
      (await client().post(`/api/orders/${order.id}/reject`).set(bearer(commercial.token)).send({})).status,
    ).toBe(400)

    // L'employé ne peut pas rejeter, même avec un motif.
    expect(
      (
        await client()
          .post(`/api/orders/${order.id}/reject`)
          .set(bearer(employee.token))
          .send({ reason: 'Motif quelconque.' })
      ).status,
    ).toBe(403)

    const rejection = await client()
      .post(`/api/orders/${order.id}/reject`)
      .set(bearer(commercial.token))
      .send({ reason: 'Client injoignable, commande non confirmée.' })
    expect(rejection.status).toBe(200)
    expect(rejection.body.data.status).toBe('REJETEE')
    expect(rejection.body.data.stockRestored).toBe(true)

    const final = await orderDetail(order.id, admin.token)
    expect(final.status).toBe('REJETEE')
    expect(final.availableActions).toEqual([])
    expect(final.history.at(-1)?.toStatus).toBe('REJETEE')
    expect(final.history.at(-1)?.comment).toBe('Client injoignable, commande non confirmée.')
    expect(final.history.at(-1)?.actorName).toBe(commercial.user.name)

    expect((await confirmOrder(order.id, commercial.token)).status).toBe(403)
    expect((await pickupOrder(order.id, employee.token)).status).toBe(403)
  })
})

describe('Scénario C — assistance technique et échec de livraison', () => {
  it('exige une équipe mixte et n’enregistre jamais une livraison en échec', async () => {
    const order = (
      await checkout([{ productId: gpsProductId, quantity: 1 }], { requiresTechnician: true })
    ).orders[0]
    expect((await confirmOrder(order.id, commercial.token)).status).toBe(200)

    // Technicien seul : la livraison physique exige aussi un livreur.
    const incomplete = await assignOrder(order.id, admin.token, technician.user.id)
    expect(incomplete.status).toBe(422)
    expect(incomplete.body.error.message).toContain('livreur')

    // Chef hors sélection : refusé par la validation.
    const invalidLead = await assignTeam(order.id, admin.token, [technician.user.id, delivery.user.id], otherDelivery.user.id)
    expect(invalidLead.status).toBe(400)

    // Doublon : refusé.
    const duplicate = await assignTeam(
      order.id,
      admin.token,
      [technician.user.id, technician.user.id, delivery.user.id],
      technician.user.id,
    )
    expect(duplicate.status).toBe(400)

    const team = await assignTeam(
      order.id,
      admin.token,
      [technician.user.id, delivery.user.id],
      technician.user.id,
    )
    expect(team.status).toBe(201)
    expect(team.body.data.team).toHaveLength(2)
    expect(team.body.data.team.filter((member: { isLead: boolean }) => member.isLead)).toHaveLength(1)
    expect(team.body.data.staff.id).toBe(technician.user.id)

    const detail = await orderDetail(order.id, technician.token)
    expect(detail.status).toBe('COMMANDE_EN_PREPARATION')
    expect(detail.assignments.filter((assignment) => assignment.active)).toHaveLength(2)
    expect(detail.availableActions).toContain('start')

    // Le livreur affecté mais non chef ne peut pas démarrer la course.
    const memberView = await orderDetail(order.id, delivery.token)
    expect(memberView.availableActions).not.toContain('start')
    const memberStart = await startCourse(order.id, delivery.token)
    expect(memberStart.status).toBe(403)
    expect(memberStart.body.error.message).toContain('chef d’équipe')

    // Le chef d'équipe démarre la course.
    expect((await startCourse(order.id, technician.token)).status).toBe(200)

    expect((await failOrder(order.id, delivery.token, '   ')).status).toBe(400)
    const failed = await failOrder(order.id, delivery.token, 'Client absent, matériel non remis.')
    expect(failed.status).toBe(200)
    expect(failed.body.data.status).toBe('ECHEC_LIVRAISON')
    expect(failed.body.data.status).not.toBe('LIVREE')

    const final = await orderDetail(order.id, admin.token)
    expect(final.availableActions).toEqual([])
    expect(final.history.at(-1)?.toStatus).toBe('ECHEC_LIVRAISON')
    expect(final.history.at(-1)?.comment).toBe('Client absent, matériel non remis.')

    // Une commande en échec ne peut plus être marquée livrée.
    expect((await deliverOrder(order.id, delivery.token)).status).toBe(403)
  })
})

describe('Scénario D — retrait en agence et expiration 72 h', () => {
  it('confirme le retrait uniquement après acceptation et ne passe pas par l’affectation', async () => {
    const order = (
      await checkout([{ productId: drinkProductId, quantity: 1 }], { fulfillmentMode: 'RETRAIT_AGENCE' })
    ).orders[0]

    // Avant acceptation : aucune action de retrait possible.
    expect((await pickupOrder(order.id, employee.token)).status).toBe(403)

    const confirmedAt = Date.now()
    expect((await confirmOrder(order.id, commercial.token)).status).toBe(200)

    const accepted = await orderDetail(order.id, employee.token)
    expect(accepted.pickupDeadlineAt).toBeTruthy()
    const deadline = new Date(accepted.pickupDeadlineAt!).getTime()
    expect(deadline - confirmedAt).toBeGreaterThan(71.9 * 60 * 60 * 1000)
    expect(deadline - confirmedAt).toBeLessThan(72.1 * 60 * 60 * 1000)
    expect(accepted.availableActions).toContain('pickup')
    expect(accepted.availableActions).not.toContain('assign')
    expect(accepted.assignments).toHaveLength(0)

    // L'affectation est interdite pour un retrait.
    expect((await assignOrder(order.id, admin.token, delivery.user.id)).status).toBe(403)

    const unpaidPickup = await pickupOrder(order.id, employee.token)
    expect(unpaidPickup.status).toBe(409)
    expect(unpaidPickup.body.error.message).toContain('paiement intégral')

    assertStatus(await recordPayment(order.id, employee.token, order.total), 201, 'paiement retrait')
    const pickup = await pickupOrder(order.id, employee.token, 'Retrait au comptoir.')
    expect(pickup.status).toBe(200)
    expect(pickup.body.data.status).toBe('LIVREE')

    const final = await orderDetail(order.id, admin.token)
    expect(final.status).toBe('LIVREE')
    expect(final.fulfillmentCompletedAt).toBeTruthy()
    expect(final.availableActions).toEqual([])

    // Le balayage ne touche jamais une commande déjà retirée.
    const sweep = await expireUncollectedPickupOrders(new Date(Date.now() + 96 * 60 * 60 * 1000))
    expect(sweep.expired).toBe(0)
    expect((await orderDetail(order.id, admin.token)).status).toBe('LIVREE')
  })

  it('annule automatiquement un retrait expiré, une seule fois, avec le motif exact', async () => {
    const order = (
      await checkout([{ productId: drinkProductId, quantity: 1 }], { fulfillmentMode: 'RETRAIT_AGENCE' })
    ).orders[0]
    expect((await confirmOrder(order.id, commercial.token)).status).toBe(200)

    const now = new Date()
    const past = new Date(now.getTime() - 73 * 60 * 60 * 1000)
    await prisma.order.update({
      where: { id: order.id },
      data: { confirmedAt: past, pickupDeadlineAt: past },
    })

    const first = await expireUncollectedPickupOrders(now)
    expect(first.expired).toBeGreaterThanOrEqual(1)

    const expired = await orderDetail(order.id, admin.token)
    expect(expired.status).toBe('ANNULEE')
    expect(expired.cancellationReason).toBe('Retrait non effectué dans le délai de 72 heures')
    expect(expired.stockRestored).toBe(true)
    expect(expired.availableActions).toEqual([])
    expect(expired.history.filter((entry) => entry.toStatus === 'ANNULEE')).toHaveLength(1)
    expect(expired.history.at(-1)?.actorType).toBe('SYSTEM')
    expect(expired.history.at(-1)?.comment).toBe('Retrait non effectué dans le délai de 72 heures')

    // Deuxième balayage : aucune nouvelle annulation, historique inchangé.
    const second = await expireUncollectedPickupOrders(now)
    expect(second.expired).toBe(0)
    const unchanged = await orderDetail(order.id, admin.token)
    expect(unchanged.status).toBe('ANNULEE')
    expect(unchanged.history.filter((entry) => entry.toStatus === 'ANNULEE')).toHaveLength(1)
  })
})

describe('Scénario E — intégrité et concurrence', () => {
  it('ne confirme qu’une fois en cas de double clic simultané', async () => {
    const order = (await checkout([{ productId: drinkProductId, quantity: 1 }])).orders[0]

    const responses = await Promise.all([
      confirmOrder(order.id, admin.token),
      confirmOrder(order.id, commercial.token),
    ])
    const statuses = responses.map((response) => response.status).sort()
    expect(statuses[0]).toBe(200)
    // Selon le moment où la seconde requête lit le statut : 403 (action déjà
    // indisponible) ou 409 (course perdue entre lecture et écriture).
    expect([403, 409]).toContain(statuses[1])

    const detail = await orderDetail(order.id, admin.token)
    expect(detail.status).toBe('COMMANDE_ACCEPTEE')
    expect(detail.history.filter((entry) => entry.toStatus === 'COMMANDE_ACCEPTEE')).toHaveLength(1)
  })

  it('respecte la matrice d’actions et les filtres de liste', async () => {
    const order = (await checkout([{ productId: drinkProductId, quantity: 1 }])).orders[0]
    await confirmOrder(order.id, commercial.token)
    await assignOrder(order.id, admin.token, delivery.user.id)
    await startCourse(order.id, delivery.token)
    assertStatus(await recordPayment(order.id, employee.token, order.total), 201, 'paiement')
    await deliverOrder(order.id, delivery.token)

    const adminDetail = await orderDetail(order.id, admin.token)
    expect(adminDetail.availableActions).toEqual([])

    const filtered = await client()
      .get('/api/orders?status=LIVREE&pageSize=100')
      .set(bearer(admin.token))
    expect(filtered.status).toBe(200)
    const rows = filtered.body.data as Array<{ id: string; status: string }>
    expect(rows.every((row) => row.status === 'LIVREE')).toBe(true)
    expect(rows.filter((row) => row.id === order.id)).toHaveLength(1)

    // Un employé ne voit pas d'action de confirmation sur une commande livrée.
    const employeeView = await orderDetail(order.id, employee.token)
    expect(employeeView.availableActions).not.toContain('confirm')
    expect(employeeView.availableActions).not.toContain('assign')
    expect(employeeView.availableActions).not.toContain('pickup')
  })
})
