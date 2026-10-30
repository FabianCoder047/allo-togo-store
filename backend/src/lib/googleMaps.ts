const GOOGLE_MAPS_SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"])

const isGoogleDomain = (hostname: string) =>
  hostname === "google.com" ||
  hostname.endsWith(".google.com") ||
  hostname === "google.tg" ||
  hostname.endsWith(".google.tg")

/**
 * Accepte uniquement les liens Google Maps afin d’éviter qu’un lien externe
 * soit présenté comme le point de livraison dans le back-office.
 */
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
