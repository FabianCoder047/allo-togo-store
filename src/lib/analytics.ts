import posthog from "posthog-js"
import type { StaffUser } from "../types"

const key = String(import.meta.env.VITE_POSTHOG_KEY ?? "").trim()
const host =
  String(import.meta.env.VITE_POSTHOG_HOST ?? "").trim() ||
  "https://eu.i.posthog.com"
const dashboardUrl = String(
  import.meta.env.VITE_POSTHOG_DASHBOARD_URL ?? "",
).trim()

export const analyticsConfig = {
  configured: Boolean(key),
  host,
  dashboardUrl: dashboardUrl || null,
}

let initialized = false

/**
 * Initialise PostHog uniquement si une clé publique de projet est fournie.
 * Sans clé, toute l'intégration reste silencieuse : aucun appel réseau et
 * aucune donnée inventée dans le back-office.
 */
export const initAnalytics = () => {
  if (initialized || !key || typeof window === "undefined") return
  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    person_profiles: "identified_only",
    persistence: "localStorage+cookie",
  })
  initialized = true
}

export const trackPageview = (
  path: string,
  properties: Record<string, unknown> = {},
) => {
  if (!initialized) return
  posthog.capture("$pageview", {
    ...properties,
    path,
    $current_url: window.location.href,
  })
}

export const trackEvent = (
  event: string,
  properties: Record<string, unknown> = {},
) => {
  if (!initialized) return
  posthog.capture(event, properties)
}

export const identifyAnalytics = (user: StaffUser) => {
  if (!initialized) return
  posthog.identify(user.id, {
    email: user.email,
    name: user.name,
    role: user.role,
  })
}

export const resetAnalytics = () => {
  if (!initialized) return
  posthog.reset()
}
