import { useState } from "react"
import { Icon } from "../components/Icon"
import { PageHero, SectionTitle } from "../components/ui"
import { api, errorMessage } from "../lib/api"
import { trackEvent } from "../lib/analytics"

export function InfoPage({ type }: { type: "about" | "contact" }) {
  if (type === "about") {
    return (
      <main>
        <PageHero
          eyebrow="L’entreprise"
          title="Allo Togo Conciergerie Tech-IA"
          text="Une approche multiservices réunissant technologie, accompagnement et solutions professionnelles."
          image="/images/banners/a-propos.webp"
          imageAlt="Espace de travail moderne et collaboratif"
          badge={
            <>
              <Icon name="building" size={14} /> Notre entreprise
            </>
          }
        />
        <section className="section info-page">
          <div className="shell info-grid">
            <div>
              <SectionTitle
                eyebrow="Notre approche"
                title="Un partenaire unique pour des besoins variés"
                text="Allo Togo organise ses offres autour de solutions concrètes et d’un accompagnement humain. La boutique met en priorité les traceurs GPS tout en donnant accès aux autres expertises."
              />
            </div>
            <div className="info-panel">
              <h3>Nos engagements</h3>
              <p>
                <Icon name="check" /> Informations validées avant commande
              </p>
              <p>
                <Icon name="check" /> Conseil adapté à votre situation
              </p>
              <p>
                <Icon name="check" /> Conditions expliquées clairement
              </p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return <ContactPage />
}

function ContactPage() {
  const [sent, setSent] = useState<{ reference: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        message: String(form.get("message") ?? ""),
      })
      setSent({ reference: quote.reference })
      trackEvent("quote_requested", { source: "contact" })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <PageHero
        eyebrow="Nous joindre"
        title="Contactez Allo Togo"
        text="Notre équipe vous accompagne pour les traceurs, boissons et prestations sur mesure."
        image="/images/banners/contact.webp"
        imageAlt="Poignée de main entre un conseiller et un client"
        badge={
          <>
            <Icon name="headset" size={14} /> Écoute & accompagnement
          </>
        }
      />
      <section className="section info-page">
        <div className="shell contact-card">
          <div className="contact-copy">
            <span className="eyebrow">Disponibilité</span>
            <h2>Parlons de votre besoin</h2>
            <p>
              Utilisez ce formulaire pour préparer une demande. Un conseiller
              vous recontactera pour préciser votre projet. Aucun paiement n’est
              demandé à cette étape.
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
          <form className="contact-form" onSubmit={submit}>
            {sent ? (
              <div className="success-state">
                <Icon name="check" size={30} />
                <h2>Demande enregistrée</h2>
                <p>
                  Votre demande a bien été enregistrée sous la référence{" "}
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
            ) : (
              <>
                {error && <div className="alert error">{error}</div>}
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
                  />
                </label>
                <label>
                  Votre message
                  <textarea
                    required
                    name="message"
                    minLength={10}
                    maxLength={4000}
                    placeholder="Précisez votre véhicule, le nombre d’unités ou votre projet…"
                    rows={4}
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
              </>
            )}
          </form>
        </div>
      </section>
    </main>
  )
}
