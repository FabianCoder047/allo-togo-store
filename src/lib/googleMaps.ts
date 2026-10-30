export type DeliveryPoint = {
  latitude: number | null
  longitude: number | null
  mapUrl: string
  source: "GPS" | "LINK"
  accuracy?: number | null
}

export type DeliveryPointSelection = DeliveryPoint | null

export type DeliveryPointParseResult =
  | { ok: true; point: DeliveryPoint }
  | { ok: false; error: string }

const GOOGLE_MAPS_SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"])

const isGoogleDomain = (hostname: string) =>
  hostname === "google.com" ||
  hostname.endsWith(".google.com") ||
  hostname === "google.tg" ||
  hostname.endsWith(".google.tg")

export const isGoogleMapsUrl = (value: string) => {
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    const hostname = url.hostname.toLowerCase()
    if (GOOGLE_MAPS_SHORT_HOSTS.has(hostname)) {
      return hostname === "maps.app.goo.gl" || url.pathname.startsWith("/maps")
    }
    if (hostname === "maps.google.com" || hostname === "maps.google.tg")
      return true
    return isGoogleDomain(hostname) && url.pathname.startsWith("/maps")
  } catch {
    return false
  }
}

export const googleMapsUrlForCoordinates = (
  latitude: number,
  longitude: number,
) => `https://www.google.com/maps?q=${latitude},${longitude}`

export const googleMapsEmbedUrl = (latitude: number, longitude: number) =>
  `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&hl=fr&output=embed`

const toCoordinate = (value: string | undefined, min: number, max: number) => {
  if (value === undefined) return null
  const normalized = value.replace(",", ".").trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null
  const number = Number(normalized)
  if (!Number.isFinite(number) || number < min || number > max) return null
  return number
}

const toPair = (
  latitude: string | undefined,
  longitude: string | undefined,
): { latitude: number; longitude: number } | null => {
  const lat = toCoordinate(latitude, -90, 90)
  const lng = toCoordinate(longitude, -180, 180)
  return lat !== null && lng !== null ? { latitude: lat, longitude: lng } : null
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"))
  } catch {
    return value
  }
}

/**
 * Extrait un point d’un lien Google Maps. Les liens courts
 * (`maps.app.goo.gl/...`) ne contiennent pas de coordonnées : ils restent
 * acceptés, mais l’aperçu de la carte n’est alors pas disponible.
 */
export const coordinatesFromGoogleMapsUrl = (
  value: string,
): { latitude: number; longitude: number } | null => {
  const decoded = safeDecode(value.trim())
  const patterns: Array<RegExp> = [
    /@(-?\d+(?:[.,]\d+)?),(-?\d+(?:[.,]\d+)?)/,
    /!3d(-?\d+(?:[.,]\d+)?)!4d(-?\d+(?:[.,]\d+)?)/,
  ]

  for (const pattern of patterns) {
    const match = decoded.match(pattern)
    const pair = toPair(match?.[1], match?.[2])
    if (pair) return pair
  }

  const queryMatch = decoded.match(
    /[?&](?:q|query|ll|center|destination|daddr)=([^&]+)/i,
  )
  if (!queryMatch) return null
  const queryValue = queryMatch[1]
    .replace(/^loc:/i, "")
    .replace(/^place:/i, "")
    .trim()
  const pairMatch = queryValue.match(
    /^(-?\d+(?:[.,]\d+)?)\s*(?:,|;|\s)\s*(-?\d+(?:[.,]\d+)?)$/,
  )
  return toPair(pairMatch?.[1], pairMatch?.[2])
}

export const parseDeliveryPointInput = (
  rawValue: string,
): DeliveryPointParseResult => {
  const value = rawValue.trim()
  if (!value) {
    return {
      ok: false,
      error: "Collez le lien Google Maps du point de livraison.",
    }
  }

  const directPair = value.match(
    /^(-?\d+(?:[.,]\d+)?)\s*(?:,|;|\s)\s*(-?\d+(?:[.,]\d+)?)$/,
  )
  const directCoordinates = toPair(directPair?.[1], directPair?.[2])
  if (directCoordinates) {
    return {
      ok: true,
      point: {
        ...directCoordinates,
        mapUrl: googleMapsUrlForCoordinates(
          directCoordinates.latitude,
          directCoordinates.longitude,
        ),
        source: "LINK",
      },
    }
  }

  if (!isGoogleMapsUrl(value)) {
    return {
      ok: false,
      error:
        "Ce lien n’est pas reconnu. Utilisez le bouton « Partager » dans Google Maps et collez le lien complet.",
    }
  }

  const coordinates = coordinatesFromGoogleMapsUrl(value)
  return {
    ok: true,
    point: {
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      mapUrl: value,
      source: "LINK",
    },
  }
}
