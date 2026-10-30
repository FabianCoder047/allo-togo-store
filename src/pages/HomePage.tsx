import { useState, type FormEvent } from "react"
import { Icon } from "../components/Icon"
import { ProductCard } from "../components/ProductCard"
import { Alert, SectionTitle, LoadingState, ErrorState } from "../components/ui"
import { useStore } from "../context/StoreContext"
import { api, errorMessage } from "../lib/api"
import { trackEvent } from "../lib/analytics"

export function HomePage({
  navigate,
  scrollTo,
  onAdvisor,
}: {
  navigate: (path: string) => void
  scrollTo: (id: string) => void
  onAdvisor: () => void
}) {
  const {
    products,
    services,
    loadingCatalog,
    catalogError,
    reloadCatalog,
    addToCart,
    notify,
  } = useStore()
  const gps = products.filter((product) => product.type === "GPS").slice(0, 4)
  const visibleServices = services.slice(0, 4)
  const [sent, setSent] = useState<{ reference: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [contactError, setContactError] = useState<string | null>(null)

  const add = (id: string, name: string) => {
    addToCart(id)
    notify(`${name} ajouté au panier.`, "success")
  }

  const submitContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const need = String(form.get("need") ?? "").trim()
    const details = String(form.get("message") ?? "").trim()
    setSubmitting(true)
    setContactError(null)
    try {
      const quote = await api.quotes.create({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? "") || null,
        message: need ? `Besoin : ${need}\n\n${details}` : details,
      })
      setSent({ reference: quote.reference })
      trackEvent("quote_requested", { source: "home" })
    } catch (err) {
      setContactError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <section className="hero" id="accueil">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <div className="hero-label">
              <span></span> Solutions GPS pour particuliers & professionnels
            </div>
            <h1>
              Gardez le contrôle de vos véhicules, <em>où que vous soyez.</em>
            </h1>
            <p>
              Découvrez les solutions de géolocalisation Allo Togo et choisissez
              le traceur adapté à vos besoins.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => scrollTo("traceurs")}>
                Découvrir nos traceurs <Icon name="arrow" />
              </button>
              <button className="secondary" onClick={() => scrollTo("contact")}>
                Demander une démonstration
              </button>
            </div>
            <div className="hero-assurance">
              <div>
                <Icon name="check" />
                <span>
                  <strong>Conseil personnalisé</strong>
                  <small>Selon votre besoin</small>
                </span>
              </div>
              <div>
                <Icon name="headset" />
                <span>
                  <strong>Accompagnement</strong>
                  <small>Avant et après commande</small>
                </span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="https://images.unsplash.com/photo-1619741982598-7cb8a7959476?auto=format&fit=crop&w=1300&q=90"
              alt="Smartphone avec navigation GPS dans un véhicule moderne"
            />
            <div className="tracking-card">
              <span className="live-dot"></span>
              <div>
                <small>Véhicule suivi</small>
                <strong>Position disponible</strong>
              </div>
              <Icon name="map" />
            </div>
            <div className="device-card">
              <div className="device">
                <span></span>
                <b>GPS</b>
              </div>
              <div>
                <small>Solution compacte</small>
                <strong>Installation adaptée</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="benefits">
        <div className="shell benefits-grid">
          {[
            [
              "tracker",
              "Localisation du véhicule",
              "Consultez la position selon les capacités du modèle choisi.",
            ],
            [
              "shield",
              "Protection & alertes",
              "Des options à confirmer en fonction de chaque appareil.",
            ],
            [
              "fleet",
              "Suivi pour professionnels",
              "Des solutions pour taxis, activités mobiles et flottes.",
            ],
            [
              "headset",
              "Conseil & installation",
              "Nous vous guidons vers la configuration adaptée.",
            ],
          ].map(([icon, title, text]) => (
            <article className="benefit" key={title}>
              <div className="icon-box">
                <Icon name={icon as "map"} />
              </div>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section products-section" id="traceurs">
        <div className="shell">
          <div className="section-top">
            <SectionTitle
              eyebrow="Notre sélection"
              title="Les traceurs GPS Allo Togo"
              text="Des solutions pour mieux suivre vos véhicules. Les prix et caractéristiques seront confirmés selon le modèle."
            />
            <button className="text-link" onClick={() => navigate("/traceurs")}>
              Voir tous les traceurs <Icon name="arrow" />
            </button>
          </div>
          {loadingCatalog ? (
            <LoadingState label="Chargement du catalogue…" />
          ) : catalogError ? (
            <ErrorState
              message={catalogError}
              onRetry={() => void reloadCatalog()}
            />
          ) : (
            <div className="product-grid">
              {gps.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  badge={index === 0 ? "Le plus demandé" : undefined}
                  onAdd={() => add(product.id, product.name)}
                  onView={() => navigate(`/produit/${product.id}`)}
                />
              ))}
            </div>
          )}
          <p className="demo-note">
            Catalogue connecté à l’API Allo Togo — disponibilités et tarifs à
            confirmer avant la livraison.
          </p>
        </div>
      </section>

      <section className="section how">
        <div className="shell">
          <SectionTitle
            eyebrow="Simple et accompagné"
            title="Comment ça marche ?"
            center
          />
          <div className="steps">
            {[
              [
                "01",
                "Choisissez votre traceur",
                "Comparez les usages et identifiez la solution adaptée à votre véhicule.",
              ],
              [
                "02",
                "Passez votre commande",
                "Validez avec un conseiller les modalités de livraison ou d’installation.",
              ],
              [
                "03",
                "Prenez le contrôle",
                "Découvrez l’utilisation et le mode de suivi propres au modèle retenu.",
              ],
            ].map(([num, title, text], i) => (
              <article className="step" key={num}>
                <div className="step-number">{num}</div>
                {i < 2 && <span className="step-line"></span>}
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section use-cases">
        <div className="shell use-grid">
          <div className="use-copy">
            <SectionTitle
              eyebrow="Pour chaque mobilité"
              title="Un traceur pour votre quotidien"
              text="Particulier, chauffeur ou entreprise : commencez par votre usage, nous vous aidons à préciser le besoin."
            />
            <button className="primary" onClick={onAdvisor}>
              Être conseillé <Icon name="arrow" />
            </button>
          </div>
          <div className="use-list">
            {[
              [
                "car",
                "Voitures personnelles",
                "Garder un œil sur votre véhicule",
              ],
              ["motorbike", "Motos", "Une solution pensée pour les deux-roues"],
              [
                "user",
                "Taxis & professionnels",
                "Suivre les véhicules de votre activité",
              ],
              [
                "building",
                "Entreprises & flottes",
                "Centraliser le suivi de plusieurs véhicules",
              ],
            ].map(([icon, title, text]) => (
              <article key={title}>
                <div className="use-icon">
                  <Icon name={icon as "car"} />
                </div>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
                <Icon name="chevron" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section drinks" id="boissons">
        <div className="shell drinks-grid">
          <div className="drinks-image vitalo-image">
            <img
              src="/images/products/vitalo.webp"
              alt="Canette Vitalo Ananas 33 cl"
            />
            <div className="drinks-stamp">
              Vitalo
              <br />
              <strong>Ananas</strong>
            </div>
          </div>
          <div className="drinks-copy">
            <SectionTitle
              eyebrow="La boisson phare Allo Togo"
              title="Vitalo, le goût vrai de l’ananas"
              text="Vitalo est la boisson naturelle signée Allo Togo : une recette à l’ananas, un format de 33 cl et une fraîcheur pensée pour vos moments du quotidien comme pour vos événements."
            />
            <div className="drink-tags">
              <span>
                <Icon name="can" size={14} /> Vitalo Ananas
              </span>
              <span>33 cl</span>
              <span>Boisson naturelle</span>
            </div>
            <button className="secondary" onClick={() => navigate("/boissons")}>
              Commander Vitalo <Icon name="arrow" />
            </button>
          </div>
        </div>
      </section>

      <section className="section services" id="services">
        <div className="shell">
          <div className="section-top">
            <SectionTitle
              eyebrow="Bien plus qu’une boutique"
              title="Nos services en packs"
              text="Des expertises organisées pour répondre clairement aux besoins des particuliers et des entreprises."
            />
            <button className="text-link" onClick={() => navigate("/services")}>
              Tous nos services <Icon name="arrow" />
            </button>
          </div>
          <div className="service-grid">
            {visibleServices.map((service, index) => (
              <article
                className={`service-card ${["orange", "blue", "green", "yellow"][index % 4]}`}
                key={service.id}
              >
                <div className="service-icon">
                  <Icon
                    name={
                      ["spark", "headset", "building", "truck"][
                        index % 4
                      ] as "spark"
                    }
                    size={26}
                  />
                </div>
                <h3>{service.name}</h3>
                <p>{service.shortDescription || service.description || ""}</p>
                <button onClick={() => navigate(`/service/${service.id}`)}>
                  Découvrir <Icon name="arrow" size={17} />
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="trust" id="pourquoi">
        <div className="shell trust-grid">
          <div>
            <span className="eyebrow light">L’engagement Allo Togo</span>
            <h2>Une commande claire, un accompagnement humain.</h2>
          </div>
          <div className="trust-points">
            {[
              [
                "check",
                "Informations claires",
                "Nous confirmons les caractéristiques, le prix et les conditions avant la commande.",
              ],
              [
                "headset",
                "Conseil disponible",
                "Un interlocuteur vous accompagne pour choisir la solution adaptée.",
              ],
              [
                "clock",
                "Modalités confirmées",
                "Livraison, installation et délais sont précisés selon votre commande.",
              ],
            ].map(([icon, title, text]) => (
              <article key={title}>
                <Icon name={icon as "check"} />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section contact" id="contact">
        <div className="shell contact-card">
          <div className="contact-copy">
            <span className="eyebrow">Besoin d’un conseil ?</span>
            <h2>Parlons de votre véhicule ou de votre projet.</h2>
            <p>
              Décrivez votre besoin. L’équipe Allo Togo vous orientera vers le
              traceur ou le pack de services approprié.
            </p>
            <div className="contact-links">
              <a
                href="https://www.allotogoconciergerietech-ia.com/"
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="map" /> Site officiel Allo Togo
              </a>
              <span>
                <Icon name="building" /> Lomé, Togo
              </span>
            </div>
          </div>
          {sent ? (
            <div className="contact-form">
              <div className="success-state">
                <Icon name="check" size={30} />
                <h3>Demande enregistrée</h3>
                <p>
                  Votre demande a bien été transmise sous la référence{" "}
                  <strong>{sent.reference}</strong>. Un conseiller vous
                  recontactera.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSent(null)}
                >
                  Nouvelle demande
                </button>
              </div>
            </div>
          ) : (
            <form className="contact-form" onSubmit={submitContact}>
              {contactError && <Alert tone="error">{contactError}</Alert>}
              <div className="form-row">
                <label>
                  Votre nom
                  <input
                    required
                    name="name"
                    placeholder="Ex. Ama Mensah"
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
                    inputMode="tel"
                  />
                </label>
              </div>
              <label>
                Email facultatif
                <input
                  type="email"
                  name="email"
                  placeholder="nom@exemple.com"
                  maxLength={160}
                />
              </label>
              <label>
                Votre besoin
                <select name="need" defaultValue="" required>
                  <option value="" disabled>
                    Choisir une demande
                  </option>
                  <option value="Choisir un traceur GPS">
                    Choisir un traceur GPS
                  </option>
                  <option value="Demander une démonstration">
                    Demander une démonstration
                  </option>
                  <option value="Demander un devis service">
                    Demander un devis service
                  </option>
                  <option value="Commander des boissons">
                    Commander des boissons
                  </option>
                </select>
              </label>
              <label>
                Votre message
                <textarea
                  required
                  name="message"
                  minLength={10}
                  maxLength={3900}
                  placeholder="Précisez votre véhicule, le nombre d’unités ou votre projet…"
                  rows={3}
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
              <small>
                En envoyant ce formulaire, vous acceptez d’être recontacté au
                sujet de votre demande.
              </small>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
