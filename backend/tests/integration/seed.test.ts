import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { describe, expect, it } from "vitest"
import { prisma } from "../../src/db/prisma.js"
import { signAccessToken } from "../../src/modules/auth/service.js"
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
    const userToken = signAccessToken({
      id: newUserId,
      name: createdUser.body.data.name,
      email: createdUser.body.data.email,
      role: createdUser.body.data.role,
      mustChangePassword: createdUser.body.data.mustChangePassword,
    })
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
    const pausedUser = await client()
      .patch(`/api/admin/users/${newUserId}`)
      .set(bearer(admin.token))
      .send({ active: false })
    const inactiveUsers = await client()
      .get("/api/admin/users?includeInactive=true")
      .set(bearer(director.token))
    const reactivatedUser = await client()
      .patch(`/api/admin/users/${newUserId}`)
      .set(bearer(admin.token))
      .send({ active: true })
    const deactivatedUser = await client()
      .delete(`/api/admin/users/${newUserId}`)
      .set(bearer(admin.token))
    const directorUsers = await client()
      .get("/api/admin/users")
      .set(bearer(director.token))
    const directorUsersIncludingInactive = await client()
      .get("/api/admin/users?includeInactive=true")
      .set(bearer(director.token))
    const deactivatedSession = await client()
      .get("/api/auth/me")
      .set(bearer(userToken))
    const deactivationAudit = await prisma.auditLog.findFirst({
      where: {
        entity: "User",
        entityId: newUserId,
        action: "USER_DEACTIVATED",
      },
    })
    const retainedUser = await prisma.user.findUnique({
      where: { id: newUserId },
      select: { active: true, hiddenAt: true },
    })

    expect(adminUsers.status).toBe(200)
    expect(createdUser.body.data.email).toBe(newEmail)
    expect(adminDashboard.status).toBe(403)
    expect(updatedUser.status).toBe(200)
    expect(updatedUser.body.data.name).toBe("Compte mis à jour par ADMIN")
    expect(resetPassword.status).toBe(200)
    expect(pausedUser.body.data.active).toBe(false)
    expect(inactiveUsers.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: newUserId })]),
    )
    expect(reactivatedUser.body.data.active).toBe(true)
    expect(deactivatedUser.status).toBe(200)
    expect(deactivatedUser.body.data.active).toBe(false)
    expect(directorUsers.status).toBe(200)
    expect(directorUsers.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: newUserId })]),
    )
    expect(directorUsersIncludingInactive.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: newUserId })]),
    )
    expect(retainedUser?.active).toBe(false)
    expect(retainedUser?.hiddenAt).toBeInstanceOf(Date)
    expect(deactivatedSession.status).toBe(401)
    expect(deactivationAudit).not.toBeNull()
  })
})
