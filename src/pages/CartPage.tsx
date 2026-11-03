import { Icon } from "../components/Icon"
import { PageHero, EmptyState } from "../components/ui"
import { productImage } from "../components/ProductCard"
import { CartPackageControls } from "../components/CartPackageControls"
import { useStore } from "../context/StoreContext"
import { formatPrice } from "../lib/format"
import {
  orderItemQuantityLabel,
  productPriceForQuantity,
  productSelectionTotal,
} from "../lib/catalog"

export function CartPage({ navigate }: { navigate: (path: string) => void }) {
  const {
    cartLines,
    cartSubtotal,
    setQuantity,
    setCartonCount,
    removeFromCart,
    cartCount,
  } = useStore()

  return (
    <main>
      <PageHero
        eyebrow="Votre sélection"
        title="Panier"
        text="Vérifiez les quantités avant de préparer votre commande. Le mode de règlement sera choisi au moment de la livraison."
      />
      <section className="section cart-page">
        <div className="shell cart-layout">
          <div className="cart-list">
            {cartLines.length === 0 ? (
              <EmptyState
                title="Votre panier est vide"
                text="Découvrez nos traceurs GPS et nos boissons pour préparer votre commande."
                action={
                  <button
                    className="primary"
                    onClick={() => navigate("/traceurs")}
                  >
                    Découvrir les produits
                  </button>
                }
              />
            ) : (
              cartLines.map(({ product, quantity, cartonCount }) => (
                <article className="cart-row" key={product.id}>
                  <img
                    src={productImage(product)}
                    alt={product.images[0]?.alt || product.name}
                  />
                  <div>
                    <span>
                      {product.type === "GPS" ? "Traceur GPS" : "Boisson"}
                    </span>
                    <h3>{product.name}</h3>
                    {quantity > 0 && (
                      <strong>
                        {formatPrice(
                          productPriceForQuantity(
                            product,
                            quantity +
                              cartonCount * (product.cartonQuantity ?? 0),
                          ),
                        )}{" "}
                        / {product.type === "DRINK" ? "bouteille" : "unité"}
                      </strong>
                    )}
                    {product.previousPrice && (
                      <small>
                        Avant : {formatPrice(product.previousPrice)}
                      </small>
                    )}
                    {cartonCount > 0 && product.cartonPrice && (
                      <small>
                        {cartonCount} carton(s) ×{" "}
                        {formatPrice(product.cartonPrice)}
                      </small>
                    )}
                    {cartonCount > 0 && (
                      <small>
                        Détail :{" "}
                        {orderItemQuantityLabel({
                          quantity,
                          cartonCount,
                          cartonQuantity: product.cartonQuantity,
                        })}
                      </small>
                    )}
                  </div>
                  <CartPackageControls
                    product={product}
                    quantity={quantity}
                    cartonCount={cartonCount}
                    onQuantityChange={(next) =>
                      setQuantity(product.id, next)
                    }
                    onCartonCountChange={(next) =>
                      setCartonCount(product.id, next)
                    }
                  />
                  <button
                    className="remove-btn"
                    onClick={() => removeFromCart(product.id)}
                    aria-label={`Retirer ${product.name}`}
                  >
                    <Icon name="x" />
                  </button>
                </article>
              ))
            )}
          </div>
          <aside className="order-summary">
            <h2>Récapitulatif</h2>
            <div>
              <span>Sous-total</span>
              <strong>{formatPrice(cartSubtotal)}</strong>
            </div>
            <div>
              <span>Livraison</span>
              <strong>À confirmer</strong>
            </div>
            <div>
              <span>Articles</span>
              <strong>{cartCount}</strong>
            </div>
            <div className="summary-total">
              <span>Total produits</span>
              <strong>{formatPrice(cartSubtotal)}</strong>
            </div>
            <p>
              Pour une livraison, le choix espèces ou paiement mobile se fait
              dans l’espace de suivi au démarrage de la course. Le retrait se
              règle en agence.
            </p>
            <button
              className="primary wide"
              disabled={!cartLines.length}
              onClick={() => navigate("/commande")}
            >
              Continuer la commande <Icon name="arrow" />
            </button>
          </aside>
        </div>
      </section>
    </main>
  )
}
