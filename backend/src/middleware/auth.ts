import type { NextFunction, Request, Response } from "express"
import { forbidden, unauthorized } from "../lib/errors.js"
import { hasPermission, type Permission } from "../lib/permissions.js"
import { verifyAccessToken } from "../modules/auth/service.js"

const extractBearer = (req: Request) => {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) return null
  return header.slice("Bearer ".length).trim()
}

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = extractBearer(req)
  if (!token) return next(unauthorized())
  try {
    req.user = verifyAccessToken(token)
    return next()
  } catch (error) {
    return next(error)
  }
}

export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = extractBearer(req)
  if (!token) return next()
  try {
    req.user = verifyAccessToken(token)
  } catch {
    // Un jeton invalide sur une route publique est simplement ignoré.
  }
  return next()
}

const passwordChangeRequired = (req: Request) =>
  Boolean(req.user?.mustChangePassword)

export const requirePasswordChanged = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (passwordChangeRequired(req)) {
    return next(
      forbidden(
        "Vous devez changer votre mot de passe provisoire avant d’accéder à cet espace.",
      ),
    )
  }
  return next()
}

export const requirePermission = (...permissions: Permission[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized())
    if (passwordChangeRequired(req)) {
      return next(
        forbidden(
          "Vous devez changer votre mot de passe provisoire avant d’accéder à cet espace.",
        ),
      )
    }
    const allowed = permissions.every((permission) =>
      hasPermission(req.user!.role, permission),
    )
    if (!allowed) return next(forbidden())
    return next()
  }
}

export const requireAnyPermission = (...permissions: Permission[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized())
    if (passwordChangeRequired(req)) {
      return next(
        forbidden(
          "Vous devez changer votre mot de passe provisoire avant d’accéder à cet espace.",
        ),
      )
    }
    const allowed = permissions.some((permission) =>
      hasPermission(req.user!.role, permission),
    )
    if (!allowed) return next(forbidden())
    return next()
  }
}

export const requireRole = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized())
    if (passwordChangeRequired(req)) {
      return next(
        forbidden(
          "Vous devez changer votre mot de passe provisoire avant d’accéder à cet espace.",
        ),
      )
    }
    if (!roles.includes(req.user.role)) return next(forbidden())
    return next()
  }
}
