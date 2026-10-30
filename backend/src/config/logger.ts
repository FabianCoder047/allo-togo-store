import pino from "pino"
import { env } from "./env.js"
import { technicalLogStream } from "./technicalLogs.js"

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "password",
        "passwordHash",
        "token",
        "refreshToken",
        "accessToken",
        "secret",
        "apiKey",
        "BICTORYS_SECRET_KEY",
        "BICTORYS_API_KEY",
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
      ],
      censor: "[redacted]",
    },
  },
  pino.multistream([
    { stream: process.stdout },
    { stream: technicalLogStream },
  ]),
)
