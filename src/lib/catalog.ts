import type { Product, WholesalePrice } from "../types"

export function wholesaleQuantityLabel(tier: WholesalePrice): string {
  return tier.maxQuantity == null
    ? `À partir de ${tier.minQuantity} unités`
    : `De ${tier.minQuantity} à ${tier.maxQuantity} unités`
}

export function productPriceForQuantity(
  product: Product,
  quantity: number,
): number {
  const tiers = product.wholesalePrices ?? []
  if (tiers.length > 0 && tiers.every((tier) => !('maxQuantity' in tier))) {
    return (
      tiers
        .filter((tier) => quantity >= tier.minQuantity)
        .sort((a, b) => b.minQuantity - a.minQuantity)[0]?.unitPrice ??
      product.price
    )
  }

  return (
    tiers.find(
      (tier) =>
        quantity >= tier.minQuantity &&
        (tier.maxQuantity == null || quantity <= tier.maxQuantity),
    )?.unitPrice ??
    product.price
  )
}
