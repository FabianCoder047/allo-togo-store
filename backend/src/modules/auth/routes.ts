import { Router } from 'express'
import { asyncHandler } from '../../lib/asyncHandler.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth, requirePasswordChanged } from '../../middleware/auth.js'
import { loginLimiter } from '../../middleware/rateLimit.js'
import { prisma } from '../../db/prisma.js'
import { env } from '../../config/env.js'
import { notFound } from '../../lib/errors.js'
import { changePassword, login, logout, refresh, updateProfile } from './service.js'
import {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  updateProfileSchema,
} from './schemas.js'
import { audit } from '../audit/service.js'

const REFRESH_COOKIE = 'allo_refresh'
const SESSION_COOKIE = 'allo_session'
const REFRESH_MAX_AGE = env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProduction,
  path: '/api/auth',
  maxAge: REFRESH_MAX_AGE,
}

const sessionCookieOptions = {
  httpOnly: false,
  sameSite: 'lax' as const,
  secure: env.isProduction,
  path: '/',
  maxAge: REFRESH_MAX_AGE,
}

export const authRouter = Router()

authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await login(req.body.email, req.body.password, req.ip, req.get('user-agent') ?? undefined)
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions)
    res.cookie(SESSION_COOKIE, '1', sessionCookieOptions)
    await audit({
      actorId: result.user.id,
      actorType: 'STAFF',
      action: 'AUTH_LOGIN',
      entity: 'User',
      entityId: result.user.id,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    })
    res.json({
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    })
  }),
)

authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? req.body.refreshToken
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Session absente.' } })
      return
    }
    const result = await refresh(token, req.ip, req.get('user-agent') ?? undefined)
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions)
    res.cookie(SESSION_COOKIE, '1', sessionCookieOptions)
    res.json({ data: { accessToken: result.accessToken, user: result.user } })
  }),
)

authRouter.post(
  '/logout',
  validate({ body: logoutSchema }),
  asyncHandler(async (req, res) => {
    const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? req.body.refreshToken
    await logout(token)
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.status(204).send()
  }),
)

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        phone: true,
        active: true,
        mustChangePassword: true,
        lastLoginAt: true,
      },
    })
    if (!user || !user.active) throw notFound('Compte introuvable.')
    res.json({ data: user })
  }),
)

authRouter.patch(
  '/profile',
  requireAuth,
  requirePasswordChanged,
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const data = await updateProfile(req.user!.id, req.body)
    await audit({
      actorId: req.user!.id,
      actorType: 'STAFF',
      action: 'AUTH_PROFILE_UPDATED',
      entity: 'User',
      entityId: req.user!.id,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    })
    res.json({ data })
  }),
)

authRouter.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    await changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword)
    await audit({
      actorId: req.user!.id,
      actorType: 'STAFF',
      action: 'AUTH_PASSWORD_CHANGED',
      entity: 'User',
      entityId: req.user!.id,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    })
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.status(204).send()
  }),
)
