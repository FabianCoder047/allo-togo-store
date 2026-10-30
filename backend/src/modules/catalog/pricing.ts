export function priceForQuantity(
  price: number,
  wholesalePrices: unknown,
  quantity: number,
): number {
  if (!Array.isArray(wholesalePrices)) return price

  const tiers = wholesalePrices.filter(
    (tier): tier is {
      minQuantity: number
      maxQuantity?: number | null
      unitPrice: number
    } =>
      typeof tier === "object" &&
      tier !== null &&
      "minQuantity" in tier &&
      "unitPrice" in tier &&
      (!("maxQuantity" in tier) ||
        tier.maxQuantity === null ||
        Number.isSafeInteger(tier.maxQuantity)) &&
      Number.isSafeInteger(tier.minQuantity) &&
      Number.isSafeInteger(tier.unitPrice) &&
      tier.minQuantity > 0 &&
      tier.unitPrice > 0,
  )

  if (tiers.length > 0 && tiers.every((tier) => !("maxQuantity" in tier))) {
    return (
      tiers
        .filter((tier) => quantity >= tier.minQuantity)
        .sort((a, b) => b.minQuantity - a.minQuantity)[0]?.unitPrice ?? price
    )
  }

  return (
    tiers.find(
      (tier) =>
        quantity >= tier.minQuantity &&
        (tier.maxQuantity == null || quantity <= tier.maxQuantity),
    )?.unitPrice ?? price
  )
}
