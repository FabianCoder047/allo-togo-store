import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { describe, expect, it } from "vitest"
import { prisma } from "../../src/db/prisma.js"
import { bearer, client, login } from "../helpers/api.js"
import { TEST_ADMIN, TEST_IT } from "../helpers/testEnv.js"

describe("Provisionnement des comptes initiaux", () => {
  it("crée le compte informatique ADMIN avec les identifiants configurés", async () => {
    const user = await prisma.user.findUnique({
      where: { email: TEST_IT.email },
    })

    if (!user)
      throw new Error(
        "Le compte informaticien n’a pas été provisionné par le seed.",
      )
    expect(user.role).toBe("ADMIN")
    expect(user.active).toBe(true)
    expect(await bcrypt.compare(TEST_IT.password, user.passwordHash)).toBe(true)
  })

  it("autorise ADMIN à gérer le personnel sans lui ouvrir le tableau de bord métier", async () => {
    const admin = await login(TEST_IT.email, TEST_IT.password)
    const director = await login(TEST_ADMIN.email, TEST_ADMIN.password)

    const adminUsers = await client()
      .get("/api/admin/users")
      .set(bearer(admin.token))
    const newEmail = `created-by-admin-${randomUUID()}@allotogo.test`
    const createdUser = await client()
      .post("/api/admin/users")
      .set(bearer(admin.token))
      .send({
        name: "Compte créé par ADMIN",
        email: newEmail,
        role: "COMMERCIAL",
      })
    expect(createdUser.status).toBe(201)
    const newUserId = createdUser.body.data.id
    const adminDashboard = await client()
      .get("/api/admin/dashboard")
      .set(bearer(admin.token))
    const updatedUser = await client()
      .patch(`/api/admin/users/${newUserId}`)
      .set(bearer(admin.token))
      .send({ name: "Compte mis à jour par ADMIN" })
    const resetPassword = await client()
      .post(`/api/admin/users/${newUserId}/reset-password`)
      .set(bearer(admin.token))
      .send({ newPassword: "PasswordAdmin!2026" })
    const deactivatedUser = await client()
      .delete(`/api/admin/users/${newUserId}`)
      .set(bearer(admin.token))
    const directorUsers = await client()
      .get("/api/admin/users")
      .set(bearer(director.token))

    expect(adminUsers.status).toBe(200)
    expect(createdUser.body.data.email).toBe(newEmail)
    expect(adminDashboard.status).toBe(403)
    expect(updatedUser.status).toBe(200)
    expect(updatedUser.body.data.name).toBe("Compte mis à jour par ADMIN")
    expect(resetPassword.status).toBe(200)
    expect(deactivatedUser.status).toBe(200)
    expect(deactivatedUser.body.data.active).toBe(false)
    expect(directorUsers.status).toBe(200)
  })
})
