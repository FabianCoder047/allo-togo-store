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
  if (tiers.length > 0 && tiers.every((tier) => !("maxQuantity" in tier))) {
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
    )?.unitPrice ?? product.price
  )
}

export function productSelectionTotal(
  product: Product,
  quantity: number,
  cartonCount: number,
): number {
  const totalUnits = quantity + cartonCount * (product.cartonQuantity ?? 0)
  return (
    productPriceForQuantity(product, totalUnits) * quantity +
    (product.cartonPrice ?? 0) * cartonCount
  )
}

export function purchaseQuantityLabel(
  quantity: number,
  cartonCount: number,
  cartonQuantity: number | null,
): string {
  const parts: string[] = []
  if (quantity > 0) {
    parts.push(`${quantity} bouteille${quantity === 1 ? "" : "s"}`)
  }
  if (cartonCount > 0) {
    const cartonContents = cartonQuantity
      ? ` (${cartonCount * cartonQuantity} bouteilles)`
      : ""
    parts.push(
      `${cartonCount} carton${cartonCount === 1 ? "" : "s"}${cartonContents}`,
    )
  }
  return parts.join(" + ")
}

export function orderItemQuantityLabel(item: {
  quantity: number
  cartonCount: number
  cartonQuantity: number | null
}): string {
  if (item.cartonCount > 0) {
    return purchaseQuantityLabel(
      item.quantity,
      item.cartonCount,
      item.cartonQuantity,
    )
  }
  return `${item.quantity} bouteille${item.quantity === 1 ? "" : "s"}`
}

export function orderItemDescription(item: {
  productName: string
  quantity: number
  cartonCount: number
  cartonQuantity: number | null
}): string {
  return item.cartonCount > 0
    ? `${item.productName} — ${orderItemQuantityLabel(item)}`
    : `${item.productName} × ${item.quantity}`
}
