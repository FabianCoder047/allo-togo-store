export const formatPrice = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? `${value.toLocaleString("fr-FR")} FCFA`
    : "Sur devis"

/**
 * Montant monétaire strict : 0 est un montant valide (« 0 FCFA »),
 * contrairement à formatPrice où 0 signifie « sur devis ».
 */
export const formatMoney = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.max(0, Math.round(value)).toLocaleString("fr-FR")} FCFA`
    : "—"

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const formatDateShort = (
  value: string | Date | null | undefined,
): string => {
  if (!value) return "—"
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export const formatTime = (value: string | Date | null | undefined): string => {
  if (!value) return ""
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const initials = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
