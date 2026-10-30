import { useEffect, useState } from "react"
import { Icon } from "../components/Icon"
import { RotatableImage } from "../components/RotatableImage"
import { ErrorState, LoadingState } from "../components/ui"
import { productImage } from "../components/ProductCard"
import { useStore } from "../context/StoreContext"
import { api, errorMessage } from "../lib/api"
import { formatPrice } from "../lib/format"
import { wholesaleQuantityLabel } from "../lib/catalog"
import { trackEvent } from "../lib/analytics"
import type { Product } from "../types"

const characteristicLabels: Record<string, string> = {
  idealFor: "Usage idéal",
  installation: "Installation",
  power: "Alimentation",
  connectivity: "Connectivité",
  tracking: "Mode de suivi",
  alerts: "Alertes",
  sim: "Carte SIM / abonnement",
  warranty: "Garantie",
}

export function ProductPage({
  id,
  navigate,
}: {
  id: string
  navigate: (path: string) => void
}) {
  const { products, loadingCatalog, addToCart, notify } = useStore()
  const [product, setProduct] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null)

  useEffect(() => {
    const fromStore = products.find(
      (item) => item.id === id || item.slug === id,
    )
    if (fromStore) {
      setProduct(fromStore)
      setLoading(false)
      setError(null)
      return
    }
    if (loadingCatalog) return
    let cancelled = false
    setLoading(true)
    api.catalog
      .product(id)
      .then((data) => {
        if (!cancelled) {
          setProduct(data)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, products, loadingCatalog])

  useEffect(() => {
    if (!product) return
    trackEvent("product_viewed", {
      productId: product.id,
      name: product.name,
      type: product.type,
      price: product.price,
    })
  }, [product?.id])

  if (loading) {
    return (
      <main className="section">
        <div className="shell">
          <LoadingState label="Chargement du produit…" />
        </div>
      </main>
    )
  }

  if (error || !product) {
    return (
      <main className="section">
        <div className="shell">
          <ErrorState
            message={error || "Produit introuvable."}
            onRetry={() => navigate("/traceurs")}
          />
        </div>
      </main>
    )
  }

  const isGps = product.type === "GPS"
  const isService = product.type === "SERVICE"
  const canOrder = product.available && !product.quoteOnly && product.price > 0
  const selectedVideo = product.videos?.find(
    (video) => video.url === selectedMedia,
  )
  const selectedImage = product.images.find(
    (image) => image.url === selectedMedia,
  )
  const characteristics = Object.entries(product.specs ?? {}).filter(
    ([, value]) => value,
  )

  const add = () => {
    if (!canOrder) {
      navigate(`/service/${product.id}`)
      return
    }
    addToCart(product.id)
    notify(`${product.name} ajouté au panier.`, "success")
  }

  return (
    <main>
      <section className="section detail-page">
        <div className="shell detail-grid">
          <div className="detail-gallery">
            <button
              className="back-link"
              onClick={() =>
                navigate(
                  isGps ? "/traceurs" : isService ? "/services" : "/boissons",
                )
              }
            >
              <Icon name="arrow" /> Retour au catalogue
            </button>
            {selectedVideo ? (
              <video
                className="detail-video"
                src={selectedVideo.url}
                controls
                aria-label={selectedVideo.alt || product.name}
              />
            ) : (
              <RotatableImage
                src={selectedImage?.url || productImage(product)}
                alt={
                  selectedImage?.alt || product.images[0]?.alt || product.name
                }
                className="detail-rotatable"
              />
            )}
            {(product.images.length > 1 || product.videos?.length > 0) && (
              <div className="detail-media-thumbs">
                {product.images.map((image) => (
                  <button
                    type="button"
                    key={image.id}
                    className={
                      selectedImage?.id === image.id ||
                      (!selectedMedia && image.id === product.images[0]?.id)
                        ? "active"
                        : ""
                    }
                    onClick={() => setSelectedMedia(image.url)}
                    aria-label={`Afficher ${image.alt || "la photo " + product.name}`}
                  >
                    <img src={image.url} alt="" />
                  </button>
                ))}
                {product.videos?.map((video) => (
                  <button
                    type="button"
                    key={video.id}
                    className={selectedVideo?.id === video.id ? "active" : ""}
                    onClick={() => setSelectedMedia(video.url)}
                    aria-label={`Lire ${video.alt || "la vidéo " + product.name}`}
                  >
                    <span>▶</span>
                    <small>Vidéo</small>
                  </button>
                ))}
              </div>
            )}
            {product.images.length > 0 && !selectedVideo && (
              <span className="media-hint">
                Glissez le visuel avec la souris ou le doigt pour le faire
                pivoter.
              </span>
            )}
          </div>
          <div className="detail-copy">
            <span className="eyebrow">
              {isGps
                ? "Traceur GPS"
                : isService
                  ? "Pack de service"
                  : "Boisson"}
            </span>
            <h1>{product.name}</h1>
            <p>{product.description || product.shortDescription || ""}</p>
            <div className="detail-price">
              {product.previousPrice && (
                <del>{formatPrice(product.previousPrice)}</del>
              )}
              {formatPrice(product.price)}
              <small>
                {canOrder
                  ? product.type === "DRINK"
                    ? "Prix unitaire, affiché en FCFA"
                    : "Prix affiché en FCFA, confirmé avant la commande"
                  : "Tarif sur devis — contactez Allo Togo"}
              </small>
              {product.type === "DRINK" && product.cartonPrice && (
                <small>
                  Prix du carton : {formatPrice(product.cartonPrice)}
                </small>
              )}
            </div>
            {product.wholesalePrices?.length ? (
              <div className="technical-sheet">
                <h2>Tarifs de gros dégressifs</h2>
                {product.wholesalePrices.map((tier) => (
                  <div key={tier.minQuantity}>
                    <span>{wholesaleQuantityLabel(tier)}</span>
                    <strong>{formatPrice(tier.unitPrice)} / unité</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {characteristics.length > 0 && (
              <div className="technical-sheet">
                <h2>Caractéristiques</h2>
                {characteristics.map(([label, value]) => (
                  <div key={label}>
                    <span>{characteristicLabels[label] || label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="notice-box">
              <strong>
                {canOrder ? "Information importante" : "Produit sur devis"}
              </strong>
              <p>
                {canOrder
                  ? "Aucun paiement n’est demandé au checkout. Pour une livraison, choisissez espèces ou Flooz / Mixx by Yas depuis votre espace de suivi lorsque la course commence."
                  : "Ce produit ne peut pas être commandé directement. Transmettez une demande de devis pour recevoir une proposition adaptée."}
              </p>
            </div>
            <button className="primary wide" onClick={add}>
              {canOrder ? "Ajouter au panier" : "Demander un devis"}{" "}
              <Icon name={canOrder ? "bag" : "arrow"} />
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
