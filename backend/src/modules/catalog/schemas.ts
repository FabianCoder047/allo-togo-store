import { z } from "zod"

export const productTypeSchema = z.enum(["GPS", "DRINK", "SERVICE"])

export const listProductsQuerySchema = z.object({
  type: productTypeSchema.optional(),
  category: z.string().optional(),
  search: z.string().max(120).optional(),
  featured: z.enum(["true", "false"]).optional(),
})

export const categoryInputSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(
      /^[a-z0-9-]+$/,
      "Le slug ne peut contenir que des minuscules, chiffres et tirets.",
    ),
  type: productTypeSchema,
  description: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})

export const categoryUpdateSchema = categoryInputSchema.partial()

const imageSchema = z.object({
  url: z.string().min(1).max(500, "L'URL du média est trop longue."),
  alt: z.string().max(160).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
})

const wholesalePriceSchema = z.object({
  minQuantity: z.number().int().min(1).max(100_000),
  maxQuantity: z.number().int().min(1).max(100_000).nullable().optional(),
  unitPrice: z.number().int().positive(),
})

const wholesalePricesSchema = z
  .array(wholesalePriceSchema)
  .max(5)
  .superRefine((tiers, ctx) => {
    for (let index = 0; index < tiers.length; index += 1) {
      const tier = tiers[index]
      const maxQuantity = tier.maxQuantity ?? Infinity
      if (tier.minQuantity > maxQuantity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "maxQuantity"],
          message:
            "La quantité maximale doit être supérieure ou égale au minimum.",
        })
      }
      if (index > 0) {
        if (tier.minQuantity <= tiers[index - 1].minQuantity) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "minQuantity"],
            message: "Classez les seuils par quantité croissante.",
          })
        }
        if (tier.minQuantity <= (tiers[index - 1].maxQuantity ?? Infinity)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "minQuantity"],
            message: "Les paliers ne doivent pas se chevaucher.",
          })
        }
        if (tier.unitPrice >= tiers[index - 1].unitPrice) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "unitPrice"],
            message: "Le prix doit diminuer à chaque palier.",
          })
        }
      }
    }
  })

const productShape = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(
      /^[a-z0-9-]+$/,
      "Le slug ne peut contenir que des minuscules, chiffres et tirets.",
    )
    .optional(),
  sku: z.string().min(2).max(60),
  type: productTypeSchema,
  shortDescription: z.string().min(2).max(240),
  description: z.string().min(2).max(5000),
  price: z.number().int().min(0),
  previousPrice: z.number().int().positive().optional().nullable(),
  cartonPrice: z.number().int().positive().optional().nullable(),
  wholesalePrices: wholesalePricesSchema.optional().nullable(),
  quoteOnly: z.boolean().default(false),
  specs: z
    .record(z.string().max(80), z.string().max(500))
    .refine(
      (value) => Object.keys(value).length <= 30,
      "30 caractéristiques maximum.",
    )
    .optional()
    .nullable(),
  stock: z.number().int().min(0).optional().nullable(),
  manageStock: z.boolean().default(false),
  available: z.boolean().default(true),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  images: z
    .array(imageSchema)
    .min(1, "Chaque fiche doit comporter au moins une image.")
    .max(8),
  videos: z.array(imageSchema).max(8).default([]),
})

export const productInputSchema = productShape.superRefine((product, ctx) => {
  if (
    product.previousPrice !== null &&
    product.previousPrice !== undefined &&
    product.previousPrice <= product.price
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["previousPrice"],
      message: "Le prix avant doit être supérieur au prix actuel.",
    })
  }
  if (
    product.wholesalePrices?.some((tier) => tier.unitPrice >= product.price)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["wholesalePrices"],
      message: "Les prix de gros doivent être inférieurs au prix actuel.",
    })
  }
  if (
    product.type === "SERVICE" &&
    (product.manageStock ||
      (product.stock !== undefined && product.stock !== null))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stock"],
      message: "Les services ne gèrent pas de stock.",
    })
  }
})

export const productUpdateSchema = productShape
  .partial()
  .superRefine((product, ctx) => {
    if (
      product.type === "SERVICE" &&
      (product.manageStock ||
        (product.stock !== undefined && product.stock !== null))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stock"],
        message: "Les services ne gèrent pas de stock.",
      })
    }
  })

export const stockAdjustSchema = z.object({
  quantity: z
    .number()
    .int()
    .refine(
      (value) => value !== 0,
      "La quantité doit être différente de zéro.",
    ),
  reason: z.string().max(300).optional(),
})
