export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = "AppError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details)

export const unauthorized = (message = "Authentification requise.") =>
  new AppError(401, "UNAUTHORIZED", message)

export const forbidden = (
  message = "Vous n’avez pas les droits nécessaires.",
) => new AppError(403, "FORBIDDEN", message)

export const notFound = (message = "Ressource introuvable.") =>
  new AppError(404, "NOT_FOUND", message)

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, "CONFLICT", message, details)

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, "UNPROCESSABLE_ENTITY", message, details)

export const tooManyRequests = (
  message = "Trop de tentatives. Réessayez plus tard.",
) => new AppError(429, "TOO_MANY_REQUESTS", message)

export const serviceUnavailable = (
  message = "Service momentanément indisponible.",
  details?: unknown,
) => new AppError(503, "SERVICE_UNAVAILABLE", message, details)
