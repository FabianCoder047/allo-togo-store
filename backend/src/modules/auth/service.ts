import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { prisma } from '../../db/prisma.js'
import { env } from '../../config/env.js'
import { unauthorized, badRequest } from '../../lib/errors.js'
import { randomToken, sha256 } from '../../lib/ids.js'
import type { StaffRole } from '@prisma/client'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: StaffRole
  mustChangePassword: boolean
}

const accessTokenPayload = (user: AuthUser) => ({
  sub: user.id,
  role: user.role,
  name: user.name,
  email: user.email,
  mustChangePassword: user.mustChangePassword,
})

export const signAccessToken = (user: AuthUser) =>
  jwt.sign(accessTokenPayload(user), env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
    issuer: 'allo-togo-store',
    audience: 'allo-togo-staff',
  })

export const verifyAccessToken = (token: string): AuthUser => {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'allo-togo-store',
      audience: 'allo-togo-staff',
    }) as jwt.JwtPayload
    if (!payload.sub || !payload.role || !payload.email || !payload.name) throw new Error('payload incomplet')
    return {
      id: payload.sub,
      name: String(payload.name),
      email: String(payload.email),
      role: payload.role as StaffRole,
      mustChangePassword: Boolean(payload.mustChangePassword),
    }
  } catch {
    throw unauthorized('Session expirée ou invalide.')
  }
}

const createRefreshSession = async (userId: string, ip?: string, userAgent?: string) => {
  const refreshToken = randomToken(48)
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000)
  await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt,
      ip,
      userAgent,
    },
  })
  return { refreshToken, refreshExpiresAt: expiresAt }
}

const publicUser = (user: {
  id: string
  name: string
  firstName: string | null
  lastName: string | null
  email: string
  role: StaffRole
  phone: string | null
  mustChangePassword: boolean
}) => ({
  id: user.id,
  name: user.name,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  phone: user.phone,
  mustChangePassword: user.mustChangePassword,
})

export const login = async (email: string, password: string, ip?: string, userAgent?: string) => {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
  const genericError = unauthorized('Identifiants invalides.')

  if (!user || !user.active) {
    // Comparaison factice pour limiter les attaques temporelles.
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid')
    throw genericError
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw genericError

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  const tokens = await createRefreshSession(user.id, ip, userAgent)
  return {
    accessToken: signAccessToken(publicUser(user)),
    user: publicUser(user),
    ...tokens,
  }
}

export const refresh = async (refreshToken: string, ip?: string, userAgent?: string) => {
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: true },
  })

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now() || !session.user.active) {
    throw unauthorized('Session expirée. Veuillez vous reconnecter.')
  }

  await prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
  const tokens = await createRefreshSession(session.userId, ip, userAgent)
  return {
    accessToken: signAccessToken(publicUser(session.user)),
    user: publicUser(session.user),
    ...tokens,
  }
}

export const logout = async (refreshToken: string | undefined) => {
  if (!refreshToken) return
  await prisma.refreshSession.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export const revokeAllSessions = async (userId: string) => {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export const changePassword = async (userId: string, currentPassword: string, newPassword: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw unauthorized()
  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) throw badRequest('Le mot de passe actuel est incorrect.')
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  })
  await revokeAllSessions(userId)
}

export const hashPassword = (password: string) => bcrypt.hash(password, env.BCRYPT_ROUNDS)

export type ProfileUpdate = {
  firstName: string
  lastName: string
  phone?: string | null
}

/**
 * Mise à jour du profil par le membre lui-même. `name` reste la valeur
 * affichée partout (sidebar, emails, historique) : il est recalculé à
 * partir du prénom et du nom.
 */
export const updateProfile = async (userId: string, input: ProfileUpdate) => {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    },
  })
  return publicUser(user)
}
