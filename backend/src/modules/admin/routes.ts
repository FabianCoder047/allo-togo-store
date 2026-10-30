import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../lib/asyncHandler.js"
import { validate } from "../../middleware/validate.js"
import {
  requireAuth,
  requirePasswordChanged,
  requirePermission,
} from "../../middleware/auth.js"
import { env } from "../../config/env.js"
import { prisma } from "../../db/prisma.js"
import {
  auditQuerySchema,
  adminPaymentsQuerySchema,
  dashboardQuerySchema,
  technicalLogsQuerySchema,
  notificationQuerySchema,
  resetPasswordSchema,
  userCreateSchema,
  userUpdateSchema,
} from "./schemas.js"
import {
  createUser,
  deactivateUser,
  listAuditLogs,
  listPayments,
  listStaffMembers,
  listUsers,
  resetUserPassword,
  updateUser,
} from "./service.js"
import { getDashboard } from "./dashboard.js"
import { getInfrastructureOverview } from "./infrastructure.js"
import { listTechnicalLogs } from "../../config/technicalLogs.js"
import { emailMode } from "../notifications/email.js"
import {
  notificationMode,
  notificationQueue,
  processPendingNotifications,
  retryNotification,
} from "../notifications/service.js"

export const adminRouter = Router()
adminRouter.use(requireAuth, requirePasswordChanged)

adminRouter.get(
  "/dashboard",
  requirePermission("dashboard:read"),
  validate({ query: dashboardQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof dashboardQuerySchema>
    const data = await getDashboard(query)
    res.json({ data })
  }),
)

adminRouter.get(
  "/technical-logs",
  requirePermission("technical-logs:read"),
  validate({ query: technicalLogsQuerySchema }),
  asyncHandler(async (req, res) => {
    const query =
      req.query as unknown as z.infer<typeof technicalLogsQuerySchema>
    const result = await listTechnicalLogs(query)
    res.json(result)
  }),
)

adminRouter.get(
  "/users",
  requirePermission("users:manage"),
  validate({
    query: z.object({
      role: z
        .enum(["DIRECTOR", "ADMIN", "COMMERCIAL", "TECHNICIAN", "DELIVERY"])
        .optional(),
      includeInactive: z.enum(["true", "false"]).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const data = await listUsers({
      role: req.query.role as never,
      includeInactive: req.query.includeInactive === "true",
    })
    res.json({ data })
  }),
)

adminRouter.post(
  "/users",
  requirePermission("users:manage"),
  validate({ body: userCreateSchema }),
  asyncHandler(async (req, res) => {
    const data = await createUser(
      req.body,
      req.user!,
      req.ip,
      req.get("user-agent") ?? undefined,
    )
    res.status(201).json({ data })
  }),
)

adminRouter.patch(
  "/users/:id",
  requirePermission("users:manage"),
  validate({ body: userUpdateSchema }),
  asyncHandler(async (req, res) => {
    const data = await updateUser(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get("user-agent") ?? undefined,
    )
    res.json({ data })
  }),
)

adminRouter.delete(
  "/users/:id",
  requirePermission("users:manage"),
  asyncHandler(async (req, res) => {
    const data = await deactivateUser(
      req.params.id,
      req.user!,
      req.ip,
      req.get("user-agent") ?? undefined,
    )
    res.json({ data })
  }),
)

adminRouter.post(
  "/users/:id/reset-password",
  requirePermission("users:manage"),
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const data = await resetUserPassword(
      req.params.id,
      req.body,
      req.user!,
      req.ip,
      req.get("user-agent") ?? undefined,
    )
    res.json({ data })
  }),
)

adminRouter.get(
  "/payments",
  requirePermission("payments:read"),
  validate({ query: adminPaymentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const query =
      req.query as unknown as z.infer<typeof adminPaymentsQuerySchema>
    const result = await listPayments(query)
    res.json(result)
  }),
)

adminRouter.get(
  "/audit",
  requirePermission("audit:read"),
  validate({ query: auditQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof auditQuerySchema>
    const result = await listAuditLogs(query)
    res.json(result)
  }),
)

adminRouter.get(
  "/infrastructure",
  requirePermission("infrastructure:read"),
  asyncHandler(async (_req, res) => {
    const data = await getInfrastructureOverview()
    res.json({ data })
  }),
)

adminRouter.get(
  "/notifications/mode",
  requirePermission("notifications:manage"),
  asyncHandler(async (_req, res) => {
    res.json({ data: notificationMode() })
  }),
)

adminRouter.get(
  "/notifications",
  requirePermission("notifications:manage"),
  validate({ query: notificationQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await notificationQueue(req.query.status as never)
    res.json({ data })
  }),
)

adminRouter.post(
  "/notifications/process",
  requirePermission("notifications:manage"),
  asyncHandler(async (_req, res) => {
    const data = await processPendingNotifications(50)
    res.json({ data })
  }),
)

adminRouter.post(
  "/notifications/:id/retry",
  requirePermission("notifications:manage"),
  asyncHandler(async (req, res) => {
    const data = await retryNotification(req.params.id)
    res.json({ data })
  }),
)

adminRouter.get(
  "/settings",
  requirePermission("dashboard:read"),
  asyncHandler(async (_req, res) => {
    const stored = await prisma.storeSettings.findMany({
      orderBy: { key: "asc" },
    })
    res.json({
      data: {
        environment: {
          deliveryFee: env.DELIVERY_FEE_FCFA,
          deliveryCanRecordPayment: env.DELIVERY_CAN_RECORD_PAYMENT,
          bictorysEnabled: env.BICTORYS_ENABLED,
          bictorysMode: env.BICTORYS_MODE,
          whatsapp: notificationMode(),
          email: emailMode(),
        },
        stored: Object.fromEntries(stored.map((row) => [row.key, row.value])),
      },
    })
  }),
)

adminRouter.put(
  "/settings/:key",
  requirePermission("settings:write"),
  validate({ body: z.object({ value: z.unknown() }) }),
  asyncHandler(async (req, res) => {
    const allowed = new Set([
      "store.name",
      "store.phone",
      "delivery.zones",
      "business.note",
    ])
    if (!allowed.has(req.params.key)) {
      res
        .status(400)
        .json({
          error: {
            code: "BAD_REQUEST",
            message: "Clé de paramètre non autorisée.",
          },
        })
      return
    }
    const data = await prisma.storeSettings.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value: req.body.value as never },
      update: { value: req.body.value as never },
    })
    res.json({ data })
  }),
)

export const staffMembersRouter = Router()
staffMembersRouter.use(requireAuth, requirePasswordChanged)
staffMembersRouter.get(
  "/members",
  requirePermission("orders:assign"),
  asyncHandler(async (_req, res) => {
    const data = await listStaffMembers()
    res.json({ data })
  }),
)
