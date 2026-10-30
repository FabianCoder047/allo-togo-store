import { z } from "zod"
import { isGoogleMapsUrl } from "../../lib/googleMaps.js"

const phoneSchema = z
  .string()
  .min(6)
  .max(30)
  .regex(/^[+0-9 ().-]+$/, "Numéro de téléphone invalide.")

const googleMapsUrlSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .max(2048)
      .url("Le lien Google Maps est invalide.")
      .refine(isGoogleMapsUrl, "Le lien doit pointer vers Google Maps."),
  ])
  .optional()
  .nullable()

export const checkoutSchema = z
  .object({
    customer: z.object({
      name: z.string().min(2).max(120),
      phone: phoneSchema,
      whatsapp: phoneSchema.optional().or(z.literal("")).nullable(),
      email: z
        .string()
        .email()
        .max(160)
        .optional()
        .or(z.literal(""))
        .nullable(),
    }),
    fulfillmentMode: z.enum(["LIVRAISON", "RETRAIT_AGENCE"]),
    delivery: z
      .object({
        zone: z.string().max(120).optional().or(z.literal("")).nullable(),
        address: z.string().max(500).optional().or(z.literal("")).nullable(),
        instructions: z
          .string()
          .max(1000)
          .optional()
          .or(z.literal(""))
          .nullable(),
        contactPhone: phoneSchema.optional().or(z.literal("")).nullable(),
        latitude: z.number().finite().min(-90).max(90).optional().nullable(),
        longitude: z.number().finite().min(-180).max(180).optional().nullable(),
        mapUrl: googleMapsUrlSchema,
      })
      .optional()
      .default({}),
    requiresTechnician: z.boolean().default(false),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .min(1, "Le panier est vide.")
      .max(50),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillmentMode === "LIVRAISON") {
      const hasLatitude = typeof value.delivery.latitude === "number"
      const hasLongitude = typeof value.delivery.longitude === "number"
      const hasMapUrl = Boolean(value.delivery.mapUrl?.trim())

      if (hasLatitude !== hasLongitude) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["delivery", "latitude"],
          message: "Les coordonnées de livraison sont incomplètes.",
        })
      }
      if (!hasMapUrl && !(hasLatitude && hasLongitude)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["delivery", "mapUrl"],
          message:
            "Choisissez un point de livraison précis sur Google Maps (position actuelle ou lien partagé).",
        })
      }
    }
  })

export const orderListQuerySchema = z.object({
  status: z.string().optional(),
  categoryType: z.enum(["GPS", "DRINK"]).optional(),
  paymentStatus: z.string().optional(),
  fulfillmentMode: z.enum(["LIVRAISON", "RETRAIT_AGENCE"]).optional(),
  assignedToId: z.string().optional(),
  search: z.string().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const statusUpdateSchema = z.object({
  status: z.enum([
    "EN_ATTENTE_CONFIRMATION",
    "COMMANDE_ACCEPTEE",
    "COMMANDE_EN_PREPARATION",
    "COMMANDE_EN_COURS_DE_LIVRAISON",
    "LIVREE",
    "ECHEC_LIVRAISON",
    "REJETEE",
    "ANNULEE",
  ]),
  comment: z.string().max(1000).optional(),
  publicComment: z.boolean().default(false),
})

export const assignSchema = z
  .object({
    staffIds: z.array(z.string().min(1)).min(1).max(10).optional(),
    leadStaffId: z.string().min(1).optional(),
    staffId: z.string().min(1).optional(),
    /// Conservé pour compatibilité : le type réel est déduit du rôle de chaque membre.
    type: z.enum(["TECHNICIAN", "DELIVERY"]).optional(),
    instructions: z.string().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    const staffIds = value.staffIds ?? (value.staffId ? [value.staffId] : [])
    if (staffIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["staffIds"],
        message: "Sélectionnez au moins un intervenant.",
      })
    }
    if (new Set(staffIds).size !== staffIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["staffIds"],
        message: "Un intervenant ne peut être sélectionné qu’une fois.",
      })
    }
    if (value.leadStaffId && !staffIds.includes(value.leadStaffId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["leadStaffId"],
        message: "Le chef doit faire partie des intervenants sélectionnés.",
      })
    }
  })

export const deliveryOutcomeSchema = z.object({
  comment: z.string().max(1000).optional(),
})

export const pickupSchema = z.object({
  comment: z.string().max(1000).optional(),
})

export const noteSchema = z.object({
  body: z.string().min(1).max(2000),
})

export const paymentSchema = z.object({
  amount: z.number().int().positive().max(100_000_000),
  method: z.enum(["ESPECES", "FLOOZ", "MIXX_BY_YAS", "CARTE_BANCAIRE"]),
  reference: z.string().max(160).optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
})

export const confirmOrderSchema = z.object({
  comment: z.string().max(1000).optional(),
})

export const cancelOrderSchema = z.object({
  reason: z.string().min(3).max(1000),
})

export const messageSchema = z.object({
  body: z.string().min(1).max(4000),
  visibility: z.enum(["CLIENT", "INTERNAL"]).default("CLIENT"),
})

export const trackingAccessSchema = z.object({
  phone: phoneSchema,
})

const mobileMoneyNumber = (prefixes: string[]) =>
  z.string()
    .trim()
    .regex(
      new RegExp(`^(?:${prefixes.join("|")})\\d{6}$`),
      "Le numéro doit contenir 8 chiffres avec un préfixe valide.",
    )

export const trackingPaymentChoiceSchema = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("ESPECES") }),
  z.object({
    choice: z.literal("FLOOZ"),
    phone: mobileMoneyNumber(["78", "79", "96", "97", "98", "99"])
      .optional()
      .nullable(),
  }),
  z.object({
    choice: z.literal("MIXX_BY_YAS"),
    phone: mobileMoneyNumber(["70", "71", "72", "90", "91", "92", "93"])
      .optional()
      .nullable(),
  }),
])
