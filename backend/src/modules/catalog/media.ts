import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { badRequest, unprocessable } from "../../lib/errors.js"

export const catalogUploadDirectory = path.resolve(
  process.cwd(),
  "uploads/catalog",
)

const mediaTypes = {
  "image/jpeg": { extension: "jpg", maxBytes: 8 * 1024 * 1024 },
  "image/gif": { extension: "gif", maxBytes: 8 * 1024 * 1024 },
  "image/png": { extension: "png", maxBytes: 8 * 1024 * 1024 },
  "image/webp": { extension: "webp", maxBytes: 8 * 1024 * 1024 },
  "image/avif": { extension: "avif", maxBytes: 8 * 1024 * 1024 },
  "video/mp4": { extension: "mp4", maxBytes: 32 * 1024 * 1024 },
  "video/quicktime": { extension: "mov", maxBytes: 32 * 1024 * 1024 },
  "video/webm": { extension: "webm", maxBytes: 32 * 1024 * 1024 },
} as const

export type CatalogMediaType = keyof typeof mediaTypes

export const catalogMediaType = (
  value: string | undefined,
): CatalogMediaType | null =>
  value && Object.hasOwn(mediaTypes, value) ? value as CatalogMediaType : null

export const saveCatalogMedia = async (
  type: CatalogMediaType,
  contents: Buffer,
) => {
  const config = mediaTypes[type]
  if (contents.length === 0) throw badRequest("Le fichier envoyé est vide.")
  if (contents.length > config.maxBytes) {
    throw unprocessable(
      type.startsWith("image/")
        ? "Une image ne peut pas dépasser 8 Mo."
        : "Une vidéo ne peut pas dépasser 32 Mo.",
    )
  }
  const validSignature = {
    "image/jpeg": () =>
      contents.length >= 3 &&
      contents[0] === 0xff &&
      contents[1] === 0xd8 &&
      contents[2] === 0xff,
    "image/gif": () =>
      ["GIF87a", "GIF89a"].includes(contents.toString("ascii", 0, 6)),
    "image/png": () =>
      contents
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/webp": () =>
      contents.toString("ascii", 0, 4) === "RIFF" &&
      contents.toString("ascii", 8, 12) === "WEBP",
    "image/avif": () =>
      contents.toString("ascii", 4, 12).startsWith("ftypavif") ||
      contents.toString("ascii", 4, 12).startsWith("ftypavis"),
    "video/mp4": () => contents.toString("ascii", 4, 8) === "ftyp",
    "video/quicktime": () => contents.toString("ascii", 4, 8) === "ftyp",
    "video/webm": () =>
      contents.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  }[type]()
  if (!validSignature)
    throw badRequest(
      "Le contenu du fichier ne correspond pas à son format déclaré.",
    )

  await mkdir(catalogUploadDirectory, { recursive: true })
  const filename = `${randomUUID()}.${config.extension}`
  await writeFile(path.join(catalogUploadDirectory, filename), contents, {
    flag: "wx",
  })
  return `/api/catalog-media/${filename}`
}
