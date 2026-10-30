import { useEffect, useState } from "react"
import { Icon } from "../components/Icon"
import { formatPrice } from "../lib/format"
import type { OrderGroupCreated } from "../types"

export function ConfirmationPage({
  navigate,
}: {
  navigate: (path: string) => void
}) {
  const [order, setOrder] = useState<OrderGroupCreated | null>(null)

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("allo.lastOrder")
      if (raw) setOrder(JSON.parse(raw) as OrderGroupCreated)
    } catch {
      setOrder(null)
    }
  }, [])

  if (!order) {
    return (
      <main className="confirmation-page">
        <div className="confirmation-card">
          <div className="success-icon">
            <Icon name="check" size={38} />
          </div>
          <span className="eyebrow">Suivi de commande</span>
          <h1>Retrouvez votre commande.</h1>
          <p>
            Aucune commande récente n’est disponible dans cette session.
            Utilisez votre code de suivi pour consulter l’avancement de votre
            commande.
          </p>
          <div className="confirmation-actions">
            <button className="primary" onClick={() => navigate("/suivi")}>
              Suivre une commande <Icon name="arrow" />
            </button>
            <button className="secondary" onClick={() => navigate("/")}>
              Retour à l’accueil
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="confirmation-page">
      <div className="confirmation-card confirmation-wide">
        <div className="success-icon">
          <Icon name="check" size={38} />
        </div>
        <span className="eyebrow">Commande enregistrée</span>
        <h1>Merci, {order.customer.name.split(" ")[0]}.</h1>
        <p>
          Votre demande a bien été enregistrée sous la référence{" "}
          <strong>{order.groupRef}</strong>. Un conseiller va vous contacter
          pour confirmer les détails. Aucun paiement n’a été effectué en ligne.
        </p>

        {order.orders.length > 1 && (
          <div className="alert info">
            Votre panier a été séparé en{" "}
            <strong>{order.orders.length} commandes indépendantes</strong> (GPS
            et boissons). Chaque commande possède son propre code de suivi et
            son propre statut.
          </div>
        )}

        <div className="confirmation-orders">
          {order.orders.map((created) => (
            <article className="confirmation-order" key={created.id}>
              <header>
                <div>
                  <span className="eyebrow">
                    {created.categoryType === "GPS"
                      ? "Commande GPS"
                      : "Commande boissons"}
                  </span>
                  <h2>{created.orderNumber}</h2>
                </div>
                <span className="tracking-code">{created.trackingCode}</span>
              </header>
              <ul>
                {created.items.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.productName} × {item.quantity}
                    </span>
                    <strong>{formatPrice(item.lineTotal)}</strong>
                  </li>
                ))}
              </ul>
              <div className="confirmation-order-foot">
                <span>
                  Total : <strong>{formatPrice(created.total)}</strong>
                </span>
                <button
                  className="secondary compact"
                  onClick={() => navigate(`/suivi/${created.trackingCode}`)}
                >
                  Suivre cette commande <Icon name="arrow" size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="notice-box">
          <strong>Conservez vos codes de suivi</strong>
          <p>
            Le suivi public est accessible avec le code ci-dessus. La messagerie
            privée de chaque commande est protégée par le numéro de téléphone
            utilisé lors de la commande.
          </p>
        </div>

        <div className="confirmation-actions">
          <button
            className="primary"
            onClick={() =>
              navigate(`/suivi/${order.orders[0]?.trackingCode ?? ""}`)
            }
          >
            Ouvrir le suivi <Icon name="arrow" />
          </button>
          <button className="secondary" onClick={() => navigate("/")}>
            Retour à l’accueil
          </button>
        </div>
      </div>
    </main>
  )
}
