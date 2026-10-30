import { z } from "zod"

/**
 * Les pièces jointes sont stockées en base sous forme de data URL base64.
 * La limite est volontairement basse : une note de 2 minutes en Opus reste
 * largement en dessous. Une production à fort volume doit déporter les fichiers
 * vers un stockage objet (S3, MinIO…), voir docs/ARCHITECTURE.md.
 */
export const MAX_AUDIO_DATA_LENGTH = 4_500_000
export const MAX_AUDIO_DURATION_MS = 120_000
export const MAX_IMAGE_DATA_LENGTH = 6_000_000
export const MAX_MEDIA_DATA_LENGTH = 16_000_000
export const MAX_MEDIA_DURATION_MS = 300_000
export const MAX_MEDIA_BYTES = 20_000_000

const audioDataUrl = z
  .string()
  .max(MAX_AUDIO_DATA_LENGTH, "Note vocale trop volumineuse (3 Mo maximum).")
  .regex(
    /^data:audio\/(webm|ogg|mp4|mpeg|wav|aac|3gpp)(;[a-zA-Z0-9=._-]+)*;base64,[A-Za-z0-9+/=\s]+$/,
    "Format audio non pris en charge.",
  )

const mediaDataUrl = z
  .string()
  .max(MAX_MEDIA_DATA_LENGTH, "Média trop volumineux (12 Mo maximum).")
  .regex(
    /^data:(image\/(png|jpe?g|webp|gif|avif)|video\/(mp4|webm|quicktime|ogg|3gpp));base64,[A-Za-z0-9+/=\s]+$/,
    "Format d’image ou de vidéo non pris en charge.",
  )

const latitude = z.number().min(-90).max(90)
const longitude = z.number().min(-180).max(180)
const accuracy = z.number().min(0).max(100_000).optional()

const baseMessage = z.object({
  kind: z.enum(["TEXT", "AUDIO", "LOCATION", "IMAGE", "VIDEO"]).default("TEXT"),
  body: z.string().max(4000).optional(),
  audioData: audioDataUrl.optional(),
  durationMs: z.number().int().min(0).max(MAX_MEDIA_DURATION_MS).optional(),
  mediaData: mediaDataUrl.optional(),
  mediaMimeType: z
    .string()
    .max(100)
    .regex(/^(image|video)\/[a-z0-9.+-]+$/i, "Type MIME invalide.")
    .optional(),
  mediaName: z.string().max(180).optional(),
  mediaSize: z.number().int().min(0).max(MAX_MEDIA_BYTES).optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  accuracy,
  locationLabel: z.string().max(200).optional(),
})

export const chatMessageSchema = baseMessage.superRefine((value, ctx) => {
  if (value.kind === "TEXT") {
    if (!value.body || value.body.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "Le message ne peut pas être vide.",
      })
    }
    return
  }

  if (value.kind === "AUDIO") {
    if (!value.audioData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audioData"],
        message: "Note vocale manquante.",
      })
    }
    if (
      !value.durationMs ||
      value.durationMs < 200 ||
      value.durationMs > MAX_AUDIO_DURATION_MS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["durationMs"],
        message: "Durée de la note vocale invalide.",
      })
    }
    return
  }

  if (value.kind === "IMAGE" || value.kind === "VIDEO") {
    if (!value.mediaData) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaData"],
        message: "Média manquant.",
      })
      return
    }
    if (value.kind === "IMAGE" && !value.mediaData.startsWith("data:image/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaData"],
        message: "Le fichier doit être une image.",
      })
    }
    if (value.kind === "VIDEO" && !value.mediaData.startsWith("data:video/")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaData"],
        message: "Le fichier doit être une vidéo.",
      })
    }
    if (
      value.kind === "IMAGE" &&
      value.mediaData.length > MAX_IMAGE_DATA_LENGTH
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mediaData"],
        message: "Image trop volumineuse (4,5 Mo maximum).",
      })
    }
    return
  }

  if (value.latitude === undefined || value.longitude === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latitude"],
      message: "Coordonnées de localisation manquantes.",
    })
  }
})

export type ChatMessageInput = z.infer<typeof baseMessage>

const mimeFromDataUrl = (dataUrl: string | undefined) =>
  dataUrl?.match(/^data:([^;]+);base64,/)?.[1] ?? null

/**
 * Transforme la requête en données Prisma. `body` reste renseigné pour garder
 * une trace lisible dans les notifications et l’historique interne.
 */
export const toMessageData = (input: ChatMessageInput) => {
  const label = input.locationLabel?.trim() || undefined
  const emptyMedia = {
    audioData: null,
    mediaData: null,
    mediaMimeType: null,
    mediaName: null,
    mediaSize: null,
    durationMs: null,
    latitude: null,
    longitude: null,
    accuracy: null,
    locationLabel: null,
  }

  if (input.kind === "AUDIO") {
    return {
      ...emptyMedia,
      kind: "AUDIO" as const,
      body: input.body?.trim() || "Note vocale",
      audioData: input.audioData,
      durationMs: input.durationMs,
    }
  }

  if (input.kind === "LOCATION") {
    return {
      ...emptyMedia,
      kind: "LOCATION" as const,
      body: input.body?.trim() || label || "Position partagée",
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy ?? null,
      locationLabel: label ?? null,
    }
  }

  if (input.kind === "IMAGE" || input.kind === "VIDEO") {
    return {
      ...emptyMedia,
      kind: input.kind,
      body: input.body?.trim() || (input.kind === "IMAGE" ? "Photo" : "Vidéo"),
      mediaData: input.mediaData,
      mediaMimeType: input.mediaMimeType ?? mimeFromDataUrl(input.mediaData),
      mediaName: input.mediaName?.trim() || null,
      mediaSize: input.mediaSize ?? null,
      durationMs: input.kind === "VIDEO" ? (input.durationMs ?? null) : null,
    }
  }

  return {
    ...emptyMedia,
    kind: "TEXT" as const,
    body: (input.body ?? "").trim(),
  }
}
