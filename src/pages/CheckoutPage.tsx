import { useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import { DeliveryLocationPicker } from "../components/DeliveryLocationPicker"
import { PageHero, EmptyState } from "../components/ui"
import { useStore } from "../context/StoreContext"
import { api, errorMessage } from "../lib/api"
import { formatPrice } from "../lib/format"
import { productPriceForQuantity } from "../lib/catalog"
import { trackEvent } from "../lib/analytics"
import type { DeliveryPointSelection } from "../lib/googleMaps"
import type { OrderGroupCreated } from "../types"

type Fulfillment = "LIVRAISON" | "RETRAIT_AGENCE"

export function CheckoutPage({
  navigate,
}: {
  navigate: (path: string) => void
}) {
  const { cartLines, cartSubtotal, cartCount, clearCart, notify } = useStore()
  const hasGps = cartLines.some((line) => line.product.type === "GPS")
  const [fulfillmentMode, setFulfillmentMode] =
    useState<Fulfillment>("LIVRAISON")
  const [requiresTechnician, setRequiresTechnician] = useState(false)
  const [paymentChoice, setPaymentChoice] =
    useState<"ESPECES" | "FLOOZ" | "MIXX_BY_YAS" | null>("ESPECES")
  const [deliveryPoint, setDeliveryPoint] =
    useState<DeliveryPointSelection>(null)
  const [deliveryPointError, setDeliveryPointError] = useState<string | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasMixedCart = useMemo(() => {
    const types = new Set(cartLines.map((line) => line.product.type))
    return types.has("GPS") && types.has("DRINK")
  }, [cartLines])

  if (cartLines.length === 0) {
    return (
      <main>
        <PageHero
          eyebrow="Commande sans paiement"
          title="Vos informations de livraison"
          text="Votre panier est vide. Ajoutez des produits avant de poursuivre."
        />
        <section className="section checkout-page">
          <div className="shell">
            <EmptyState
              title="Aucun article à commander"
              text="Ajoutez un traceur GPS ou des boissons à votre panier."
              action={
                <button
                  className="primary"
                  onClick={() => navigate("/traceurs")}
                >
                  Voir les traceurs
                </button>
              }
            />
          </div>
        </section>
      </main>
    )
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (fulfillmentMode === "LIVRAISON" && !deliveryPoint) {
      setDeliveryPointError(
        "Choisissez le point exact de livraison sur Google Maps avant de valider.",
      )
      const target = document.getElementById("delivery-point")
      if (target) {
        const top = window.scrollY + target.getBoundingClientRect().top - 96
        window.scrollTo({ top: Math.max(0, top), behavior: "instant" })
      } else {
        window.scrollTo({ top: 0, behavior: "instant" })
      }
      return
    }
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError(null)
    try {
      const result = await api.orders.create({
        customer: {
          name: String(form.get("name") ?? "").trim(),
          phone: String(form.get("phone") ?? "").trim(),
          whatsapp: String(form.get("whatsapp") ?? "").trim() || null,
          email: String(form.get("email") ?? "").trim() || null,
        },
        fulfillmentMode,
        delivery: {
          zone: String(form.get("zone") ?? "").trim(),
          address: String(form.get("address") ?? "").trim(),
          instructions: String(form.get("instructions") ?? "").trim(),
          contactPhone: String(form.get("contactPhone") ?? "").trim(),
          latitude: deliveryPoint?.latitude ?? null,
          longitude: deliveryPoint?.longitude ?? null,
          mapUrl: deliveryPoint?.mapUrl ?? null,
        },
        requiresTechnician: hasGps && requiresTechnician,
        items: cartLines.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      })
      window.sessionStorage.setItem("allo.lastOrder", JSON.stringify(result))
      trackEvent("order_created", {
        fulfillmentMode,
        orderCount: result.orders.length,
        total: result.orders.reduce((sum, order) => sum + order.total, 0),
        categoryTypes: result.orders.map((order) => order.categoryType),
      })
      clearCart()
      notify("Commande enregistrée. Conservez vos codes de suivi.", "success")
      navigate("/confirmation")
    } catch (err) {
      setError(errorMessage(err))
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <PageHero
        eyebrow="Commande sans paiement en ligne"
        title="Vos informations de livraison"
        text="Aucun paiement n’est demandé au checkout. Pour une livraison, vous choisirez votre règlement dans l’espace de suivi lorsque la course commencera."
      />
      <section className="section checkout-page">
        <form className="shell checkout-layout" onSubmit={submit}>
          <div className="checkout-form">
            {error && (
              <div className="alert error">
                <strong>La commande n’a pas pu être créée.</strong>
                <span>{error}</span>
              </div>
            )}
            <h2>Coordonnées</h2>
            <div className="form-row">
              <label>
                Nom complet
                <input
                  required
                  name="name"
                  placeholder="Votre nom"
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label>
                Téléphone
                <input
                  required
                  name="phone"
                  placeholder="+228 •• •• •• ••"
                  minLength={6}
                  maxLength={30}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                WhatsApp facultatif
                <input
                  name="whatsapp"
                  placeholder="+228 •• •• •• ••"
                  autoComplete="tel"
                  inputMode="tel"
                />
              </label>
              <label>
                Email facultatif
                <input
                  type="email"
                  name="email"
                  placeholder="nom@exemple.com"
                  autoComplete="email"
                />
              </label>
            </div>

            <h2>Mode de réception</h2>
            <label className="choice">
              <input
                type="radio"
                name="fulfillment"
                checked={fulfillmentMode === "LIVRAISON"}
                onChange={() => {
                  setFulfillmentMode("LIVRAISON")
                  setDeliveryPointError(null)
                }}
              />
              <span>
                <strong>Livraison</strong>
                <small>
                  Les frais et délais sont communiqués par l’équipe. Paiement à
                  la livraison, avant validation.
                </small>
              </span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name="fulfillment"
                checked={fulfillmentMode === "RETRAIT_AGENCE"}
                onChange={() => {
                  setFulfillmentMode("RETRAIT_AGENCE")
                  setDeliveryPointError(null)
                }}
              />
              <span>
                <strong>Retrait en agence</strong>
                <small>Retrait et paiement en agence, à Lomé.</small>
              </span>
            </label>

            {fulfillmentMode === "LIVRAISON" && (
              <>
                <h2>Adresse de livraison</h2>
                <DeliveryLocationPicker
                  value={deliveryPoint}
                  onChange={(next) => {
                    setDeliveryPoint(next)
                    if (next) setDeliveryPointError(null)
                  }}
                  error={deliveryPointError}
                />
                <div className="form-row">
                  <label>
                    Quartier ou zone (facultatif)
                    <input
                      name="zone"
                      placeholder="Quartier, ville ou zone"
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Téléphone sur place (facultatif)
                    <input
                      name="contactPhone"
                      placeholder="+228 •• •• •• ••"
                      inputMode="tel"
                    />
                  </label>
                </div>
                <label>
                  Point de repère ou adresse (facultatif)
                  <input
                    name="address"
                    placeholder="Rue, immeuble, repère…"
                    maxLength={500}
                  />
                </label>
              </>
            )}

            <label>
              Précisions facultatives
              <textarea
                name="instructions"
                rows={4}
                maxLength={1000}
                placeholder="Instructions ou préférences…"
              />
            </label>

            {hasGps && (
              <>
                <h2>Installation</h2>
                <label className="choice">
                  <input
                    type="checkbox"
                    checked={requiresTechnician}
                    onChange={(event) =>
                      setRequiresTechnician(event.target.checked)
                    }
                  />
                  <span>
                    <strong>Organiser l’installation du traceur GPS</strong>
                    <small>
                      Un technicien sera affecté à la commande GPS. Les boissons
                      restent une commande séparée.
                    </small>
                  </span>
                </label>
              </>
            )}

            <div className="notice-box">
              <strong>Règlement à la livraison</strong>
              <p>
                Aucun paiement en ligne n’est demandé maintenant. Le mode de
                règlement (espèces ou paiement mobile) vous sera proposé depuis
                votre espace de suivi quand votre commande sera en cours de
                livraison. Le choix espèces sera confirmé par le chef d’équipe
                sur place, puis enregistré par le commercial ou le directeur à
                son retour.
              </p>
            </div>
          </div>

          <aside className="order-summary">
            <span className="eyebrow">Résumé</span>
            <h2>
              {cartCount} article{cartCount > 1 ? "s" : ""}
            </h2>
            {cartLines.map((line) => (
              <div key={line.product.id}>
                <span>
                  {line.product.name} × {line.quantity}
                </span>
                <strong>
                  {formatPrice(
                    productPriceForQuantity(line.product, line.quantity) *
                      line.quantity,
                  )}
                </strong>
              </div>
            ))}
            <div className="summary-total">
              <span>Total produits</span>
              <strong>{formatPrice(cartSubtotal)}</strong>
            </div>
            <p>
              {hasMixedCart
                ? "Votre panier contient des traceurs GPS et des boissons : ils seront enregistrés en deux commandes opérationnelles indépendantes, reliées par une même référence de groupe."
                : "La disponibilité, le prix final, la livraison et le mode de règlement seront confirmés par Allo Togo."}
            </p>
            <button
              className="primary wide"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Enregistrement…" : "Valider ma commande"}{" "}
              <Icon name="check" />
            </button>
            <p className="summary-footnote">
              En validant, vous acceptez d’être contacté au sujet de cette
              commande.
            </p>
          </aside>
        </form>
      </section>
    </main>
  )
}

export type { OrderGroupCreated }
