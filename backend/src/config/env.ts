import "dotenv/config"
import { z } from "zod"

const bool = (defaultValue: boolean) =>
  z.string()
    .optional()
    .transform((value) =>
      value === undefined || value === ""
        ? defaultValue
        : value.toLowerCase() === "true",
    )

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:8443"),
  CORS_ORIGINS: z.string().default("http://localhost:8443"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL est obligatoire"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET doit contenir au moins 32 caractères"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET doit contenir au moins 32 caractères"),
  JWT_ACCESS_TTL: z.string().default("1h"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_ADMIN_NAME: z.string().default("Directeur Allo Togo"),
  SEED_IT_ADMIN_EMAIL: z.string().email().optional(),
  SEED_IT_ADMIN_PASSWORD: z.string().optional(),
  SEED_IT_ADMIN_NAME: z.string().default("Yaovi Informaticien"),
  SEED_DEMO_STAFF: bool(true),

  WHATSAPP_PROVIDER: z.enum(["simulated", "http"]).default("simulated"),
  WHATSAPP_SIMULATION: bool(true),
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_SENDER: z.string().optional(),

  SMS_PROVIDER: z.enum(["simulated", "http"]).default("simulated"),
  SMS_SIMULATION: bool(true),
  SMS_API_URL: z.string().optional(),
  SMS_TOKEN: z.string().optional(),
  SMS_SENDER: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["smtp", "http"]).default("smtp"),
  EMAIL_FROM: z.string().default("Allo Togo Store <no-reply@allotogo.test>"),
  EMAIL_API_URL: z.union([z.string().url(), z.literal("")]).optional(),
  EMAIL_API_TOKEN: z.string().optional(),
  MAIL_HOST: z.string().default("smtp.gmail.com"),
  MAIL_PORT: z.coerce.number().int().positive().default(465),
  MAIL_USERNAME: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),
  MAIL_FROM_NAME: z.string().default("Allo-Togo Shop"),

  BICTORYS_ENABLED: bool(false),
  BICTORYS_MODE: z.enum(["test", "production"]).default("test"),
  BICTORYS_BASE_URL: z.string().optional(),
  BICTORYS_API_KEY: z.string().optional(),
  BICTORYS_SECRET_KEY: z.string().optional(),
  BICTORYS_WEBHOOK_SECRET: z.string().optional(),
  BICTORYS_SIGNATURE_HEADER: z.string().default("x-bictorys-signature"),
  BICTORYS_MOCK: bool(false),

  DELIVERY_FEE_FCFA: z.coerce.number().int().min(0).default(0),
  DELIVERY_CAN_RECORD_PAYMENT: bool(false),
  TRACKING_ACCESS_TTL_HOURS: z.coerce.number().int().positive().default(24),
  TRACKING_LOOKUP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n")
  // eslint-disable-next-line no-console
  console.error(`Configuration invalide :\n${details}`)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  isDevelopment: parsed.data.NODE_ENV === "development",
}
