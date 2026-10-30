import { env } from "./env.js"

/**
 * Origines autorisées pour HTTP et Socket.IO.
 * En développement, tout port local est toléré afin de ne pas casser
 * le proxy Vite, le serveur de prévisualisation ou les tests manuels.
 */
export const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true
  if (env.corsOrigins.includes(origin)) return true
  if (!env.isDevelopment) return false
  try {
    const { protocol, hostname } = new URL(origin)
    return (
      (protocol === "http:" || protocol === "https:") &&
      (hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "[::1]")
    )
  } catch {
    return false
  }
}
