import { useCallback, useEffect, useMemo, useState, MouseEvent } from "react"
import { Icon } from "../components/Icon"
import { jsPDF } from "jspdf"
import { ChatComposer, ChatMessageList } from "../components/Chat"
import {
  PageHero,
  LoadingState,
  ErrorState,
  OrderProgress,
  StatusBadge,
} from "../components/ui"
import { api, errorMessage } from "../lib/api"
import { formatDate, formatPrice } from "../lib/format"
import { fulfillmentLabels } from "../lib/labels"
import { trackEvent } from "../lib/analytics"
import type {
  ChatMessagePayload,
  PublicTracking,
  TrackingMessage,
  TrackingPaymentChoice,
} from "../types"

const storageKey = (code: string) => `allo.tracking.${code.toUpperCase()}`

const readToken = (code: string): string | null => {
  try {
    const raw = window.sessionStorage.getItem(storageKey(code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string }
    if (!parsed.token) return null
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now())
      return null
    return parsed.token
  } catch {
    return null
  }
}

export function TrackingPage({
  code,
  navigate,
}: {
  code?: string
  navigate: (path: string) => void
}) {
  const [input, setInput] = useState(code ?? "")
  const [tracking, setTracking] = useState<PublicTracking | null>(null)
  const [loading, setLoading] = useState(Boolean(code))
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(() =>
    code ? readToken(code) : null,
  )
  const [messages, setMessages] = useState<TrackingMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [paymentChoice, setPaymentChoice] =
    useState<TrackingPaymentChoice["choice"] | "">("")
  const [paymentPhone, setPaymentPhone] = useState("")
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const normalizedCode = useMemo(
    () => (code ? code.trim().toUpperCase() : ""),
    [code],
  )

  const loadTracking = useCallback(async () => {
    if (!normalizedCode) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.tracking.get(normalizedCode)
      setTracking(data)
      setPaymentChoice(data.customerPaymentChoice ?? "")
      trackEvent("tracking_viewed", {
        categoryType: data.categoryType,
        status: data.status,
        fulfillmentMode: data.fulfillmentMode,
      })
      setToken(readToken(normalizedCode))
    } catch (err) {
      setError(errorMessage(err))
      setTracking(null)
    } finally {
      setLoading(false)
    }
  }, [normalizedCode])

  useEffect(() => {
    if (!normalizedCode) {
      setTracking(null)
      setError(null)
      setLoading(false)
      return
    }
    void loadTracking()
  }, [normalizedCode, loadTracking])

  useEffect(() => {
    if (!normalizedCode || !token) {
      setMessages([])
      return
    }
    let cancelled = false
    setMessagesLoading(true)
    setMessagesError(null)
    api.tracking
      .messages(normalizedCode, token)
      .then((data) => {
        if (!cancelled) setMessages(data.messages)
      })
      .catch((err) => {
        if (!cancelled) {
          const message = errorMessage(err)
          setMessagesError(message)
          if (
            message.toLowerCase().includes("expiré") ||
            message.toLowerCase().includes("invalide")
          ) {
            window.sessionStorage.removeItem(storageKey(normalizedCode))
            setToken(null)
          }
        }
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [normalizedCode, token])

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault()
    const cleaned = input.trim().toUpperCase()
    if (!/^[A-HJ-NP-Z2-9]{6,20}$/.test(cleaned)) {
      setError(
        "Le code de suivi doit contenir entre 6 et 20 caractères (lettres et chiffres).",
      )
      return
    }
    navigate(`/suivi/${cleaned}`)
  }

  const verifyPhone = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!normalizedCode) return
    setVerifying(true)
    setAccessError(null)
    try {
      const access = await api.tracking.access(normalizedCode, phone.trim())
      window.sessionStorage.setItem(
        storageKey(normalizedCode),
        JSON.stringify({ token: access.token, expiresAt: access.expiresAt }),
      )
      setToken(access.token)
      setPhone("")
    } catch (err) {
      setAccessError(errorMessage(err))
    } finally {
      setVerifying(false)
    }
  }

  const sendMessage = async (payload: ChatMessagePayload) => {
    if (!normalizedCode || !token)
      throw new Error(
        "Conversation verrouillée. Vérifiez à nouveau votre numéro.",
      )
    setMessagesError(null)
    try {
      const created = await api.tracking.send(normalizedCode, token, payload)
      setMessages((current) => [...current, created])
    } catch (err) {
      const message = errorMessage(err)
      setMessagesError(message)
      throw new Error(message)
    }
  }

  const savePaymentChoice = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!normalizedCode || !token || !paymentChoice) return
    setPaymentSaving(true)
    setPaymentError(null)
    try {
      const payload: TrackingPaymentChoice =
        paymentChoice === "ESPECES"
          ? { choice: paymentChoice }
          : { choice: paymentChoice }
      await api.tracking.paymentChoice(normalizedCode, token, payload)
      setPaymentPhone("")
      await loadTracking()
    } catch (err) {
      setPaymentError(errorMessage(err))
    } finally {
      setPaymentSaving(false)
    }
  }

  const forgetAccess = () => {
    if (!normalizedCode) return
    window.sessionStorage.removeItem(storageKey(normalizedCode))
    setToken(null)
    setMessages([])
  }

  if (!normalizedCode) {
    return (
      <main>
        <PageHero
          eyebrow="Suivi public"
          title="Suivre ma commande"
          text="Saisissez le code de suivi reçu lors de la création de votre commande. Le suivi public ne révèle ni vos notes internes ni vos informations de paiement."
          image="/images/banners/suivi.webp"
          imageAlt="Remise d’un colis Allo Togo"
          badge={
            <>
              <Icon name="tracker" size={14} /> Suivi de commande
            </>
          }
        />
        <section className="section tracking-page">
          <div className="shell tracking-lookup">
            <form className="tracking-form" onSubmit={submitCode}>
              <span className="eyebrow">Code de suivi</span>
              <h2>Où en est ma commande ?</h2>
              <p>
                Le code comporte 12 caractères. Il vous a été communiqué à
                l’enregistrement de la commande.
              </p>
              {error && <div className="alert error">{error}</div>}
              <label>
                Code de suivi
                <input
                  value={input}
                  onChange={(event) =>
                    setInput(event.target.value.toUpperCase())
                  }
                  placeholder="Ex. D8F7UBM6ZZ36"
                  autoCapitalize="characters"
                  maxLength={20}
                />
              </label>
              <button className="primary wide" type="submit">
                Consulter le suivi <Icon name="arrow" />
              </button>
            </form>
            <div className="tracking-help">
              <h3>Besoin d’aide ?</h3>
              <p>
                Si vous avez perdu votre code, contactez l’équipe Allo Togo avec
                le numéro de téléphone utilisé lors de la commande. La
                messagerie privée est protégée par ce même numéro.
              </p>
              <button
                className="secondary"
                onClick={() => navigate("/contact")}
              >
                Contacter Allo Togo
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="section">
        <div className="shell">
          <LoadingState label="Recherche de la commande…" />
        </div>
      </main>
    )
  }

  if (error || !tracking) {
    return (
      <main>
        <PageHero
          eyebrow="Suivi public"
          title="Commande introuvable"
          text="Vérifiez le code de suivi et réessayez."
          image="/images/banners/suivi.webp"
          imageAlt="Remise d’un colis Allo Togo"
          badge={
            <>
              <Icon name="tracker" size={14} /> Suivi de commande
            </>
          }
        />
        <section className="section tracking-page">
          <div className="shell tracking-lookup">
            <ErrorState
              message={error || "Code de suivi introuvable."}
              onRetry={() => void loadTracking()}
            />
            <button className="secondary" onClick={() => navigate("/suivi")}>
              Saisir un autre code
            </button>
          </div>
        </section>
      </main>
    )
  }

  function downloadPDF(event: MouseEvent<HTMLButtonElement>): void {
    if (!tracking) return

    const doc = new jsPDF()

    // Header
    doc.setFontSize(18)
    doc.setTextColor(30, 60, 110)
    doc.text("Allo Togo - Suivi de commande", 14, 20)

    // Order number
    doc.setFontSize(14)
    doc.setTextColor(60, 60, 60)
    doc.text(`Référence: ${tracking.orderNumber}`, 14, 35)

    // Tracking code
    doc.text(`Code de suivi: ${tracking.trackingCode}`, 14, 48)

    // Status
    doc.text(`Statut: ${tracking.status}`, 14, 61)

    // Fulfillment mode
    const fulfillmentLabel =
      fulfillmentLabels[tracking.fulfillmentMode] || tracking.fulfillmentMode
    doc.text(`Mode: ${fulfillmentLabel}`, 14, 74)

    // Items
    let y = 87
    doc.setFontSize(11)
    tracking.items.forEach((item, index) => {
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(
        `${item.productName} × ${item.quantity} - ${formatPrice(item.lineTotal)}`,
        14,
        y,
      )
      y += 10
    })

    // Total
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text(
      `Total: ${formatPrice(tracking.total)}`,
      14,
      y + 5,
    )

    // Timeline
    y = y + 15
    doc.setFontSize(11)
    doc.setFont("helvetica", "normal")
    tracking.timeline.forEach((entry, index) => {
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(
        `${formatDate(entry.createdAt)} - ${entry.statusLabel}`,
        14,
        y,
      )
      y += 8
    })

    // Download
    doc.save(`allotogo-${tracking.trackingCode}.pdf`)
  }

  return (
    <main>
      <section className="tracking-hero">
        <img
          className="tracking-hero-bg"
          src="/images/banners/suivi.webp"
          alt=""
          aria-hidden="true"
        />
        <div className="shell">
          <button className="back-link" onClick={() => navigate("/suivi")}>
            <Icon name="arrow" /> Nouveau code de suivi
          </button>
          <div className="tracking-hero-grid">
            <div>
              <span className="eyebrow">
                Commande {tracking.categoryType === "GPS" ? "GPS" : "boissons"}
              </span>
              <h1>{tracking.orderNumber}</h1>
              <p className="tracking-ref">
                Référence de groupe : <strong>{tracking.groupRef}</strong>
              </p>
              <div className="tracking-badges">
                <StatusBadge
                  status={tracking.status}
                  fulfillmentMode={tracking.fulfillmentMode}
                />
                <span className="status neutral">
                  {fulfillmentLabels[tracking.fulfillmentMode]}
                </span>
              </div>
              <OrderProgress
                status={tracking.status}
                fulfillmentMode={tracking.fulfillmentMode}
                reachedStatuses={tracking.timeline.map((entry) => entry.status)}
              />
            </div>
            <div className="tracking-code-card">
              <span>Code de suivi</span>
              <strong>{tracking.trackingCode}</strong>
              <small>Conservez ce code pour revenir à tout moment.</small>
              <button
                className="download-pdf-btn"
                onClick={downloadPDF}
                title="Télécharger le PDF"
              >
                <Icon name="download" size={14} /> PDF
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section tracking-page">
        <div className="shell tracking-layout">
          <div className="tracking-main">
            {tracking.fulfillmentMode === "LIVRAISON" &&
              tracking.status === "COMMANDE_EN_COURS_DE_LIVRAISON" && (
                <div className="tracking-card-panel">
                  <div className="tracking-payment">
                    <h2>Choisir mon mode de paiement</h2>
                    {tracking.paymentStatus === "PAYE" ? (
                      <p className="tracking-muted">
                        Le paiement est enregistré comme réglé. Si vous avez
                        choisi le paiement mobile, sa validation repose
                        actuellement sur votre déclaration.
                      </p>
                    ) : !token ? (
                      <form
                        className="tracking-access-form"
                        onSubmit={verifyPhone}
                      >
                        <p>
                          Vérifiez le numéro de téléphone utilisé lors de la
                          commande pour choisir votre mode de paiement.
                        </p>
                        {accessError && (
                          <div className="alert error">{accessError}</div>
                        )}
                        <label>
                          Numéro de téléphone
                          <input
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            placeholder="+228 •• •• •• ••"
                            inputMode="tel"
                            autoComplete="tel"
                            required
                          />
                        </label>
                        <button
                          className="secondary"
                          type="submit"
                          disabled={verifying}
                        >
                          {verifying ? "Vérification…" : "Vérifier mon numéro"}
                        </button>
                      </form>
                    ) : tracking.customerPaymentChoice ? (
                      <div className="payment-waiting">
                        <div className="spinner" aria-hidden="true" />
                        <p>
                          {tracking.customerPaymentChoice === "ESPECES"
                            ? "Votre choix espèces a été enregistré. Le chef d’équipe doit confirmer la remise sur place pour finaliser la livraison. Veuillez patienter…"
                            : `Votre paiement ${
                                tracking.customerPaymentChoice === "FLOOZ"
                                  ? "Flooz"
                                  : "Mixx by Yas"
                              } a été déclaré. Envoyez la capture dans la messagerie ci-dessous. Le chef d’équipe validera la livraison après vérification. Veuillez patienter…`}
                        </p>
                        <small>
                          Choisi le{" "}
                          {formatDate(tracking.customerPaymentChoiceAt)}
                        </small>
                      </div>
                    ) : (
                      <form
                        className="tracking-access-form"
                        onSubmit={savePaymentChoice}
                      >
                        {paymentError && (
                          <div className="alert error">{paymentError}</div>
                        )}
                        {tracking.customerPaymentChoice === "ESPECES" &&
                          paymentChoice === "ESPECES" && (
                            <p className="tracking-muted">
                              Votre choix espèces a été enregistré le{" "}
                              {formatDate(tracking.customerPaymentChoiceAt)}.
                            </p>
                          )}
                        <label className="choice">
                          <input
                            type="radio"
                            name="customerPaymentChoice"
                            value="ESPECES"
                            checked={paymentChoice === "ESPECES"}
                            onChange={() => setPaymentChoice("ESPECES")}
                          />
                          <span>
                            <strong>Espèces à la livraison</strong>
                            <small>
                              Le chef d’équipe confirme la remise sur place; le
                              commercial ou le directeur enregistre les espèces
                              au retour de l’équipe.
                            </small>
                          </span>
                        </label>
                        <label className="choice">
                          <input
                            type="radio"
                            name="customerPaymentChoice"
                            value="FLOOZ"
                            checked={paymentChoice === "FLOOZ"}
                            onChange={() => setPaymentChoice("FLOOZ")}
                          />
                          <span>
                            <img
                              src="/images/flooz.png"
                              alt="Flooz"
                              className="payment-logo"
                            />
                            <strong>Flooz</strong>
                            <small>
                              Numéro à 8 chiffres commençant par 78, 79, 96, 97,
                              98 ou 99.
                            </small>
                          </span>
                        </label>
                        <label className="choice">
                          <input
                            type="radio"
                            name="customerPaymentChoice"
                            value="MIXX_BY_YAS"
                            checked={paymentChoice === "MIXX_BY_YAS"}
                            onChange={() => setPaymentChoice("MIXX_BY_YAS")}
                          />
                          <span>
                            <img
                              src="/images/yas.jpeg"
                              alt="Mixx by Yas"
                              className="payment-logo"
                            />
                            <strong>Mixx by Yas</strong>
                            <small>
                              Numéro à 8 chiffres commençant par 70, 71, 72, 90,
                              91, 92 ou 93.
                            </small>
                          </span>
                        </label>
                        {(paymentChoice === "FLOOZ" ||
                          paymentChoice === "MIXX_BY_YAS") && (
                          <p className="payment-hint">
                            Effectuez le paiement mobile, puis envoyez la
                            capture dans la messagerie privée ci-dessous. Le
                            chef d’équipe confirmera la livraison après
                            vérification.
                          </p>
                        )}
                        {paymentChoice !== "ESPECES" &&
                          paymentChoice !== "" && (
                            <p className="tracking-muted">
                              Pour le moment, la confirmation du paiement mobile
                              repose sur votre déclaration; aucune vérification
                              automatique auprès de l’opérateur n’est
                              disponible.
                            </p>
                          )}
                        <button
                          className="primary small"
                          type="submit"
                          disabled={
                            paymentSaving ||
                            !paymentChoice ||
                            (paymentChoice === "ESPECES" &&
                              tracking.customerPaymentChoice === "ESPECES")
                          }
                        >
                          {paymentSaving
                            ? "Enregistrement…"
                            : paymentChoice === "ESPECES"
                              ? "Choisir les espèces à la livraison"
                              : "Déclarer le paiement mobile effectué"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}

            <div className="tracking-card-panel">
              <h2>Avancement</h2>
              <ol className="timeline">
                {tracking.timeline.length === 0 ? (
                  <li className="timeline-empty">
                    Aucun événement public pour le moment.
                  </li>
                ) : (
                  tracking.timeline.map((entry, index) => (
                    <li key={`${entry.status}-${entry.createdAt}-${index}`}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>{entry.statusLabel}</strong>
                        {entry.comment && <p>{entry.comment}</p>}
                        <small>{formatDate(entry.createdAt)}</small>
                      </div>
                    </li>
                  ))
                )}
              </ol>
            </div>

            <div className="tracking-card-panel">
              <h2>Articles</h2>
              <ul className="tracking-items">
                {tracking.items.map((item, index) => (
                  <li key={`${item.productName}-${index}`}>
                    <span>
                      {item.productName} × {item.quantity}
                    </span>
                    <strong>{formatPrice(item.lineTotal)}</strong>
                  </li>
                ))}
              </ul>
              <div className="tracking-total">
                <span>Total de la commande</span>
                <strong>{formatPrice(tracking.total)}</strong>
              </div>
              <p className="tracking-muted">
                Le détail des paiements n’est pas exposé publiquement. Le
                règlement est enregistré à la livraison, au retrait ou en
                agence, avant la validation finale.
              </p>
            </div>

            {tracking.otherOrders.length > 0 && (
              <div className="tracking-card-panel">
                <h2>Autres commandes du groupe</h2>
                <p className="tracking-muted">
                  Les articles GPS et boissons sont traités comme des commandes
                  indépendantes. Chacune possède son propre suivi.
                </p>
                <ul className="tracking-siblings">
                  {tracking.otherOrders.map((sibling) => (
                    <li key={sibling.orderNumber}>
                      <span>
                        {sibling.orderNumber} ·{" "}
                        {sibling.categoryType === "GPS" ? "GPS" : "Boissons"}
                      </span>
                      <StatusBadge status={sibling.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="tracking-card-panel">
              <div className="panel-heading">
                <div>
                  <h2>Conversation privée</h2>
                  <p className="tracking-muted">{tracking.access.message}</p>
                </div>
                {token && (
                  <button className="text-link" onClick={forgetAccess}>
                    Verrouiller
                  </button>
                )}
              </div>

              {!token ? (
                <form className="tracking-access-form" onSubmit={verifyPhone}>
                  <p>
                    Vérifiez le numéro de téléphone utilisé lors de la commande
                    pour ouvrir la messagerie.
                  </p>
                  {accessError && (
                    <div className="alert error">{accessError}</div>
                  )}
                  <label>
                    Numéro de téléphone
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+228 •• •• •• ••"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                    />
                  </label>
                  <button
                    className="secondary"
                    type="submit"
                    disabled={verifying}
                  >
                    {verifying ? "Vérification…" : "Ouvrir la conversation"}
                  </button>
                </form>
              ) : (
                <div className="tracking-chat">
                  {messagesLoading ? (
                    <LoadingState label="Chargement de la conversation…" />
                  ) : messagesError ? (
                    <div className="alert error">{messagesError}</div>
                  ) : (
                    <div className="tracking-thread wa-thread">
                      <ChatMessageList
                        messages={messages}
                        me="CLIENT"
                        emptyLabel="Aucun message pour le moment. Écrivez à l’équipe Allo Togo."
                      />
                    </div>
                  )}
                  <ChatComposer
                    onSend={sendMessage}
                    placeholder="Écrivez à l’équipe Allo Togo…"
                  />
                </div>
              )}
            </div>
          </div>

          <aside className="tracking-side">
            <div className="tracking-side-card">
              <h3>Informations</h3>
              <div>
                <span>Créée le</span>
                <strong>{formatDate(tracking.createdAt)}</strong>
              </div>
              <div>
                <span>Dernière mise à jour</span>
                <strong>{formatDate(tracking.updatedAt)}</strong>
              </div>
              <div>
                <span>Réception</span>
                <strong>{fulfillmentLabels[tracking.fulfillmentMode]}</strong>
              </div>
              {tracking.requiresTechnician && (
                <div>
                  <span>Installation</span>
                  <strong>Technicien requis</strong>
                </div>
              )}
            </div>
            <div className="tracking-side-card">
              <h3>Une question ?</h3>
              <p>
                La conversation ci-contre est privée. Vous pouvez aussi
                consulter la page contact pour joindre l’équipe.
              </p>
              <button
                className="secondary"
                onClick={() => navigate("/contact")}
              >
                Page contact
              </button>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
