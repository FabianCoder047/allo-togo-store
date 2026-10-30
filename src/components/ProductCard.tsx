import { Icon } from "./Icon"
import { RotatableImage } from "./RotatableImage"
import { formatPrice } from "../lib/format"
import { productPriceForQuantity, wholesaleQuantityLabel } from "../lib/catalog"
import type { Product } from "../types"

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="100%" height="100%" fill="#f2f4f4"/><text x="50%" y="50%" font-family="sans-serif" font-size="34" fill="#9aa3a3" text-anchor="middle">Allo Togo</text></svg>',
  )

export function productImage(product: Product): string {
  return product.images[0]?.url || PLACEHOLDER
}

export function ProductCard({
  product,
  badge,
  onAdd,
  onView,
}: {
  product: Product
  badge?: string
  onAdd: () => void
  onView: () => void
}) {
  const isGps = product.type === "GPS"
  return (
    <article className="product-card">
      <div className="product-image">
        <RotatableImage
          src={productImage(product)}
          alt={product.images[0]?.alt || product.name}
          className="card-rotatable"
          showHint={false}
        />
        <span className="product-badge">
          {badge ||
            product.category?.name ||
            (isGps ? "Traceur GPS" : "Boisson")}
        </span>
        <button
          className="quick-view"
          onClick={onView}
          aria-label={`Voir ${product.name}`}
        >
          <Icon name="search" />
        </button>
      </div>
      <div className="product-body">
        <span className="product-category">
          {isGps
            ? "Traceur GPS"
            : product.type === "DRINK"
              ? "Boisson"
              : "Service"}
        </span>
        <h3>{product.name}</h3>
        <p>{product.shortDescription || product.description || ""}</p>
        {isGps && product.specs && (
          <div className="card-specs">
            {product.specs.idealFor && (
              <span>
                <Icon name="car" size={15} />
                {product.specs.idealFor}
              </span>
            )}
            {product.specs.tracking && (
              <span>
                <Icon name="map" size={15} />
                {product.specs.tracking}
              </span>
            )}
          </div>
        )}
        <div className="price-row">
          <strong>
            {product.previousPrice && (
              <del>{formatPrice(product.previousPrice)}</del>
            )}
            {formatPrice(product.price)}
          </strong>
          <span>
            {product.quoteOnly || product.price <= 0
              ? "Tarif à confirmer par Allo Togo"
              : "Prix affiché en FCFA"}
          </span>
          {product.type === "DRINK" && product.cartonPrice && (
            <span>Carton : {formatPrice(product.cartonPrice)}</span>
          )}
          {product.wholesalePrices?.length ? (
            <span>
              {wholesaleQuantityLabel(product.wholesalePrices[0])}:{" "}
              {formatPrice(
                productPriceForQuantity(
                  product,
                  product.wholesalePrices[0].minQuantity,
                ),
              )}
            </span>
          ) : null}
        </div>
        <div className="product-actions">
          <button className="secondary compact" onClick={onView}>
            Voir le produit
          </button>
          <button
            className="primary icon-only"
            onClick={onAdd}
            disabled={
              !product.available || product.quoteOnly || product.price <= 0
            }
            aria-label={`Ajouter ${product.name} au panier`}
            title={
              !product.available || product.quoteOnly || product.price <= 0
                ? "Ce produit fait l’objet d’une demande de devis."
                : "Ajouter au panier"
            }
          >
            <Icon name="bag" />
          </button>
        </div>
      </div>
    </article>
  )
}
