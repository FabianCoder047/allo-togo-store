import type { NextFunction, Request, Response } from "express"
import { Prisma } from "@prisma/client"
import { AppError } from "../lib/errors.js"
import { logger } from "../config/logger.js"
import { env } from "../config/env.js"

export const notFoundHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => next(new AppError(404, "NOT_FOUND", "Route introuvable."))

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    })
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return res.status(409).json({
        error: { code: "DUPLICATE", message: "Cette valeur existe déjà." },
      })
    }
    if (error.code === "P2025") {
      return res
        .status(404)
        .json({
          error: { code: "NOT_FOUND", message: "Ressource introuvable." },
        })
    }
  }

  if (error instanceof SyntaxError && "body" in error) {
    return res
      .status(400)
      .json({
        error: {
          code: "INVALID_JSON",
          message: "Corps de requête JSON invalide.",
        },
      })
  }

  logger.error(
    { err: error, method: req.method, path: req.originalUrl },
    "Erreur serveur non gérée",
  )

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Une erreur interne est survenue. Veuillez réessayer.",
      ...(env.isProduction
        ? {}
        : { debug: error instanceof Error ? error.message : String(error) }),
    },
  })
}
