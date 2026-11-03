import { Icon } from "./Icon"
import type { Product } from "../types"

export function CartPackageControls({
  product,
  quantity,
  cartonCount,
  onQuantityChange,
  onCartonCountChange,
  compact = false,
}: {
  product: Product
  quantity: number
  cartonCount: number
  onQuantityChange: (quantity: number) => void
  onCartonCountChange: (cartonCount: number) => void
  compact?: boolean
}) {
  const canOrderCartons =
    product.type === "DRINK" &&
    product.cartonPrice !== null &&
    product.cartonQuantity !== null

  if (!canOrderCartons) {
    return (
      <div className="qty">
        <button
          type="button"
          onClick={() => onQuantityChange(quantity - 1)}
          aria-label="Diminuer la quantité"
        >
          <Icon name="minus" size={15} />
        </button>
        <b>{quantity}</b>
        <button
          type="button"
          onClick={() => onQuantityChange(quantity + 1)}
          aria-label="Augmenter la quantité"
          disabled={quantity + cartonCount >= 99}
        >
          <Icon name="plus" size={15} />
        </button>
      </div>
    )
  }

  const className = compact
    ? "cart-package-controls compact"
    : "cart-package-controls"

  return (
    <div className={className}>
      <div>
        <span>Bouteilles</span>
        <div className="qty">
          <button
            type="button"
            onClick={() => onQuantityChange(quantity - 1)}
            aria-label="Diminuer le nombre de bouteilles"
          >
            <Icon name="minus" size={15} />
          </button>
          <b>{quantity}</b>
          <button
            type="button"
            onClick={() => onQuantityChange(quantity + 1)}
            aria-label="Augmenter le nombre de bouteilles"
            disabled={quantity + cartonCount >= 99}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
      </div>
      <div>
        <span>Cartons ({product.cartonQuantity} bouteilles)</span>
        <div className="qty">
          <button
            type="button"
            onClick={() => onCartonCountChange(cartonCount - 1)}
            aria-label="Diminuer le nombre de cartons"
          >
            <Icon name="minus" size={15} />
          </button>
          <b>{cartonCount}</b>
          <button
            type="button"
            onClick={() => onCartonCountChange(cartonCount + 1)}
            aria-label="Augmenter le nombre de cartons"
            disabled={quantity + cartonCount >= 99}
          >
            <Icon name="plus" size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
