import request from "supertest"
import type { Response } from "supertest"
import { createApp } from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"

export const app = createApp()
export const client = () => request(app)

export type Session = {
  token: string
  user: {
    id: string
    name: string
    email: string
    role: string
    phone: string | null
    mustChangePassword?: boolean
  }
}

export type CheckoutOrder = {
  id: string
  orderNumber: string
  trackingCode: string
  categoryType: "GPS" | "DRINK"
  status: string
  fulfillmentMode: "LIVRAISON" | "RETRAIT_AGENCE"
  requiresTechnician: boolean
  subtotal: number
  deliveryFee: number
  total: number
  items: Array<{
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
}

export type CheckoutResult = {
  groupRef: string
  customer: {
    name: string
    phone: string
    whatsapp: string | null
    email: string | null
  }
  orders: CheckoutOrder[]
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

export const login = async (
  email: string,
  password: string,
): Promise<Session> => {
  const response = await client()
    .post("/api/auth/login")
    .send({ email, password })
  if (response.status !== 200) {
    throw new Error(
      `Connexion impossible (${response.status}) : ${JSON.stringify(response.body)}`,
    )
  }
  const data = response.body.data as {
    accessToken: string
    user: Session["user"]
  }
  return { token: data.accessToken, user: data.user }
}

let phoneSequence = 10_000_000
export const nextPhone = () => {
  phoneSequence += 1
  return `+228${phoneSequence}`
}

export type CheckoutOptions = {
  fulfillmentMode?: "LIVRAISON" | "RETRAIT_AGENCE"
  requiresTechnician?: boolean
  phone?: string
  customerName?: string
  extra?: Record<string, unknown>
}

export const checkout = async (
  items: Array<{ productId: string quantity: number }>,
  options: CheckoutOptions = {},
): Promise<CheckoutResult> => {
  const response = await client()
    .post("/api/orders")
    .send({
      customer: {
        name: options.customerName ?? "Client Test",
        phone: options.phone ?? nextPhone(),
        whatsapp: null,
        email: null,
      },
      fulfillmentMode: options.fulfillmentMode ?? "LIVRAISON",
      delivery: {
        zone: "Lomé",
        address: "Rue de test, quartier Bè, Lomé",
        instructions: null,
        contactPhone: null,
        latitude: 6.1319,
        longitude: 1.2228,
        mapUrl: "https://www.google.com/maps?q=6.1319,1.2228",
      },
      requiresTechnician: options.requiresTechnician ?? false,
      items,
      ...(options.extra ?? {}),
    })
  if (response.status !== 201) {
    throw new Error(
      `Création de commande impossible (${response.status}) : ${JSON.stringify(response.body)}`,
    )
  }
  return response.body.data as CheckoutResult
}

export const confirmOrder = (orderId: string, token: string) =>
  client()
    .post(`/api/orders/${orderId}/confirm`)
    .set(bearer(token))
    .send({ comment: "Confirmation téléphonique de test." })

export const assignTeam = (
  orderId: string,
  token: string,
  staffIds: string[],
  leadStaffId: string,
  instructions?: string,
) =>
  client()
    .post(`/api/orders/${orderId}/assign`)
    .set(bearer(token))
    .send({ staffIds, leadStaffId, instructions })

export const assignOrder = (
  orderId: string,
  token: string,
  staffId: string,
  leadStaffId: string = staffId,
  instructions?: string,
) => assignTeam(orderId, token, [staffId], leadStaffId, instructions)

export const startCourse = (orderId: string, token: string, comment?: string) =>
  client()
    .post(`/api/orders/${orderId}/start`)
    .set(bearer(token))
    .send({ comment })

export const deliverOrder = (
  orderId: string,
  token: string,
  comment?: string,
) =>
  client()
    .post(`/api/orders/${orderId}/deliver`)
    .set(bearer(token))
    .send({ comment })

export const failOrder = (orderId: string, token: string, comment: string) =>
  client()
    .post(`/api/orders/${orderId}/fail`)
    .set(bearer(token))
    .send({ comment })

export const pickupOrder = (orderId: string, token: string, comment?: string) =>
  client()
    .post(`/api/orders/${orderId}/pickup`)
    .set(bearer(token))
    .send({ comment })

export const recordPayment = (
  orderId: string,
  token: string,
  amount: number,
  method = "ESPECES",
  idempotencyKey?: string,
) =>
  client()
    .post(`/api/orders/${orderId}/payments`)
    .set(bearer(token))
    .send({ amount, method, ...(idempotencyKey ? { idempotencyKey } : {}) })

export const getOrder = (orderId: string, token: string) =>
  client().get(`/api/orders/${orderId}`).set(bearer(token))

export const assertStatus = (
  response: Response,
  expected: number,
  label: string,
) => {
  if (response.status !== expected) {
    throw new Error(
      `${label} : statut ${response.status} au lieu de ${expected} — ${JSON.stringify(response.body)}`,
    )
  }
}

export const productBySku = async (sku: string) => {
  const product = await prisma.product.findUnique({ where: { sku } })
  if (!product) throw new Error(`Produit de test introuvable : ${sku}`)
  return product
}
