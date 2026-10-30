import { useEffect, useMemo, useState } from "react"
import { Icon } from "../components/Icon"
import {
  PageHero,
  SectionTitle,
  LoadingState,
  ErrorState,
  EmptyState,
} from "../components/ui"
import { useStore } from "../context/StoreContext"
import { api, errorMessage } from "../lib/api"
import { formatPrice } from "../lib/format"
import { wholesaleQuantityLabel } from "../lib/catalog"
import { trackEvent } from "../lib/analytics"
import type { Product } from "../types"

const serviceVisuals = [
  {
    icon: "spark",
    tone: "orange",
    audience: "Entreprises et porteurs de projet",
  },
  { icon: "headset", tone: "blue", audience: "Particuliers et professionnels" },
  { icon: "building", tone: "green", audience: "Entrepreneurs et PME" },
  { icon: "truck", tone: "yellow", audience: "Commerces et entreprises" },
  { icon: "spark", tone: "orange", audience: "Particuliers et organisations" },
  {
    icon: "building",
    tone: "blue",
    audience: "Professionnels et associations",
  },
] as const

const visualFor = (index: number) =>
  serviceVisuals[index % serviceVisuals.length]

export function ServicesPage({
  navigate,
}: {
  navigate: (path: string) => void
}) {
  const { services, loadingCatalog, catalogError, reloadCatalog } = useStore()
  const [query, setQuery] = useState("")
  const visible = useMemo(
    () =>
      services.filter((service) =>
        `${service.name} ${service.shortDescription ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [services, query],
  )

  return (
    <main>
      <PageHero
        eyebrow="Expertises Allo Togo"
        title="Services professionnels en packs"
        text="Explorez nos catégories et transmettez une demande de devis sans engagement."
        image="/images/banners/services.webp"
        imageAlt="Équipe Allo Togo en séance de travail"
        badge={
          <>
            <Icon name="services" size={14} /> Conseil & accompagnement
          </>
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
                placeholder="Rechercher un service"
              />
            </label>
            <select>
              <option>Toutes les catégories</option>
              <option>Entreprise</option>
              <option>Particulier</option>
            </select>
          </div>
          {loadingCatalog ? (
            <LoadingState label="Chargement des services…" />
          ) : catalogError ? (
            <ErrorState
              message={catalogError}
              onRetry={() => void reloadCatalog()}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Aucun service ne correspond"
              text="Modifiez votre recherche pour afficher les packs disponibles."
            />
          ) : (
            <div className="service-grid service-catalog">
              {visible.map((service, index) => {
                const visual = visualFor(index)
                return (
                  <article
                    className={`service-card ${visual.tone}`}
                    key={service.id}
                  >
                    {service.images[0] ? (
                      <img
                        className="service-card-image"
                        src={service.images[0].url}
                        alt={service.images[0].alt || service.name}
                      />
                    ) : (
                      <div className="service-icon">
                        <Icon name={visual.icon} size={26} />
                      </div>
                    )}
                    <span className="service-audience">{visual.audience}</span>
                    <h3>{service.name}</h3>
                    <p>
                      {service.shortDescription || service.description || ""}
                    </p>
                    <strong>
                      {service.previousPrice && (
                        <del>{formatPrice(service.previousPrice)}</del>
                      )}
                      {service.price > 0
                        ? formatPrice(service.price)
                        : "Sur devis"}
                    </strong>
                    {service.wholesalePrices?.length && (
                      <small>
                        Tarifs de gros disponibles dans le détail du service
                      </small>
                    )}
                    <button onClick={() => navigate(`/service/${service.id}`)}>
                      Voir les détails <Icon name="arrow" size={17} />
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export function ServiceDetailPage({
  id,
  navigate,
}: {
  id: string
  navigate: (path: string) => void
}) {
  const { services, loadingCatalog, catalogError, reloadCatalog } = useStore()
  const service = services.find((item) => item.id === id || item.slug === id)
  const [sent, setSent] = useState<{ reference: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!service) return
    trackEvent("service_viewed", {
      productId: service.id,
      name: service.name,
      price: service.price,
    })
  }, [service?.id])

  if (loadingCatalog) {
    return (
      <main className="section">
        <div className="shell">
          <LoadingState label="Chargement du service…" />
        </div>
      </main>
    )
  }

  if (catalogError) {
    return (
      <main className="section">
        <div className="shell">
          <ErrorState
            message={catalogError}
            onRetry={() => void reloadCatalog()}
          />
        </div>
      </main>
    )
  }

  if (!service) {
    return (
      <main className="section">
        <div className="shell">
          <EmptyState
            title="Service introuvable"
            text="Ce pack de services n’est plus disponible."
            action={
              <button
                className="secondary"
                onClick={() => navigate("/services")}
              >
                Retour aux services
              </button>
            }
          />
        </div>
      </main>
    )
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError(null)
    try {
      const quote = await api.quotes.create({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? "") || null,
        serviceId: service.id,
        message: String(form.get("message") ?? ""),
      })
      setSent({ reference: quote.reference })
      trackEvent("quote_requested", {
        source: "service",
        serviceId: service.id,
      })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <section className="section service-detail">
        <div className="shell service-detail-grid">
          <div>
            <button className="back-link" onClick={() => navigate("/services")}>
              <Icon name="arrow" /> Retour aux services
            </button>
            {service.images.length > 0 && (
              <div className="service-detail-gallery">
                {service.images.map((image) => (
                  <img
                    key={image.id}
                    src={image.url}
                    alt={image.alt || service.name}
                  />
                ))}
              </div>
            )}
            {service.videos?.map((video) => (
              <video
                key={video.id}
                className="service-detail-video"
                src={video.url}
                controls
                aria-label={video.alt || service.name}
              />
            ))}
            <span className="eyebrow">Pack de service</span>
            <h1>{service.name}</h1>
            <p className="lead">
              {service.description || service.shortDescription || ""}
            </p>
            <div className="detail-price">
              {service.previousPrice && (
                <del>{formatPrice(service.previousPrice)}</del>
              )}
              {service.price > 0 ? formatPrice(service.price) : "Sur devis"}
              {service.wholesalePrices?.map((tier) => (
                <small key={tier.minQuantity}>
                  {wholesaleQuantityLabel(tier)}:{" "}
                  {formatPrice(tier.unitPrice)}
                </small>
              ))}
            </div>
            {service.specs && Object.entries(service.specs).length > 0 && (
              <div className="technical-sheet">
                <h2>Caractéristiques et contenu</h2>
                {Object.entries(service.specs).map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}
            <div className="notice-box">
              <strong>Public concerné</strong>
              <p>
                Ce pack est destiné aux particuliers et aux organisations. Le
                contenu exact, le délai et le tarif sont validés avec l’équipe
                avant tout engagement.
              </p>
            </div>
          </div>
          <form className="quote-card" onSubmit={submit}>
            <span className="eyebrow">Demande de devis</span>
            <h2>
              {sent ? "Demande enregistrée" : "Parlez-nous de votre projet"}
            </h2>
            {sent ? (
              <div className="success-state">
                <Icon name="check" size={30} />
                <p>
                  Votre demande a bien été enregistrée sous la référence{" "}
                  <strong>{sent.reference}</strong>. Un conseiller vous
                  recontactera. Aucun paiement n’est demandé à cette étape.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSent(null)}
                >
                  Nouvelle demande
                </button>
              </div>
            ) : (
              <>
                {error && <div className="alert error">{error}</div>}
                <label>
                  Nom complet
                  <input
                    required
                    name="name"
                    placeholder="Votre nom"
                    minLength={2}
                    maxLength={120}
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
                  />
                </label>
                <label>
                  Email facultatif
                  <input
                    type="email"
                    name="email"
                    placeholder="nom@exemple.com"
                  />
                </label>
                <label>
                  Votre besoin
                  <textarea
                    rows={5}
                    required
                    name="message"
                    minLength={10}
                    maxLength={4000}
                    placeholder="Décrivez votre projet, vos délais et votre contexte…"
                  />
                </label>
                <button
                  className="primary wide"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Envoi…" : "Envoyer ma demande"}{" "}
                  <Icon name="arrow" />
                </button>
                <small className="quote-note">
                  Les informations sont transmises à l’équipe Allo Togo pour
                  traitement.
                </small>
              </>
            )}
          </form>
        </div>
      </section>
    </main>
  )
}
