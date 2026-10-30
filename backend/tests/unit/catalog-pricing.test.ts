import { describe, expect, it } from 'vitest'
import { priceForQuantity } from '../../src/modules/catalog/pricing.js'
import { productInputSchema, productUpdateSchema } from '../../src/modules/catalog/schemas.js'

describe('Tarifs de gros du catalogue', () => {
  const price = 3_000
  const tiers = [
    { minQuantity: 10, maxQuantity: 49, unitPrice: 2_800 },
    { minQuantity: 50, maxQuantity: null, unitPrice: 2_500 },
  ]

  it('conserve le prix actuel avant le premier seuil', () => {
    expect(priceForQuantity(price, tiers, 9)).toBe(price)
  })

  it('applique le tarif au premier seuil atteint', () => {
    expect(priceForQuantity(price, tiers, 10)).toBe(2_800)
  })

  it('revient au prix courant entre deux plages', () => {
    expect(priceForQuantity(price, tiers, 49)).toBe(2_800)
  })

  it('applique le palier le plus avantageux atteint', () => {
    expect(priceForQuantity(price, tiers, 75)).toBe(2_500)
  })

  it('reste compatible avec les anciens paliers sans quantité maximale', () => {
    const legacyTiers = [
      { minQuantity: 10, unitPrice: 2_800 },
      { minQuantity: 50, unitPrice: 2_500 },
    ]
    expect(priceForQuantity(price, legacyTiers, 75)).toBe(2_500)
  })

  it('ignore une donnée de paliers invalide', () => {
    expect(priceForQuantity(price, [{ minQuantity: '10', unitPrice: 2_500 }], 20)).toBe(price)
    expect(priceForQuantity(price, null, 20)).toBe(price)
  })
})

describe('Validation des fiches du catalogue', () => {
  const product = {
    categoryId: 'drinks-category',
    name: 'Boisson test',
    sku: 'DRINK-TEST',
    type: 'DRINK',
    shortDescription: 'Description courte',
    description: 'Description complète',
    price: 3_000,
    images: [{ url: 'https://example.test/boisson.jpg' }],
    wholesalePrices: [
      { minQuantity: 5, maxQuantity: 9, unitPrice: 2_800 },
      { minQuantity: 10, maxQuantity: 19, unitPrice: 2_500 },
      { minQuantity: 20, maxQuantity: null, unitPrice: 2_000 },
    ],
  }

  it('accepte des paliers bornés ou illimités sans slug fourni', () => {
    expect(productInputSchema.safeParse(product).success).toBe(true)
  })

  it('exige au moins une image à la création et interdit de toutes les supprimer', () => {
    expect(productInputSchema.safeParse({ ...product, images: [] }).success).toBe(false)
    const withoutImages: Record<string, unknown> = { ...product }
    delete withoutImages.images
    expect(productInputSchema.safeParse(withoutImages).success).toBe(false)
    expect(productUpdateSchema.safeParse({ images: [] }).success).toBe(false)
    expect(productUpdateSchema.safeParse({ name: 'Boisson renommée' }).success).toBe(true)
  })

  it('refuse plus de cinq paliers', () => {
    expect(
      productInputSchema.safeParse({
        ...product,
        wholesalePrices: Array.from({ length: 6 }, (_, index) => ({
          minQuantity: index * 2 + 1,
          maxQuantity: index * 2 + 1,
          unitPrice: 2_900 - index * 100,
        })),
      }).success,
    ).toBe(false)
  })

  it('refuse les paliers qui se chevauchent ou dont le prix ne baisse pas', () => {
    expect(
      productInputSchema.safeParse({
        ...product,
        wholesalePrices: [
          { minQuantity: 5, maxQuantity: 10, unitPrice: 2_800 },
          { minQuantity: 10, maxQuantity: null, unitPrice: 2_900 },
        ],
      }).success,
    ).toBe(false)
  })

  it('refuse le stock pour un service', () => {
    expect(
      productInputSchema.safeParse({
        ...product,
        type: 'SERVICE',
        wholesalePrices: [],
        manageStock: true,
        stock: 5,
      }).success,
    ).toBe(false)
  })
})
