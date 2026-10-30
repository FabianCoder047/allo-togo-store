import bcrypt from "bcryptjs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "../../src/db/prisma.js"
import { TEST_STAFF } from "../helpers/testEnv.js"
import {
  assignTeam,
  checkout,
  client,
  confirmOrder,
  deliverOrder,
  getOrder,
  login,
  nextPhone,
  productBySku,
  recordPayment,
  startCourse,
  type Session,
} from "../helpers/api.js"

let commercial: Session
let employee: Session
let delivery: Session
let otherDelivery: Session
let otherDeliveryId: string
let productId: string

const startDelivery = async (
  orderId: string,
  staffIds = [delivery.user.id],
  leadId = delivery.user.id,
) => {
  expect((await confirmOrder(orderId, commercial.token)).status).toBe(200)
  expect(
    (await assignTeam(orderId, commercial.token, staffIds, leadId)).status,
  ).toBe(201)
  expect((await startCourse(orderId, delivery.token)).status).toBe(200)
}

const getCustomerToken = async (trackingCode: string, phone: string) => {
  const response = await client()
    .post(`/api/tracking/${trackingCode}/access`)
    .send({ phone })
  expect(response.status).toBe(201)
  return response.body.data.token as string
}

describe("Paiement client depuis le suivi de livraison", () => {
  beforeAll(async () => {
    commercial = await login(
      TEST_STAFF.commercial.email,
      TEST_STAFF.commercial.password,
    )
    employee = await login(
      TEST_STAFF.employee.email,
      TEST_STAFF.employee.password,
    )
    delivery = await login(
      TEST_STAFF.delivery.email,
      TEST_STAFF.delivery.password,
    )
    const password = "EquipeLivraisonSuivi!2026"
    const other = await prisma.user.create({
      data: {
        name: "Livreur équipier suivi",
        email: `livreur-suivi-${Date.now()}@allotogo.test`,
        passwordHash: await bcrypt.hash(password, 10),
        role: "DELIVERY",
      },
    })
    otherDeliveryId = other.id
    otherDelivery = await login(other.email, password)
    productId = (await productBySku("BOIS-EAU-06")).id
  })

  afterAll(async () => {
    if (otherDeliveryId) {
      await prisma.deliveryAssignment.deleteMany({
        where: { staffId: otherDeliveryId },
      })
      await prisma.order.updateMany({
        where: { assignedToId: otherDeliveryId },
        data: { assignedToId: null },
      })
      await prisma.user.delete({ where: { id: otherDeliveryId } })
    }
    await prisma.$disconnect()
  })

  it("enregistre le choix espèces puis la remise différée du staff avec audit et horodatage", async () => {
    const phone = nextPhone()
    const order = (await checkout([{ productId, quantity: 1 }], { phone }))
      .orders[0]
    await startDelivery(order.id, [delivery.user.id, otherDelivery.user.id])
    const token = await getCustomerToken(order.trackingCode, phone)

    const selected = await client()
      .post(
        `/api/tracking/${order.trackingCode}/payment-choice?token=${encodeURIComponent(token)}`,
      )
      .send({ choice: "ESPECES" })
    expect(selected.status).toBe(200)
    expect(selected.body.data.choice).toBe("ESPECES")
    expect(selected.body.data.paymentStatus).toBe("NON_PAYE")

    const nonLeadDelivery = await deliverOrder(order.id, otherDelivery.token)
    expect(nonLeadDelivery.status).toBe(403)

    const delivered = await deliverOrder(order.id, delivery.token)
    expect(delivered.status).toBe(200)
    expect(delivered.body.data.paidAmount).toBe(0)
    expect(delivered.body.data.closedAt).toBeNull()

    expect((await recordPayment(order.id, employee.token, 1_000)).status).toBe(
      403,
    )
    const firstAmount = Math.min(1_000, order.total - 1)
    const firstPayment = await recordPayment(
      order.id,
      commercial.token,
      firstAmount,
    )
    expect(firstPayment.status).toBe(201)
    expect(firstPayment.body.data.created.receivedById).toBe(commercial.user.id)
    expect(firstPayment.body.data.created.createdAt).toBeTruthy()
    expect(firstPayment.body.data.order.closedAt).toBeNull()

    const remaining = order.total - firstAmount
    const finalPayment = await recordPayment(
      order.id,
      commercial.token,
      remaining,
    )
    expect(finalPayment.status).toBe(201)
    expect(finalPayment.body.data.order.paymentStatus).toBe("PAYE")
    expect(finalPayment.body.data.order.closedAt).toBeTruthy()

    const auditEntries = await prisma.auditLog.findMany({
      where: {
        entity: "Payment",
        action: "PAYMENT_RECORDED",
        actorId: commercial.user.id,
      },
      orderBy: { createdAt: "desc" },
      take: 2,
    })
    expect(auditEntries).toHaveLength(2)
    expect(
      auditEntries.every(
        (entry) =>
          (entry.metadata as { stage?: string }).stage === "TEAM_CASH_HANDOVER",
      ),
    ).toBe(true)
  })

  it("valide les préfixes Flooz/Yas et journalise la déclaration mobile sans marquer la commande payée", async () => {
    const phone = nextPhone()
    const order = (await checkout([{ productId, quantity: 1 }], { phone }))
      .orders[0]
    await startDelivery(order.id)
    const token = await getCustomerToken(order.trackingCode, phone)
    const url = `/api/tracking/${order.trackingCode}/payment-choice?token=${encodeURIComponent(token)}`

    expect(
      (await client().post(url).send({ choice: "FLOOZ", phone: "70123456" }))
        .status,
    ).toBe(400)
    expect(
      (
        await client()
          .post(url)
          .send({ choice: "MIXX_BY_YAS", phone: "78123456" })
      ).status,
    ).toBe(400)
    expect(
      (await client().post(url).send({ choice: "FLOOZ", phone: "7812345" }))
        .status,
    ).toBe(400)

    const confirmed = await client()
      .post(url)
      .send({ choice: "FLOOZ", phone: "78123456" })
    expect(confirmed.status).toBe(200)
    expect(confirmed.body.data.paymentStatus).toBe("NON_PAYE")

    const tracking = await client().get(`/api/tracking/${order.trackingCode}`)
    expect(tracking.body.data.customerPaymentChoice).toBe("FLOOZ")
    expect(tracking.body.data.customerPaymentPhone).toBeUndefined()
    // Une déclaration mobile n'est pas un encaissement : le chef d'équipe doit
    // vérifier la capture avant tout paiement enregistré.
    expect(await prisma.payment.findFirst({ where: { orderId: order.id } })).toBeNull()
    const auditEntry = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityId: order.id,
        action: "CUSTOMER_MOBILE_MONEY_DECLARED",
      },
    })
    expect(auditEntry.actorType).toBe("CLIENT")
    const metadata = auditEntry.metadata as {
      verification?: string
      phoneLastFour?: string
    }
    expect(metadata.verification).toBe("CUSTOMER_DECLARATION")
    expect(metadata.phoneLastFour).toBe("3456")
  })
})
