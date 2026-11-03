import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import request from "supertest"
import { createApp } from "../../src/app.js"
import { prisma } from "../../src/db/prisma.js"
import { sha256 } from "../../src/lib/ids.js"
import { hashPassword } from "../../src/modules/auth/service.js"

const app = createApp()
const client = () => request(app)
const email = `password-reset-${randomUUID()}@allotogo.test`
const initialPassword = "InitialPass!2026"
const newPassword = "UpdatedPass!2026"
let userId: string | null = null

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      name: "Compte test réinitialisation",
      email,
      passwordHash: await hashPassword(initialPassword),
      role: "TECHNICIAN",
    },
    select: { id: true },
  })
  userId = user.id
})

afterAll(async () => {
  if (userId) await prisma.user.deleteMany({ where: { id: userId } })
  vi.restoreAllMocks()
})

describe("réinitialisation du mot de passe", () => {
  it("envoie un lien unique et invalide le lien après usage", async () => {
    const emailOutput = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined)
    const request = await client()
      .post("/api/auth/password-reset/request")
      .send({ email })

    expect(request.status).toBe(202)
    const emailText = String(emailOutput.mock.calls[0]?.[0])
    const tokenMatch = emailText.match(
      /forgot-password\?token=([A-Za-z0-9_-]+)/,
    )
    const token = tokenMatch?.[1]
    expect(token).toBeTruthy()
    if (!token)
      throw new Error("Le lien de réinitialisation n'a pas été envoyé.")
    expect(
      await prisma.passwordResetToken.findUnique({
        where: { tokenHash: sha256(token) },
      }),
    ).toBeTruthy()

    const confirmation = {
      token,
      newPassword,
    }
    expect(
      (
        await client()
          .post("/api/auth/password-reset/confirm")
          .send(confirmation)
      ).status,
    ).toBe(204)
    expect(
      (
        await client()
          .post("/api/auth/password-reset/confirm")
          .send(confirmation)
      ).status,
    ).toBe(400)
    expect(
      (
        await client()
          .post("/api/auth/login")
          .send({ email, password: newPassword })
      ).status,
    ).toBe(200)
    expect(
      (
        await client()
          .post("/api/auth/login")
          .send({ email, password: initialPassword })
      ).status,
    ).toBe(401)
  })
})
