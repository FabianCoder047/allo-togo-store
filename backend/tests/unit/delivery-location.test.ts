import { describe, expect, it } from "vitest"
import { isGoogleMapsUrl } from "../../src/lib/googleMaps.js"
import { checkoutSchema } from "../../src/modules/orders/schemas.js"

const baseCheckout = {
  customer: {
    name: "Client Test",
    phone: "+22890000000",
  },
  items: [{ productId: "product-1", quantity: 1 }],
}

const parse = (
  delivery: Record<string, unknown>,
  fulfillmentMode = "LIVRAISON",
) =>
  checkoutSchema.safeParse({
    ...baseCheckout,
    fulfillmentMode,
    delivery,
  })

describe("Point de livraison Google Maps", () => {
  it("accepte des coordonnées complètes sans adresse textuelle", () => {
    const result = parse({ latitude: 6.1319, longitude: 1.2228 })
    expect(result.success).toBe(true)
  })

  it("accepte un lien Google Maps seul, y compris un lien court", () => {
    expect(parse({ mapUrl: "https://maps.app.goo.gl/abc123" }).success).toBe(
      true,
    )
    expect(
      parse({
        mapUrl:
          "https://www.google.com/maps/place/Allo+Togo/@6.1319,1.2228,17z",
      }).success,
    ).toBe(true)
    expect(
      parse({ mapUrl: "https://maps.google.com/?q=6.1319,1.2228" }).success,
    ).toBe(true)
  })

  it("refuse une livraison sans point précis", () => {
    const result = parse({ zone: "Lomé", address: "Rue de test" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "delivery.mapUrl",
        ),
      ).toBe(true)
    }
  })

  it("refuse un lien qui ne pointe pas vers Google Maps", () => {
    const result = parse({ mapUrl: "https://example.com/maps?q=6.1319,1.2228" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("Google Maps"),
        ),
      ).toBe(true)
    }
  })

  it("refuse des coordonnées incomplètes ou hors limites", () => {
    expect(parse({ latitude: 6.1319 }).success).toBe(false)
    expect(parse({ latitude: 91, longitude: 1.2228 }).success).toBe(false)
    expect(parse({ latitude: 6.1319, longitude: 181 }).success).toBe(false)
  })

  it("ne demande pas de point pour un retrait en agence", () => {
    expect(parse({}, "RETRAIT_AGENCE").success).toBe(true)
  })

  it("reconnaît les domaines Google Maps et rejette les autres", () => {
    expect(isGoogleMapsUrl("https://www.google.com/maps?q=6.1319,1.2228")).toBe(
      true,
    )
    expect(isGoogleMapsUrl("https://www.google.tg/maps?q=6.1319,1.2228")).toBe(
      true,
    )
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/abc123")).toBe(true)
    expect(isGoogleMapsUrl("https://goo.gl/maps/abc123")).toBe(true)
    expect(isGoogleMapsUrl("https://example.com/maps")).toBe(false)
    expect(isGoogleMapsUrl("javascript:alert(1)")).toBe(false)
  })
})
