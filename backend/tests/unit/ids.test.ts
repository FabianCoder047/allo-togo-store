import { describe, expect, it } from "vitest"
import {
  generateOrderNumber,
  generatePublicRef,
  generateTemporaryPassword,
  generateTrackingCode,
  hashPhone,
  normalizePhone,
} from "../../src/lib/ids.js"

describe("Identifiants et codes publics", () => {
  it("génère un code de suivi au format attendu", () => {
    const code = generateTrackingCode(12)
    expect(code).toHaveLength(12)
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{12}$/)
  })

  it("génère des codes de suivi distincts", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateTrackingCode(12)),
    )
    expect(codes.size).toBe(50)
  })

  it("génère une référence de groupe lisible", () => {
    expect(generatePublicRef()).toMatch(/^ATG-\d{8}-[A-HJ-NP-Z2-9]{6}$/)
  })

  it("génère un numéro de commande selon la catégorie", () => {
    expect(generateOrderNumber("GPS")).toMatch(
      /^CMD-GPS-\d{8}-[A-HJ-NP-Z2-9]{5}$/,
    )
    expect(generateOrderNumber("DRINK")).toMatch(
      /^CMD-DRINK-\d{8}-[A-HJ-NP-Z2-9]{5}$/,
    )
  })

  it("normalise les numéros de téléphone togolais", () => {
    expect(normalizePhone("+228 90 12 34 56")).toBe("90123456")
    expect(normalizePhone("0022890123456")).toBe("0022890123456")
    expect(hashPhone("+22890123456")).toBe(hashPhone("90 12 34 56"))
  })

  it("produit un hachage non réversible", () => {
    const hash = hashPhone("+22890123456")
    expect(hash).toHaveLength(64)
    expect(hash).not.toContain("90123456")
  })

  it("génère un mot de passe provisoire de 6 caractères avec majuscule, minuscule et chiffre", () => {
    const passwords = Array.from({ length: 20 }, () =>
      generateTemporaryPassword(6),
    )
    for (const password of passwords) {
      expect(password).toHaveLength(6)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[0-9]/)
    }
    expect(new Set(passwords).size).toBeGreaterThan(1)
  })
})
