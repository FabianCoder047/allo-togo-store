import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import { pinoHttp } from "pino-http"
import swaggerUi from "swagger-ui-express"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { isAllowedOrigin } from "./config/cors.js"
import { forbidden } from "./lib/errors.js"
import { apiLimiter } from "./middleware/rateLimit.js"
import { errorHandler, notFoundHandler } from "./middleware/error.js"
import { openapi } from "./swagger/openapi.js"
import { authRouter } from "./modules/auth/routes.js"
import {
  adminCatalogRouter,
  publicCatalogRouter,
} from "./modules/catalog/routes.js"
import { ordersRouter } from "./modules/orders/routes.js"
import { messagingRouter } from "./modules/messaging/routes.js"
import { trackingRouter } from "./modules/tracking/routes.js"
import { quotesRouter } from "./modules/quotes/routes.js"
import { paymentsRouter } from "./modules/payments/routes.js"
import { adminRouter, staffMembersRouter } from "./modules/admin/routes.js"
import { staffRouter } from "./modules/staff/routes.js"
import { assistantRouter } from "./modules/assistant/routes.js"
import { emailMode } from "./modules/notifications/email.js"
import { notificationMode } from "./modules/notifications/service.js"
import { catalogUploadDirectory } from "./modules/catalog/media.js"

const frontendDistDirectory = process.env.FRONTEND_DIST_DIR
  ? resolve(process.env.FRONTEND_DIST_DIR)
  : null
const frontendIndex = frontendDistDirectory
  ? join(frontendDistDirectory, "index.html")
  : null
const servesFrontend = Boolean(frontendIndex && existsSync(frontendIndex))

export const createApp = () => {
  const app = express()
  if (env.isProduction) {
    // Render termine le TLS derrière un unique proxy : nécessaire pour que
    // req.ip, les limites de débit et les audits utilisent l'adresse cliente.
    app.set("trust proxy", 1)
  }
  app.disable("x-powered-by")
  app.set("trust proxy", 1)

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }),
  )
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true)
        return callback(
          forbidden("Origine non autorisée par la politique CORS."),
        )
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  app.use(
    express.json({
      // Notes vocales, images et vidéos sont transmises en data URL base64
      // (plafonnées et validées dans le module messagerie).
      limit: "20mb",
      verify: (req, _res, buffer) => {
        ;(req as express.Request).rawBody = buffer
      },
    }),
  )
  app.use(express.urlencoded({ extended: false, limit: "1mb" }))
  app.use(cookieParser())
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.isTest
        ? false
        : { ignore: (req) => req.url === "/api/health" },
    }),
  )
  app.use(
    "/api/catalog-media",
    express.static(catalogUploadDirectory, {
      dotfiles: "deny",
      index: false,
      maxAge: "1d",
      fallthrough: true,
    }),
  )

  app.get("/api/health", (_req, res) => {
    res.json({
      data: {
        status: "ok",
        service: "allo-togo-store-api",
        environment: env.NODE_ENV,
        whatsapp: notificationMode(),
        email: emailMode(),
        bictorys: {
          enabled: env.BICTORYS_ENABLED,
          mode: env.BICTORYS_MODE,
          mock: env.BICTORYS_MOCK,
        },
        timestamp: new Date().toISOString(),
      },
    })
  })

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapi, { customSiteTitle: "API Allo Togo Store" }),
  )
  app.get("/api/openapi.json", (_req, res) => res.json(openapi))

  app.use("/api", apiLimiter)
  app.use("/api/auth", authRouter)
  app.use("/api", assistantRouter)
  app.use("/api", publicCatalogRouter)
  app.use("/api/orders", ordersRouter)
  app.use("/api", messagingRouter)
  app.use("/api/tracking", trackingRouter)
  app.use("/api/quotes", quotesRouter)
  app.use("/api/payments", paymentsRouter)
  app.use("/api/admin", adminRouter)
  app.use("/api/admin/catalog", adminCatalogRouter)
  app.use("/api/staff", staffRouter)
  app.use("/api/staff", staffMembersRouter)

  // En production, l'API et le SPA sont servis par le même service Render :
  // mêmes origine, cookies et Socket.IO, sans configuration CORS croisée.
  if (servesFrontend && frontendDistDirectory && frontendIndex) {
    app.use(
      express.static(frontendDistDirectory, {
        dotfiles: "deny",
        index: false,
        maxAge: "1h",
        setHeaders: (res, filePath) => {
          if (
            /[\\/](index\.html|sw\.js|manifest\.webmanifest|robots\.txt)$/.test(
              filePath,
            )
          ) {
            res.setHeader("Cache-Control", "no-cache")
          }
        },
      }),
    )
    app.get("*", (req, res, next) => {
      if (
        req.method !== "GET" ||
        /^\/(?:api|socket\.io)(?:\/|$)/.test(req.path)
      ) {
        next()
        return
      }
      res.sendFile(frontendIndex)
    })
  }

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
