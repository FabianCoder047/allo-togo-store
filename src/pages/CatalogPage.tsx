import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { RotatableImage } from "../components/RotatableImage"
import {
  PageHero,
  LoadingState,
  ErrorState,
  EmptyState,
} from "../components/ui"
import { productImage } from "../components/ProductCard"
import { useStore } from "../context/StoreContext"
import { formatPrice } from "../lib/format"
import { productPriceForQuantity, wholesaleQuantityLabel } from "../lib/catalog"
import type { Product } from "../types"

export function CatalogPage({
  type,
  navigate,
}: {
  type: "gps" | "drink"
  navigate: (path: string) => void
}) {
  const {
    products,
    loadingCatalog,
    catalogError,
    reloadCatalog,
    addToCart,
    notify,
  } = useStore()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("relevance")
  const [compare, setCompare] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  const source = useMemo(
    () =>
      products.filter(
        (product) => product.type === (type === "gps" ? "GPS" : "DRINK"),
      ),
    [products, type],
  )
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = source.filter((item) =>
      `${item.name} ${item.shortDescription ?? ""} ${item.category?.name ?? ""}`
        .toLowerCase()
        .includes(needle),
    )
    if (sort === "price-asc") return [...rows].sort((a, b) => a.price - b.price)
    if (sort === "price-desc")
      return [...rows].sort((a, b) => b.price - a.price)
    return rows
  }, [source, query, sort])
  const comparedProducts = useMemo(
    () => source.filter((item) => compare.includes(item.id)),
    [source, compare],
  )

  const toggleCompare = (id: string) =>
    setCompare((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    )

  const add = (product: Product) => {
    addToCart(product.id)
    notify(`${product.name} ajouté au panier.`, "success")
  }

  return (
    <main>
      <PageHero
        eyebrow={type === "gps" ? "Priorité Allo Togo" : "Espace boissons"}
        title={
          type === "gps" ? "Catalogue des traceurs GPS" : "Boissons à commander"
        }
        text={
          type === "gps"
            ? "Comparez nos solutions par usage et ajoutez le modèle adapté à votre véhicule. Les caractéristiques définitives sont confirmées avant la commande."
            : "Choisissez vos boissons et préparez une commande adaptée à vos besoins. Les stocks sont mis à jour en temps réel."
        }
        image={
          type === "gps"
            ? "/images/banners/gps.webp"
            : "/images/products/vitalo.webp"
        }
        imageAlt={
          type === "gps"
            ? "Smartphone avec navigation GPS dans un véhicule"
            : "Canette Vitalo Ananas 33 cl"
        }
        imageClassName={type === "drink" ? "vitalo" : undefined}
        badge={
          type === "gps" ? (
            <>
              <Icon name="tracker" size={14} /> Localisation véhicule
            </>
          ) : (
            <>
              <Icon name="can" size={14} /> Vitalo Ananas
            </>
          )
        }
      />
      <section className="section catalog-page">
        <div className="shell">
          <div className="catalog-tools">
            <label className="catalog-search">
              <Icon name="search" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher dans le catalogue"
              />
            </label>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="relevance">Trier par pertinence</option>
              <option value="price-asc">Prix croissant</option>
              <option value="price-desc">Prix décroissant</option>
            </select>
          </div>
          <div className="catalog-meta">
            <strong>
              {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
            </strong>
            <span>Catalogue connecté</span>
          </div>

          {loadingCatalog ? (
            <LoadingState label="Chargement du catalogue…" />
          ) : catalogError ? (
            <ErrorState
              message={catalogError}
              onRetry={() => void reloadCatalog()}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Aucun produit ne correspond"
              text="Modifiez votre recherche ou revenez au catalogue complet."
              action={
                <button className="secondary" onClick={() => setQuery("")}>
                  Réinitialiser la recherche
                </button>
              }
            />
          ) : (
            <div className="product-grid">
              {filtered.map((item) => (
                <article
                  className={`product-card ${
                    compare.includes(item.id) ? "selected-compare" : ""
                  }`}
                  key={item.id}
                >
                  <div className="product-image">
                    <RotatableImage
                      src={productImage(item)}
                      alt={item.images[0]?.alt || item.name}
                      className="card-rotatable"
                      showHint={false}
                    />
                    <span className="product-badge">
                      {item.category?.name ||
                        (type === "gps" ? "Traceur GPS" : "Boisson")}
                    </span>
                    <button
                      className="quick-view"
                      onClick={() => navigate(`/produit/${item.id}`)}
                      aria-label={`Voir ${item.name}`}
                    >
                      <Icon name="search" />
                    </button>
                  </div>
                  <div className="product-body">
                    <span className="product-category">
                      {type === "gps" ? "Traceur GPS" : "Boisson"}
                    </span>
                    <h3>{item.name}</h3>
                    <p>{item.shortDescription || item.description || ""}</p>
                    {type === "gps" && item.specs && (
                      <div className="card-specs">
                        {item.specs.idealFor && (
                          <span>
                            <Icon name="car" size={15} />
                            {item.specs.idealFor}
                          </span>
                        )}
                        {item.specs.tracking && (
                          <span>
                            <Icon name="map" size={15} />
                            {item.specs.tracking}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="price-row">
                      <strong>
                        {item.previousPrice && (
                          <del>{formatPrice(item.previousPrice)}</del>
                        )}
                        {formatPrice(item.price)}
                      </strong>
                      <span>
                        {item.quoteOnly || item.price <= 0
                          ? "Tarif à confirmer"
                          : "Prix affiché en FCFA"}
                      </span>
                      {type === "drink" && item.cartonPrice && (
                        <span>Carton : {formatPrice(item.cartonPrice)}</span>
                      )}
                      {item.wholesalePrices?.length ? (
                        <span>
                          {wholesaleQuantityLabel(item.wholesalePrices[0])}:{" "}
                          {formatPrice(
                            productPriceForQuantity(
                              item,
                              item.wholesalePrices[0].minQuantity,
                            ),
                          )}
                        </span>
                      ) : null}
                    </div>
                    <div className="product-actions">
                      {type === "gps" && (
                        <button
                          type="button"
                          className={`compare-button ${
                            compare.includes(item.id) ? "active" : ""
                          }`}
                          onClick={() => toggleCompare(item.id)}
                          aria-pressed={compare.includes(item.id)}
                          aria-label={
                            compare.includes(item.id)
                              ? `Retirer ${item.name} du comparateur`
                              : `Ajouter ${item.name} au comparateur`
                          }
                          title={
                            compare.includes(item.id)
                              ? "Retirer du comparateur"
                              : compare.length >= 3
                                ? "Trois modèles maximum"
                                : "Ajouter au comparateur"
                          }
                        >
                          <Icon
                            name={
                              compare.includes(item.id) ? "check" : "compare"
                            }
                            size={16}
                          />
                          <span>
                            {compare.includes(item.id) ? "Ajouté" : "Comparer"}
                          </span>
                        </button>
                      )}
                      <button
                        className="secondary compact"
                        onClick={() => navigate(`/produit/${item.id}`)}
                      >
                        Voir le produit
                      </button>
                      <button
                        className="primary icon-only"
                        onClick={() => add(item)}
                        disabled={
                          !item.available || item.quoteOnly || item.price <= 0
                        }
                        title={
                          !item.available || item.quoteOnly || item.price <= 0
                            ? "Ce produit fait l’objet d’une demande de devis."
                            : "Ajouter au panier"
                        }
                        aria-label={`Ajouter ${item.name} au panier`}
                      >
                        <Icon name="bag" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {type === "gps" && compare.length > 0 && (
        <div className="compare-dock">
          <div className="compare-dock-products">
            {comparedProducts.map((item) => (
              <div key={item.id}>
                <img src={productImage(item)} alt="" />
                <span>{item.name}</span>
                <button
                  onClick={() => toggleCompare(item.id)}
                  aria-label={`Retirer ${item.name}`}
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
            {compare.length < 2 && <small>Ajoutez encore un traceur</small>}
          </div>
          <button
            className="primary small"
            disabled={compare.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            Comparer {compare.length} modèle{compare.length > 1 ? "s" : ""}
          </button>
        </div>
      )}

      {compareOpen && (
        <div className="overlay centered" onClick={() => setCompareOpen(false)}>
          <div
            className="compare-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="compare-head">
              <div>
                <span className="eyebrow">Aide au choix</span>
                <h2>Comparer les traceurs GPS</h2>
                <p>
                  Les informations ci-dessous proviennent du catalogue Allo Togo
                  et restent à confirmer.
                </p>
              </div>
              <button
                className="icon-btn"
                onClick={() => setCompareOpen(false)}
                aria-label="Fermer"
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="compare-scroll">
              <div className="compare-table">
                <div className="compare-label"></div>
                {comparedProducts.map((item) => (
                  <div className="compare-product" key={item.id}>
                    <img src={productImage(item)} alt={item.name} />
                    <strong>{item.name}</strong>
                    <span>{formatPrice(item.price)}</span>
                  </div>
                ))}
                {[
                  ["Usage idéal", "idealFor"],
                  ["Installation", "installation"],
                  ["Alimentation", "power"],
                  ["Connectivité", "connectivity"],
                  ["Suivi", "tracking"],
                  ["Alertes", "alerts"],
                  ["Carte SIM", "sim"],
                  ["Garantie", "warranty"],
                ].map(([label, key]) => (
                  <div className="compare-row" key={key}>
                    <strong>{label}</strong>
                    {comparedProducts.map((item) => (
                      <span key={item.id}>
                        {item.specs?.[
                          (key as keyof NonNullable<Product["specs"]>)
                        ] ?? "À confirmer"}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="compare-footer">
              <button
                className="secondary"
                onClick={() => setCompareOpen(false)}
              >
                Continuer à comparer
              </button>
              <button
                className="primary"
                onClick={() =>
                  comparedProducts[0] &&
                  navigate(`/produit/${comparedProducts[0].id}`)
                }
              >
                Voir le premier modèle <Icon name="arrow" />
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
