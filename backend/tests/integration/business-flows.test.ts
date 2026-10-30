import { createHmac, randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "../../src/db/prisma.js"
import { expireUncollectedPickupOrders } from "../../src/modules/orders/service.js"
import { TEST_ADMIN, TEST_STAFF } from "../helpers/testEnv.js"
import {
  assertStatus,
  assignOrder,
  assignTeam,
  bearer,
  checkout,
  client,
  confirmOrder,
  deliverOrder,
  failOrder,
  getOrder,
  login,
  nextPhone,
  pickupOrder,
  productBySku,
  recordPayment,
  startCourse,
  type Session,
} from "../helpers/api.js"

let admin: Session
let employee: Session
let commercial: Session
let technician: Session
let delivery: Session
let extraDelivery: Session
let gpsProductId: string
let drinkProductId: string

const webhookSecret = () =>
  process.env.BICTORYS_WEBHOOK_SECRET ?? "test-bictorys-webhook-secret"

const postSignedWebhook = async (
  payload: Record<string, unknown>,
  secret = webhookSecret(),
) => {
  const raw = JSON.stringify(payload)
  const signature = createHmac("sha256", secret).update(raw).digest("hex")
  return client()
    .post("/api/payments/bictorys/webhook")
    .set("Content-Type", "application/json")
    .set("x-bictorys-signature", signature)
    .send(raw)
}

const webhookPayload = (
  attempt: { providerRef: string amount: number },
  overrides: Record<string, unknown> = {},
) => ({
  eventId: `evt_${randomUUID()}`,
  providerRef: attempt.providerRef,
  status: "succeeded",
  amount: attempt.amount,
  currency: "XOF",
  ...overrides,
})

const createAttempt = async (orderId: string) => {
  const response = await client()
    .post("/api/payments/bictorys/attempts")
    .set(bearer(admin.token))
    .send({ orderId })
  assertStatus(response, 201, "création de tentative Bictorys")
  return response.body.data as {
    id: string
    providerRef: string
    amount: number
    status: string
  }
}

const preparedDrinkOrder = async () => {
  const created = await checkout([{ productId: drinkProductId, quantity: 1 }])
  const order = created.orders[0]
  assertStatus(
    await confirmOrder(order.id, commercial.token),
    200,
    "confirmation",
  )
  assertStatus(
    await assignOrder(order.id, commercial.token, delivery.user.id),
    201,
    "affectation livreur",
  )
  assertStatus(
    await startCourse(order.id, delivery.token),
    200,
    "démarrage de course",
  )
  return order
}

beforeAll(async () => {
  admin = await login(TEST_ADMIN.email, TEST_ADMIN.password)
  employee = await login(
    TEST_STAFF.commercial.email,
    TEST_STAFF.commercial.password,
  )
  commercial = await login(
    TEST_STAFF.commercial.email,
    TEST_STAFF.commercial.password,
  )
  technician = await login(
    TEST_STAFF.technician.email,
    TEST_STAFF.technician.password,
  )
  delivery = await login(
    TEST_STAFF.delivery.email,
    TEST_STAFF.delivery.password,
  )
  const extraDeliveryPassword = "ExtraLivreurAlloTogo!2026"
  await prisma.user.create({
    data: {
      name: "Deuxième Livreur",
      email: "livreur-2@allotogo.test",
      passwordHash: await bcrypt.hash(extraDeliveryPassword, 10),
      role: "DELIVERY",
      active: true,
    },
  })
  extraDelivery = await login("livreur-2@allotogo.test", extraDeliveryPassword)
  gpsProductId = (await productBySku("GPS-COMPACT-01")).id
  drinkProductId = (await productBySku("BOIS-EAU-06")).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe("Nouveau parcours commercial", () => {
  it("notifie l’agent commercial puis lui permet de confirmer ou refuser", async () => {
    const acceptedOrder = (
      await checkout([{ productId: drinkProductId, quantity: 1 }])
    ).orders[0]
    const notification = await prisma.notification.findFirst({
      where: {
        orderId: acceptedOrder.id,
        recipient: commercial.user.id,
        template: "ORDER_TO_CONFIRM",
      },
    })
    expect(notification).not.toBeNull()

    const confirmation = await confirmOrder(acceptedOrder.id, commercial.token)
    expect(confirmation.status).toBe(200)
    expect(confirmation.body.data.status).toBe("COMMANDE_ACCEPTEE")

    const refusedOrder = (
      await checkout([{ productId: drinkProductId, quantity: 1 }])
    ).orders[0]
    const refusal = await client()
      .post(`/api/orders/${refusedOrder.id}/reject`)
      .set(bearer(commercial.token))
      .send({ reason: "Le client confirme ne pas avoir passé cette commande." })
    expect(refusal.status).toBe(200)
    expect(refusal.body.data.status).toBe("REJETEE")
    expect(refusal.body.data.stockRestored).toBe(true)
  })

  it("donne accès aux deux livreurs et conserve le chef d’équipe choisi", async () => {
    const order = (await checkout([{ productId: drinkProductId, quantity: 1 }]))
      .orders[0]
    await confirmOrder(order.id, commercial.token)
    const assignment = await client()
      .post(`/api/orders/${order.id}/assign`)
      .set(bearer(commercial.token))
      .send({
        staffIds: [delivery.user.id, extraDelivery.user.id],
        leadStaffId: extraDelivery.user.id,
        type: "DELIVERY",
      })
    expect(assignment.status).toBe(201)
    expect(assignment.body.data.team).toHaveLength(2)
    expect(
      assignment.body.data.team.filter(
        (member: { isLead: boolean }) => member.isLead,
      ),
    ).toHaveLength(1)
    expect(assignment.body.data.staff.id).toBe(extraDelivery.user.id)

    const nonLeadDetail = await getOrder(order.id, delivery.token)
    expect(nonLeadDetail.status).toBe(200)
    expect(nonLeadDetail.body.data.availableActions).not.toContain("start")
    expect((await startCourse(order.id, delivery.token)).status).toBe(403)
    assertStatus(
      await startCourse(order.id, extraDelivery.token),
      200,
      "démarrage par le chef d’équipe",
    )
    assertStatus(
      await recordPayment(order.id, commercial.token, order.total),
      201,
      "paiement",
    )
    expect(
      (await deliverOrder(order.id, extraDelivery.token)).body.data.status,
    ).toBe("LIVREE")
  })

  it("annule automatiquement un retrait non récupéré depuis plus de 72 heures", async () => {
    const order = (
      await checkout([{ productId: drinkProductId, quantity: 1 }], {
        fulfillmentMode: "RETRAIT_AGENCE",
      })
    ).orders[0]
    await confirmOrder(order.id, commercial.token)
    const now = new Date()
    const past = new Date(now.getTime() - 73 * 60 * 60 * 1000)
    await prisma.order.update({
      where: { id: order.id },
      data: { confirmedAt: past, pickupDeadlineAt: past },
    })

    expect(await expireUncollectedPickupOrders(now)).toEqual({ expired: 1 })
    const expired = await getOrder(order.id, admin.token)
    expect(expired.body.data.status).toBe("ANNULEE")
    expect(expired.body.data.cancellationReason).toBe(
      "Retrait non effectué dans le délai de 72 heures",
    )
    expect(expired.body.data.stockRestored).toBe(true)
    expect(await expireUncollectedPickupOrders(now)).toEqual({ expired: 0 })
  })
})

describe("Scénario A — commande de traceur avec assistance", () => {
  it("confirme, affecte un technicien, encaisse puis valide la remise", async () => {
    const created = await checkout([{ productId: gpsProductId, quantity: 1 }], {
      requiresTechnician: true,
    })
    expect(created.orders).toHaveLength(1)
    const order = created.orders[0]
    expect(order.categoryType).toBe("GPS")
    expect(order.status).toBe("EN_ATTENTE_CONFIRMATION")
    expect(order.requiresTechnician).toBe(true)
    expect(order.total).toBeGreaterThan(0)

    const confirmed = await confirmOrder(order.id, commercial.token)
    expect(confirmed.status).toBe(200)
    expect(confirmed.body.data.status).toBe("COMMANDE_ACCEPTEE")

    // Assistance technique + livraison physique : une équipe mixte est exigée.
    const assigned = await assignTeam(
      order.id,
      commercial.token,
      [technician.user.id, delivery.user.id],
      technician.user.id,
    )
    expect(assigned.status).toBe(201)
    expect(assigned.body.data.staff.id).toBe(technician.user.id)
    expect(assigned.body.data.team).toHaveLength(2)
    expect(
      assigned.body.data.team.filter(
        (member: { isLead: boolean }) => member.isLead,
      ),
    ).toHaveLength(1)

    const prepared = await getOrder(order.id, technician.token)
    expect(prepared.body.data.status).toBe("COMMANDE_EN_PREPARATION")

    const started = await startCourse(order.id, technician.token)
    expect(started.status).toBe(200)
    expect(started.body.data.status).toBe("COMMANDE_EN_COURS_DE_LIVRAISON")

    const refused = await deliverOrder(order.id, delivery.token)
    expect(refused.status).toBe(409)
    expect(refused.body.error.message).toContain("paiement intégral")

    const payment = await recordPayment(order.id, employee.token, order.total)
    expect(payment.status).toBe(201)
    expect(payment.body.data.order.status).toBe(
      "COMMANDE_EN_COURS_DE_LIVRAISON",
    )
    expect(payment.body.data.order.paymentStatus).toBe("PAYE")
    expect(payment.body.data.order.paidAmount).toBe(order.total)

    const finished = await deliverOrder(order.id, delivery.token)
    expect(finished.status).toBe(200)
    expect(finished.body.data.status).toBe("LIVREE")
    expect(finished.body.data.paymentStatus).toBe("PAYE")
    expect(finished.body.data.fulfillmentCompletedAt).toBeTruthy()

    const detail = await getOrder(order.id, admin.token)
    expect(detail.status).toBe(200)
    expect(detail.body.data.status).toBe("LIVREE")
    expect(detail.body.data.remainingDue).toBe(0)
    expect(detail.body.data.paidAmount).toBe(order.total)
    expect(detail.body.data.closedAt).toBeTruthy()
    expect(
      detail.body.data.history.map(
        (entry: { toStatus: string }) => entry.toStatus,
      ),
    ).toContain("LIVREE")
  })
})

describe("Scénario B — commande de boisson livrée", () => {
  it("confirme, affecte un livreur, encaisse puis termine la livraison", async () => {
    const created = await checkout([{ productId: drinkProductId, quantity: 2 }])
    expect(created.orders).toHaveLength(1)
    const order = created.orders[0]
    expect(order.categoryType).toBe("DRINK")
    expect(order.status).toBe("EN_ATTENTE_CONFIRMATION")
    expect(order.items[0].quantity).toBe(2)

    assertStatus(
      await confirmOrder(order.id, commercial.token),
      200,
      "confirmation",
    )
    assertStatus(
      await assignOrder(order.id, commercial.token, delivery.user.id),
      201,
      "affectation livreur",
    )
    assertStatus(
      await startCourse(order.id, delivery.token),
      200,
      "démarrage de course",
    )
    assertStatus(
      await recordPayment(order.id, employee.token, order.total),
      201,
      "paiement",
    )
    assertStatus(
      await deliverOrder(order.id, delivery.token),
      200,
      "validation de livraison",
    )

    const afterDelivery = await getOrder(order.id, admin.token)
    expect(afterDelivery.status).toBe(200)
    expect(afterDelivery.body.data.status).toBe("LIVREE")
    expect(afterDelivery.body.data.operationalStatus).toBe("TERMINE")
    expect(afterDelivery.body.data.assignedToId).toBe(delivery.user.id)
    expect(afterDelivery.body.data.paymentStatus).toBe("PAYE")
    expect(afterDelivery.body.data.remainingDue).toBe(0)
  })
})

describe("Scénario C — panier mixte", () => {
  it("sépare GPS et boissons en deux commandes liées, avec affectations et statuts indépendants", async () => {
    const created = await checkout(
      [
        { productId: gpsProductId, quantity: 1 },
        { productId: drinkProductId, quantity: 1 },
      ],
      { requiresTechnician: true },
    )
    expect(created.orders).toHaveLength(2)
    expect(created.groupRef).toMatch(/^ATG-/)
    expect(new Set(created.orders.map((order) => order.categoryType))).toEqual(
      new Set(["GPS", "DRINK"]),
    )

    const gpsOrder = created.orders.find(
      (order) => order.categoryType === "GPS",
    )!
    const drinkOrder = created.orders.find(
      (order) => order.categoryType === "DRINK",
    )!
    expect(gpsOrder.id).not.toBe(drinkOrder.id)
    expect(gpsOrder.trackingCode).not.toBe(drinkOrder.trackingCode)

    assertStatus(
      await confirmOrder(gpsOrder.id, commercial.token),
      200,
      "confirmation GPS",
    )
    assertStatus(
      await confirmOrder(drinkOrder.id, commercial.token),
      200,
      "confirmation boissons",
    )
    assertStatus(
      await assignTeam(
        gpsOrder.id,
        commercial.token,
        [technician.user.id, delivery.user.id],
        technician.user.id,
      ),
      201,
      "affectation GPS",
    )
    assertStatus(
      await assignOrder(drinkOrder.id, commercial.token, delivery.user.id),
      201,
      "affectation boissons",
    )

    assertStatus(
      await startCourse(drinkOrder.id, delivery.token),
      200,
      "boissons départ",
    )
    assertStatus(
      await recordPayment(drinkOrder.id, employee.token, drinkOrder.total),
      201,
      "paiement boissons",
    )
    assertStatus(
      await deliverOrder(drinkOrder.id, delivery.token),
      200,
      "boissons remise",
    )

    const gpsBefore = await getOrder(gpsOrder.id, admin.token)
    const drinkAfter = await getOrder(drinkOrder.id, admin.token)
    expect(drinkAfter.body.data.status).toBe("LIVREE")
    expect(drinkAfter.body.data.assignedToId).toBe(delivery.user.id)
    expect(drinkAfter.body.data.paymentStatus).toBe("PAYE")
    expect(gpsBefore.body.data.status).toBe("COMMANDE_EN_PREPARATION")
    expect(gpsBefore.body.data.paidAmount).toBe(0)
    expect(gpsBefore.body.data.assignedToId).toBe(technician.user.id)
    expect(gpsBefore.body.data.group.publicRef).toBe(created.groupRef)

    assertStatus(
      await startCourse(gpsOrder.id, technician.token),
      200,
      "GPS départ",
    )
    assertStatus(
      await recordPayment(gpsOrder.id, employee.token, gpsOrder.total),
      201,
      "paiement GPS",
    )
    assertStatus(
      await deliverOrder(gpsOrder.id, delivery.token),
      200,
      "GPS remise",
    )

    const gpsAfter = await getOrder(gpsOrder.id, admin.token)
    expect(gpsAfter.body.data.status).toBe("LIVREE")
    expect(gpsAfter.body.data.paymentStatus).toBe("PAYE")

    const trackingGps = await client().get(
      `/api/tracking/${gpsOrder.trackingCode}`,
    )
    const trackingDrink = await client().get(
      `/api/tracking/${drinkOrder.trackingCode}`,
    )
    expect(trackingGps.status).toBe(200)
    expect(trackingDrink.status).toBe(200)
    expect(trackingGps.body.data.groupRef).toBe(created.groupRef)
    expect(
      trackingGps.body.data.otherOrders.map(
        (entry: { orderNumber: string }) => entry.orderNumber,
      ),
    ).toContain(drinkOrder.orderNumber)
    expect(
      trackingDrink.body.data.otherOrders.map(
        (entry: { orderNumber: string }) => entry.orderNumber,
      ),
    ).toContain(gpsOrder.orderNumber)
  })
})

describe("Scénario D — retrait en agence", () => {
  it("encaisse le solde avant de valider le retrait, sans affectation", async () => {
    const created = await checkout(
      [{ productId: drinkProductId, quantity: 1 }],
      {
        fulfillmentMode: "RETRAIT_AGENCE",
      },
    )
    const order = created.orders[0]
    expect(order.fulfillmentMode).toBe("RETRAIT_AGENCE")

    const initial = await getOrder(order.id, admin.token)
    expect(initial.status).toBe(200)
    expect(initial.body.data.paymentMode).toBe("PAIEMENT_EN_AGENCE")
    expect(initial.body.data.paymentStatus).toBe("NON_PAYE")
    expect(initial.body.data.assignedToId).toBeNull()
    expect(initial.body.data.assignments).toHaveLength(0)

    assertStatus(
      await confirmOrder(order.id, commercial.token),
      200,
      "confirmation retrait",
    )
    const confirmedPickup = await getOrder(order.id, admin.token)
    expect(confirmedPickup.body.data.pickupDeadlineAt).toBeTruthy()
    expect(confirmedPickup.body.data.availableActions).toContain("pickup")
    expect(confirmedPickup.body.data.availableActions).not.toContain("assign")

    const unpaidPickup = await pickupOrder(order.id, employee.token)
    expect(unpaidPickup.status).toBe(409)
    expect(unpaidPickup.body.error.message).toContain("paiement intégral")

    assertStatus(
      await recordPayment(order.id, employee.token, order.total),
      201,
      "paiement agence",
    )
    assertStatus(
      await pickupOrder(order.id, employee.token),
      200,
      "retrait agence",
    )

    const closed = await getOrder(order.id, admin.token)
    expect(closed.body.data.operationalStatus).toBe("TERMINE")
    expect(closed.body.data.status).toBe("LIVREE")
    expect(closed.body.data.paymentStatus).toBe("PAYE")
    expect(closed.body.data.fulfillmentCompletedAt).toBeTruthy()
    expect(closed.body.data.closedAt).toBeTruthy()
    expect(closed.body.data.remainingDue).toBe(0)
  })
})

describe("Scénario E — paiement obligatoire avant clôture", () => {
  it("refuse la livraison sans paiement intégral, puis l’autorise une fois soldée", async () => {
    const created = await checkout([{ productId: drinkProductId, quantity: 1 }])
    const order = created.orders[0]
    await confirmOrder(order.id, commercial.token)
    await assignOrder(order.id, commercial.token, delivery.user.id)
    await startCourse(order.id, delivery.token)

    const forced = await client()
      .patch(`/api/orders/${order.id}/status`)
      .set(bearer(employee.token))
      .send({ status: "LIVREE" })
    expect(forced.status).toBe(403)

    const unpaid = await deliverOrder(order.id, delivery.token)
    expect(unpaid.status).toBe(409)
    expect(unpaid.body.error.message).toContain("paiement intégral")
    const stillOpen = await getOrder(order.id, admin.token)
    expect(stillOpen.body.data.status).toBe("COMMANDE_EN_COURS_DE_LIVRAISON")
    expect(stillOpen.body.data.paidAmount).toBe(0)

    const partialAmount = 1_000
    const partial = await recordPayment(order.id, employee.token, partialAmount)
    expect(partial.status).toBe(201)
    expect(partial.body.data.order.paymentStatus).toBe("PARTIELLEMENT_PAYE")
    expect(partial.body.data.order.paidAmount).toBe(partialAmount)
    expect(partial.body.data.order.status).toBe(
      "COMMANDE_EN_COURS_DE_LIVRAISON",
    )

    const partiallyPaidDelivery = await deliverOrder(order.id, delivery.token)
    expect(partiallyPaidDelivery.status).toBe(409)

    const afterPartial = await getOrder(order.id, admin.token)
    expect(afterPartial.body.data.remainingDue).toBe(
      order.total - partialAmount,
    )
    expect(afterPartial.body.data.status).toBe("COMMANDE_EN_COURS_DE_LIVRAISON")

    const finalPayment = await recordPayment(
      order.id,
      employee.token,
      order.total - partialAmount,
    )
    expect(finalPayment.status).toBe(201)
    expect(finalPayment.body.data.order.paymentStatus).toBe("PAYE")
    expect(finalPayment.body.data.order.paidAmount).toBe(order.total)
    expect(finalPayment.body.data.order.status).toBe(
      "COMMANDE_EN_COURS_DE_LIVRAISON",
    )

    const delivered = await deliverOrder(order.id, delivery.token)
    assertStatus(delivered, 200, "validation de livraison soldée")
    expect(delivered.body.data.status).toBe("LIVREE")
    expect(delivered.body.data.paymentStatus).toBe("PAYE")
    expect(delivered.body.data.fulfillmentCompletedAt).toBeTruthy()
    expect(delivered.body.data.closedAt).toBeTruthy()
    expect((await getOrder(order.id, admin.token)).body.data.remainingDue).toBe(
      0,
    )
  })
})

describe("Scénario F — paiement Bictorys (fournisseur mock de test)", () => {
  it("encaisse le retrait en agence via Bictorys avant de le valider", async () => {
    const order = (
      await checkout([{ productId: drinkProductId, quantity: 1 }], {
        fulfillmentMode: "RETRAIT_AGENCE",
      })
    ).orders[0]
    await confirmOrder(order.id, commercial.token)
    const attempt = await createAttempt(order.id)
    const completed = await client()
      .post(
        `/api/payments/bictorys/mock/${encodeURIComponent(attempt.providerRef)}/complete`,
      )
      .set(bearer(admin.token))
    expect(completed.status).toBe(200)
    const beforePickup = await getOrder(order.id, admin.token)
    expect(beforePickup.body.data.status).toBe("COMMANDE_ACCEPTEE")
    expect(beforePickup.body.data.paymentStatus).toBe("PAYE")

    assertStatus(
      await pickupOrder(order.id, employee.token),
      200,
      "retrait agence",
    )
    const detail = await getOrder(order.id, admin.token)
    expect(detail.body.data.status).toBe("LIVREE")
    expect(detail.body.data.paymentStatus).toBe("PAYE")
  })

  it("accepte un paiement réussi et réutilise la tentative en attente", async () => {
    const order = await preparedDrinkOrder()
    const first = await createAttempt(order.id)
    expect(first.amount).toBe(order.total)
    expect(first.status).toBe("PENDING")

    const second = await createAttempt(order.id)
    expect(second.id).toBe(first.id)

    const during = await getOrder(order.id, admin.token)
    expect(during.body.data.paymentStatus).toBe("PAIEMENT_EN_COURS")

    const completed = await client()
      .post(
        `/api/payments/bictorys/mock/${encodeURIComponent(first.providerRef)}/complete`,
      )
      .set(bearer(admin.token))
    expect(completed.status).toBe(200)

    const detail = await getOrder(order.id, admin.token)
    expect(detail.body.data.status).toBe("COMMANDE_EN_COURS_DE_LIVRAISON")
    expect(detail.body.data.paymentStatus).toBe("PAYE")
    expect(detail.body.data.paidAmount).toBe(order.total)

    const attempts = await client()
      .get(
        `/api/payments/bictorys/attempts?orderId=${encodeURIComponent(order.id)}`,
      )
      .set(bearer(admin.token))
    expect(attempts.status).toBe(200)
    expect(attempts.body.data[0].status).toBe("SUCCEEDED")

    assertStatus(
      await deliverOrder(order.id, delivery.token),
      200,
      "livraison après paiement Bictorys",
    )
    expect((await getOrder(order.id, admin.token)).body.data.status).toBe(
      "LIVREE",
    )
  })

  it("refuse une tentative après la clôture de la commande", async () => {
    const order = await preparedDrinkOrder()
    assertStatus(
      await recordPayment(order.id, employee.token, order.total),
      201,
      "paiement manuel",
    )
    assertStatus(await deliverOrder(order.id, delivery.token), 200, "livraison")

    const attempt = await client()
      .post("/api/payments/bictorys/attempts")
      .set(bearer(admin.token))
      .send({ orderId: order.id })
    expect(attempt.status).toBe(409)
    expect(attempt.body.error.message).toContain("avant la validation")
  })

  it("refuse une notification avec une signature invalide", async () => {
    const order = await preparedDrinkOrder()
    const attempt = await createAttempt(order.id)
    const response = await postSignedWebhook(
      webhookPayload(attempt),
      "mauvais-secret",
    )
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe("INVALID_SIGNATURE")

    const detail = await getOrder(order.id, admin.token)
    expect(detail.body.data.paidAmount).toBe(0)
  })

  it("enregistre un paiement refusé sans clôturer la commande", async () => {
    const order = await preparedDrinkOrder()
    const attempt = await createAttempt(order.id)
    const response = await postSignedWebhook(
      webhookPayload(attempt, { status: "failed" }),
    )
    expect(response.status).toBe(200)

    const detail = await getOrder(order.id, admin.token)
    expect(detail.body.data.paymentStatus).toBe("ECHEC_PAIEMENT")
    expect(detail.body.data.paidAmount).toBe(0)
    expect(detail.body.data.status).toBe("COMMANDE_EN_COURS_DE_LIVRAISON")

    const attempts = await client()
      .get(
        `/api/payments/bictorys/attempts?orderId=${encodeURIComponent(order.id)}`,
      )
      .set(bearer(admin.token))
    expect(
      attempts.body.data.find(
        (entry: { id: string }) => entry.id === attempt.id,
      ).status,
    ).toBe("FAILED")
  })

  it("ignore une notification répétée sans double encaissement", async () => {
    const order = await preparedDrinkOrder()
    const attempt = await createAttempt(order.id)
    const payload = webhookPayload(attempt)

    const first = await postSignedWebhook(payload)
    expect(first.status).toBe(200)
    expect(first.body.data.duplicate).toBe(false)

    const second = await postSignedWebhook(payload)
    expect(second.status).toBe(200)
    expect(second.body.data.duplicate).toBe(true)

    const detail = await getOrder(order.id, admin.token)
    expect(detail.body.data.paidAmount).toBe(order.total)
    expect(detail.body.data.payments).toHaveLength(1)
    expect(detail.body.data.status).toBe("COMMANDE_EN_COURS_DE_LIVRAISON")
  })

  it("rejette un montant incorrect et laisse la tentative en attente", async () => {
    const order = await preparedDrinkOrder()
    const attempt = await createAttempt(order.id)
    const response = await postSignedWebhook(
      webhookPayload(attempt, { amount: attempt.amount - 100 }),
    )
    expect(response.status).toBe(400)

    const detail = await getOrder(order.id, admin.token)
    expect(detail.body.data.paidAmount).toBe(0)
    expect(detail.body.data.status).toBe("COMMANDE_EN_COURS_DE_LIVRAISON")

    const attempts = await client()
      .get(
        `/api/payments/bictorys/attempts?orderId=${encodeURIComponent(order.id)}`,
      )
      .set(bearer(admin.token))
    expect(
      attempts.body.data.find(
        (entry: { id: string }) => entry.id === attempt.id,
      ).status,
    ).toBe("PENDING")
  })

  it("rejette une référence de transaction inconnue", async () => {
    const providerRef = `mock_inconnu_${randomUUID()}`
    const response = await postSignedWebhook({
      eventId: `evt_${randomUUID()}`,
      providerRef,
      status: "succeeded",
      amount: 1_000,
      currency: "XOF",
    })
    expect(response.status).toBe(404)
    expect(
      await prisma.payment.count({ where: { reference: providerRef } }),
    ).toBe(0)
  })

  it("empêche le frontend de marquer une commande payée sans preuve serveur", async () => {
    const order = await preparedDrinkOrder()

    const unauthPayment = await client()
      .post(`/api/orders/${order.id}/payments`)
      .send({ amount: order.total, method: "ESPECES" })
    expect(unauthPayment.status).toBe(401)

    const unauthAttempt = await client()
      .post("/api/payments/bictorys/attempts")
      .send({ orderId: order.id })
    expect(unauthAttempt.status).toBe(401)

    const deliveryAttempt = await client()
      .post("/api/payments/bictorys/attempts")
      .set(bearer(delivery.token))
      .send({ orderId: order.id })
    expect(deliveryAttempt.status).toBe(403)

    const deliveryStatus = await client()
      .patch(`/api/orders/${order.id}/status`)
      .set(bearer(delivery.token))
      .send({ status: "LIVREE" })
    expect(deliveryStatus.status).toBe(403)

    const forced = await client()
      .patch(`/api/orders/${order.id}/status`)
      .set(bearer(employee.token))
      .send({ status: "LIVREE" })
    expect(forced.status).toBe(403)

    const injected = await checkout(
      [{ productId: drinkProductId, quantity: 1 }],
      {
        extra: { paidAmount: 999_999, paymentStatus: "PAYE" },
      },
    )
    const injectedDetail = await getOrder(injected.orders[0].id, admin.token)
    expect(injectedDetail.body.data.paidAmount).toBe(0)
    expect(injectedDetail.body.data.paymentStatus).toBe("NON_PAYE")
  })
})

describe("Scénario G — autorisations", () => {
  it("un livreur ne peut pas modifier un produit", async () => {
    const category = await prisma.category.findUnique({
      where: { slug: "traceurs-gps" },
    })
    if (!category) throw new Error("Catégorie GPS absente du seed.")

    const response = await client()
      .post("/api/admin/catalog/products")
      .set(bearer(delivery.token))
      .send({
        categoryId: category.id,
        name: "Produit interdit",
        slug: `produit-interdit-${randomUUID().slice(0, 8)}`,
        sku: `SKU-${randomUUID().slice(0, 8)}`,
        type: "GPS",
        shortDescription: "Produit de test.",
        description: "Produit de test pour vérifier les autorisations.",
        price: 10_000,
      })
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe("FORBIDDEN")
  })

  it("un technicien ne peut pas consulter les missions d’un autre technicien", async () => {
    const email = `tech2-${randomUUID()}@allotogo.test`
    const created = await client()
      .post("/api/admin/users")
      .set(bearer(admin.token))
      .send({
        name: "Technicien Deux",
        email,
        role: "TECHNICIAN",
      })
    expect(created.status).toBe(201)
    expect(created.body.data.mustChangePassword).toBe(true)

    // Le mot de passe provisoire est envoyé par email et n’est pas exposé par
    // l’API. Pour ce scénario, l’administrateur le remplace par un mot de passe
    // connu afin de tester les autorisations du technicien.
    const reset = await client()
      .post(`/api/admin/users/${created.body.data.id}/reset-password`)
      .set(bearer(admin.token))
      .send({ newPassword: "TechDeux!2026" })
    expect(reset.status).toBe(200)

    const temporarySession = await login(email, "TechDeux!2026")
    expect(temporarySession.user.mustChangePassword).toBe(true)

    // Tant que le mot de passe provisoire n’a pas été changé, les routes
    // métier sont bloquées même si l’utilisateur possède un jeton valide.
    const blocked = await client()
      .get("/api/staff/missions")
      .set(bearer(temporarySession.token))
    expect(blocked.status).toBe(403)
    expect(blocked.body.error.code).toBe("FORBIDDEN")

    const changed = await client()
      .post("/api/auth/change-password")
      .set(bearer(temporarySession.token))
      .send({
        currentPassword: "TechDeux!2026",
        newPassword: "TechDeuxNew!2026",
      })
    expect(changed.status).toBe(204)

    const secondTechnician = await login(email, "TechDeuxNew!2026")
    expect(secondTechnician.user.mustChangePassword).toBe(false)

    const order = (
      await checkout([{ productId: gpsProductId, quantity: 1 }], {
        requiresTechnician: true,
      })
    ).orders[0]
    assertStatus(
      await confirmOrder(order.id, commercial.token),
      200,
      "confirmation mission",
    )
    assertStatus(
      await assignTeam(
        order.id,
        commercial.token,
        [technician.user.id, delivery.user.id],
        technician.user.id,
      ),
      201,
      "affectation mission",
    )

    const foreignMission = await client()
      .get(`/api/staff/missions/${order.id}`)
      .set(bearer(secondTechnician.token))
    expect(foreignMission.status).toBe(404)

    const foreignOrder = await getOrder(order.id, secondTechnician.token)
    expect(foreignOrder.status).toBe(403)

    const foreignList = await client()
      .get("/api/staff/missions")
      .set(bearer(secondTechnician.token))
    expect(foreignList.status).toBe(200)
    expect(
      foreignList.body.data.map((entry: { id: string }) => entry.id),
    ).not.toContain(order.id)

    const ownerList = await client()
      .get("/api/staff/missions")
      .set(bearer(technician.token))
    expect(ownerList.status).toBe(200)
    expect(
      ownerList.body.data.map((entry: { id: string }) => entry.id),
    ).toContain(order.id)
  })

  it("un client ne peut pas consulter les données privées d’une autre commande", async () => {
    const phoneA = nextPhone()
    const phoneB = nextPhone()
    const orderA = (
      await checkout([{ productId: drinkProductId, quantity: 1 }], {
        phone: phoneA,
      })
    ).orders[0]
    const orderB = (
      await checkout([{ productId: drinkProductId, quantity: 1 }], {
        phone: phoneB,
      })
    ).orders[0]

    const publicA = await client().get(`/api/tracking/${orderA.trackingCode}`)
    expect(publicA.status).toBe(200)
    expect(publicA.body.data.customerPhone).toBeUndefined()
    expect(publicA.body.data.customerEmail).toBeUndefined()
    expect(publicA.body.data.deliveryAddress).toBeUndefined()
    expect(publicA.body.data.notes).toBeUndefined()
    expect(publicA.body.data.payments).toBeUndefined()
    expect(publicA.body.data.assignedToId).toBeUndefined()

    const wrongPhone = await client()
      .post(`/api/tracking/${orderA.trackingCode}/access`)
      .send({ phone: phoneB })
    expect(wrongPhone.status).toBe(404)

    const accessA = await client()
      .post(`/api/tracking/${orderA.trackingCode}/access`)
      .send({ phone: phoneA })
    expect(accessA.status).toBe(201)
    const tokenA = accessA.body.data.token as string

    const crossRead = await client().get(
      `/api/tracking/${orderB.trackingCode}/messages?token=${encodeURIComponent(tokenA)}`,
    )
    expect(crossRead.status).toBe(401)

    const crossWrite = await client()
      .post(
        `/api/tracking/${orderB.trackingCode}/messages?token=${encodeURIComponent(tokenA)}`,
      )
      .send({ body: "Message interdit" })
    expect(crossWrite.status).toBe(401)

    const note = await client()
      .post(`/api/orders/${orderA.id}/notes`)
      .set(bearer(admin.token))
      .send({ body: "Note interne ultra confidentielle" })
    expect(note.status).toBe(201)

    const publicAfterNote = await client().get(
      `/api/tracking/${orderA.trackingCode}`,
    )
    expect(JSON.stringify(publicAfterNote.body)).not.toContain(
      "ultra confidentielle",
    )

    const messagesA = await client().get(
      `/api/tracking/${orderA.trackingCode}/messages?token=${encodeURIComponent(tokenA)}`,
    )
    expect(messagesA.status).toBe(200)
    expect(JSON.stringify(messagesA.body)).not.toContain("ultra confidentielle")
    expect(JSON.stringify(messagesA.body)).not.toContain(
      "à confirmer par téléphone",
    )
  })
})

describe("Scénario H — demande de devis", () => {
  it("enregistre une demande de devis et la rend visible au back-office", async () => {
    const phone = nextPhone()
    const created = await client().post("/api/quotes").send({
      name: "Ama Devis",
      phone,
      email: "ama.devis@example.com",
      message:
        "Je souhaite un devis pour équiper douze véhicules de la flotte.",
    })
    assertStatus(created, 201, "création de la demande de devis")
    expect(created.body.data.status).toBe("NOUVELLE")

    const list = await client()
      .get("/api/quotes?pageSize=100")
      .set(bearer(employee.token))
    assertStatus(list, 200, "liste des demandes de devis")
    const found = list.body.data.find(
      (quote: { id: string }) => quote.id === created.body.data.id,
    )
    expect(found).toBeTruthy()
    expect(found.phone).toBe(phone)

    const updated = await client()
      .patch(`/api/quotes/${created.body.data.id}`)
      .set(bearer(employee.token))
      .send({ status: "EN_COURS_DE_TRAITEMENT" })
    assertStatus(updated, 200, "mise à jour du devis")
    expect(updated.body.data.status).toBe("EN_COURS_DE_TRAITEMENT")
  })
})

describe("Scénario I — file de notifications WhatsApp", () => {
  it("met la confirmation en file puis la traite avec le fournisseur simulé", async () => {
    const created = await checkout([{ productId: drinkProductId, quantity: 1 }])
    const order = created.orders[0]

    const queued = await client()
      .get("/api/admin/notifications?status=PENDING")
      .set(bearer(admin.token))
    assertStatus(queued, 200, "file de notifications")
    const notification = queued.body.data.find(
      (entry: { orderId: string | null template: string }) =>
        entry.orderId === order.id && entry.template === "ORDER_CREATED",
    )
    expect(notification).toBeTruthy()
    expect(notification.status).toBe("PENDING")

    const processed = await client()
      .post("/api/admin/notifications/process")
      .set(bearer(admin.token))
    assertStatus(processed, 200, "traitement des notifications")
    expect(processed.body.data.sent).toBeGreaterThan(0)

    // La file peut contenir plus de 50 notifications issues des scénarios
    // précédents : traiter par lots jusqu'à ce que la notification cible passe.
    let stored = await prisma.notification.findUnique({
      where: { id: notification.id },
    })
    for (
      let attempt = 0;
      attempt < 20 && stored?.status === "PENDING";
      attempt += 1
    ) {
      const next = await client()
        .post("/api/admin/notifications/process")
        .set(bearer(admin.token))
      assertStatus(next, 200, "traitement suivant des notifications")
      stored = await prisma.notification.findUnique({
        where: { id: notification.id },
      })
    }
    expect(stored?.status).toBe("SENT")
    expect(stored?.sentAt).toBeTruthy()
    const payload = stored?.payload as {
      simulated?: boolean
      providerMessageId?: string
    }
    expect(payload.simulated).toBe(true)
    expect(payload.providerMessageId).toContain("simulated")
  })
})

describe("Scénario J — notes vocales, médias et localisation", () => {
  const openClientConversation = async () => {
    const phone = nextPhone()
    const created = await checkout(
      [{ productId: drinkProductId, quantity: 1 }],
      { phone },
    )
    const order = created.orders[0]
    const access = await client()
      .post(`/api/tracking/${order.trackingCode}/access`)
      .send({ phone })
    assertStatus(access, 201, "ouverture de la conversation client")
    return { order, token: access.body.data.token as string }
  }

  it("accepte une note vocale, une image, une vidéo et une localisation, puis les rend visibles au staff", async () => {
    const { order, token } = await openClientConversation()
    const url = `/api/tracking/${order.trackingCode}/messages?token=${encodeURIComponent(token)}`
    const audioData = `data:audio/webm;base64,${Buffer.from("note-vocale-de-test").toString("base64")}`
    const imageData = `data:image/png;base64,${Buffer.from("image-de-test").toString("base64")}`
    const videoData = `data:video/mp4;base64,${Buffer.from("video-de-test").toString("base64")}`

    const audio = await client()
      .post(url)
      .send({ kind: "AUDIO", audioData, durationMs: 3_200 })
    assertStatus(audio, 201, "envoi de la note vocale")
    expect(audio.body.data.kind).toBe("AUDIO")
    expect(audio.body.data.durationMs).toBe(3_200)
    expect(audio.body.data.audioData).toBe(audioData)

    const image = await client().post(url).send({
      kind: "IMAGE",
      mediaData: imageData,
      mediaMimeType: "image/png",
      mediaName: "photo-test.png",
      mediaSize: 512,
    })
    assertStatus(image, 201, "envoi de l’image")
    expect(image.body.data.kind).toBe("IMAGE")
    expect(image.body.data.mediaData).toBe(imageData)
    expect(image.body.data.mediaName).toBe("photo-test.png")

    const video = await client().post(url).send({
      kind: "VIDEO",
      mediaData: videoData,
      mediaMimeType: "video/mp4",
      mediaName: "clip-test.mp4",
      mediaSize: 2_048,
      durationMs: 5_400,
    })
    assertStatus(video, 201, "envoi de la vidéo")
    expect(video.body.data.kind).toBe("VIDEO")
    expect(video.body.data.mediaData).toBe(videoData)
    expect(video.body.data.durationMs).toBe(5_400)

    const location = await client().post(url).send({
      kind: "LOCATION",
      latitude: 6.1319,
      longitude: 1.2228,
      accuracy: 12,
      locationLabel: "Agence Allo Togo",
    })
    assertStatus(location, 201, "partage de localisation")
    expect(location.body.data.kind).toBe("LOCATION")
    expect(location.body.data.latitude).toBeCloseTo(6.1319)
    expect(location.body.data.longitude).toBeCloseTo(1.2228)

    const messages = await client().get(url)
    assertStatus(messages, 200, "lecture des messages client")
    expect(
      messages.body.data.messages
        .slice(-4)
        .map((message: { kind: string }) => message.kind),
    ).toEqual(["AUDIO", "IMAGE", "VIDEO", "LOCATION"])

    const detail = await getOrder(order.id, admin.token)
    assertStatus(detail, 200, "détail de commande staff")
    const clientConversation = detail.body.data.conversations.find(
      (conversation: { visibility: string }) =>
        conversation.visibility === "CLIENT",
    )
    expect(clientConversation).toBeTruthy()
    expect(
      clientConversation.messages.some(
        (message: { kind: string }) => message.kind === "AUDIO",
      ),
    ).toBe(true)
    expect(
      clientConversation.messages.some(
        (message: { kind: string }) => message.kind === "IMAGE",
      ),
    ).toBe(true)
    expect(
      clientConversation.messages.some(
        (message: { kind: string }) => message.kind === "VIDEO",
      ),
    ).toBe(true)
    expect(
      clientConversation.messages.some(
        (message: { kind: string }) => message.kind === "LOCATION",
      ),
    ).toBe(true)
  })

  it("rejette les pièces jointes invalides", async () => {
    const { order, token } = await openClientConversation()
    const url = `/api/tracking/${order.trackingCode}/messages?token=${encodeURIComponent(token)}`

    const wrongAudio = await client()
      .post(url)
      .send({
        kind: "AUDIO",
        audioData: "data:text/plain;base64,QQ==",
        durationMs: 1_000,
      })
    expect(wrongAudio.status).toBe(400)

    const tooLong = await client()
      .post(url)
      .send({
        kind: "AUDIO",
        audioData: "data:audio/webm;base64,QQ==",
        durationMs: 200_000,
      })
    expect(tooLong.status).toBe(400)

    const wrongImage = await client()
      .post(url)
      .send({ kind: "IMAGE", mediaData: "data:text/plain;base64,QQ==" })
    expect(wrongImage.status).toBe(400)

    const wrongVideo = await client()
      .post(url)
      .send({ kind: "VIDEO", mediaData: "data:image/png;base64,QQ==" })
    expect(wrongVideo.status).toBe(400)

    const missingMedia = await client().post(url).send({ kind: "IMAGE" })
    expect(missingMedia.status).toBe(400)

    const missingCoords = await client()
      .post(url)
      .send({ kind: "LOCATION", latitude: 6.1 })
    expect(missingCoords.status).toBe(400)

    const outOfRange = await client()
      .post(url)
      .send({ kind: "LOCATION", latitude: 120, longitude: 1.2 })
    expect(outOfRange.status).toBe(400)
  })
})
