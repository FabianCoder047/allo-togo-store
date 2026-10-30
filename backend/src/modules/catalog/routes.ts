import express, { Router } from "express"
import { asyncHandler } from "../../lib/asyncHandler.js"
import { validate } from "../../middleware/validate.js"
import { requireAuth, requirePermission } from "../../middleware/auth.js"
import { audit } from "../audit/service.js"
import {
  adjustStock,
  createCategory,
  createProduct,
  deleteProduct,
  getProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
} from "./service.js"
import {
  categoryInputSchema,
  categoryUpdateSchema,
  listProductsQuerySchema,
  productInputSchema,
  productTypeSchema,
  productUpdateSchema,
  stockAdjustSchema,
} from "./schemas.js"
import { z } from "zod"
import { badRequest } from "../../lib/errors.js"
import { catalogMediaType, saveCatalogMedia } from "./media.js"

export const publicCatalogRouter = Router()

publicCatalogRouter.get(
  "/categories",
  validate({ query: z.object({ type: productTypeSchema.optional() }) }),
  asyncHandler(async (req, res) => {
    const data = await listCategories({ type: req.query.type as never })
    res.json({ data })
  }),
)

publicCatalogRouter.get(
  "/products",
  validate({ query: listProductsQuerySchema }),
  asyncHandler(async (req, res) => {
    const query =
      req.query as unknown as z.infer<typeof listProductsQuerySchema>
    const data = await listProducts({
      type: query.type,
      category: query.category,
      search: query.search,
      featured:
        query.featured === undefined ? undefined : query.featured === "true",
    })
    res.json({ data })
  }),
)

publicCatalogRouter.get(
  "/services",
  asyncHandler(async (_req, res) => {
    const data = await listProducts({ type: "SERVICE" })
    res.json({ data })
  }),
)

publicCatalogRouter.get(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const data = await getProduct(req.params.id)
    res.json({ data })
  }),
)

export const adminCatalogRouter = Router()
adminCatalogRouter.use(requireAuth)

adminCatalogRouter.post(
  "/uploads",
  requirePermission("catalog:write"),
  express.raw({
    type: [
      "image/jpeg",
      "image/gif",
      "image/png",
      "image/webp",
      "image/avif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ],
    limit: "32mb",
  }),
  asyncHandler(async (req, res) => {
    const type = catalogMediaType(
      req.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase(),
    )
    if (!type)
      throw badRequest(
        "Format non accepté. Images JPEG, PNG, WebP, AVIF et vidéos MP4 ou WebM uniquement.",
      )
    if (!Buffer.isBuffer(req.body))
      throw badRequest("Fichier média manquant ou type de contenu invalide.")
    const url = await saveCatalogMedia(type, req.body)
    res.status(201).json({ data: { url, type } })
  }),
)

adminCatalogRouter.get(
  "/categories",
  requirePermission("catalog:read"),
  asyncHandler(async (_req, res) => {
    const data = await listCategories({ includeInactive: true })
    res.json({ data })
  }),
)

adminCatalogRouter.post(
  "/categories",
  requirePermission("catalog:write"),
  validate({ body: categoryInputSchema }),
  asyncHandler(async (req, res) => {
    const data = await createCategory(req.body)
    await audit({
      actorId: req.user!.id,
      actorType: "STAFF",
      action: "CATEGORY_CREATED",
      entity: "Category",
      entityId: data.id,
      metadata: { name: data.name, type: data.type },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    })
    res.status(201).json({ data })
  }),
)

adminCatalogRouter.patch(
  "/categories/:id",
  requirePermission("catalog:write"),
  validate({ body: categoryUpdateSchema }),
  asyncHandler(async (req, res) => {
    const data = await updateCategory(req.params.id, req.body)
    await audit({
      actorId: req.user!.id,
      actorType: "STAFF",
      action: "CATEGORY_UPDATED",
      entity: "Category",
      entityId: data.id,
      metadata: req.body,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    })
    res.json({ data })
  }),
)

adminCatalogRouter.get(
  "/products",
  requirePermission("catalog:read"),
  validate({ query: listProductsQuerySchema }),
  asyncHandler(async (req, res) => {
    const query =
      req.query as unknown as z.infer<typeof listProductsQuerySchema>
    const data = await listProducts({
      type: query.type,
      category: query.category,
      search: query.search,
      featured:
        query.featured === undefined ? undefined : query.featured === "true",
      includeInactive: true,
    })
    res.json({ data })
  }),
)

adminCatalogRouter.delete(
  "/products/:id",
  requirePermission("catalog:write"),
  asyncHandler(async (req, res) => {
    const data = await deleteProduct(req.params.id)
    await audit({
      actorId: req.user!.id,
      actorType: "STAFF",
      action: "PRODUCT_DELETED",
      entity: "Product",
      entityId: data.id,
      metadata: { name: data.name },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    })
    res.status(204).end()
  }),
)

adminCatalogRouter.post(
  "/products",
  requirePermission("catalog:write"),
  validate({ body: productInputSchema }),
  asyncHandler(async (req, res) => {
    const data = await createProduct(req.body)
    await audit({
      actorId: req.user!.id,
      actorType: "STAFF",
      action: "PRODUCT_CREATED",
      entity: "Product",
      entityId: data.id,
      metadata: { name: data.name, sku: data.sku, price: data.price },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    })
    res.status(201).json({ data })
  }),
)

adminCatalogRouter.patch(
  "/products/:id",
  requirePermission("catalog:write"),
  validate({ body: productUpdateSchema }),
  asyncHandler(async (req, res) => {
    const data = await updateProduct(req.params.id, req.body)
    await audit({
      actorId: req.user!.id,
      actorType: "STAFF",
      action: "PRODUCT_UPDATED",
      entity: "Product",
      entityId: data.id,
      metadata: req.body,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    })
    res.json({ data })
  }),
)

adminCatalogRouter.post(
  "/products/:id/stock",
  requirePermission("catalog:write"),
  validate({ body: stockAdjustSchema }),
  asyncHandler(async (req, res) => {
    const data = await adjustStock(
      req.params.id,
      req.body.quantity,
      req.body.reason,
      req.user!.id,
    )
    await audit({
      actorId: req.user!.id,
      actorType: "STAFF",
      action: "STOCK_ADJUSTED",
      entity: "Product",
      entityId: data.id,
      metadata: { quantity: req.body.quantity, reason: req.body.reason },
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    })
    res.json({ data })
  }),
)
