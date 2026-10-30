import { useCallback, useEffect, useState } from "react"
import { Icon } from "../components/Icon"
import { Alert, LoadingState, StatusBadge } from "../components/ui"
import { LoginPage } from "./LoginPage"
import { useStore } from "../context/StoreContext"
import { api, errorMessage } from "../lib/api"
import { formatPrice } from "../lib/format"
import type { OrderListRow, StaffUser } from "../types"

export function CashRegisterPage({
  navigate,
}: {
  navigate: (path: string) => void
}) {
  const { user, authLoading, notify } = useStore()

  if (authLoading) {
    return (
      <main className="admin-page">
        <div className="admin-loading">
          <LoadingState label="Vérification de la session…" />
        </div>
      </main>
    )
  }

  if (!user) return <LoginPage area="staff" navigate={navigate} />

  if (user.mustChangePassword) {
    return (
      <main className="login-page">
        <div className="login-card">
          <span className="eyebrow">Encaissement espèces</span>
          <h1>Mot de passe à modifier</h1>
          <p>
            Veuillez modifier votre mot de passe provisoire avant d’accéder à
            l’encaissement.
          </p>
        </div>
      </main>
    )
  }

  // Seuls la gestion commerciale et la direction encaissent les espèces au
  // retour de l’équipe de livraison.
  if (
    !["COMMERCIAL", "DIRECTOR", "ADMIN"].includes(user.role as string)
  ) {
    return (
      <main className="login-page">
        <div className="login-card">
          <span className="eyebrow">Encaissement espèces</span>
          <h1>Accès réservé</h1>
          <p>
            Cette page est réservée au commercial et au directeur.
          </p>
        </div>
      </main>
    )
  }

  const [orders, setOrders] = useState<OrderListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [remittedBy, setRemittedBy] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.orders.list({
        pageSize: 100,
        status: "LIVREE",
        fulfillmentMode: "LIVRAISON",
        paymentStatus: "NON_PAYE",
      })
      const eligible = result.data.filter(
        (o) => o.customerPaymentChoice === "ESPECES" && o.remainingDue > 0,
      )
      setOrders(eligible)
      setAmounts(
        Object.fromEntries(eligible.map((o) => [o.id, o.remainingDue])),
      )
      setRemittedBy(Object.fromEntries(eligible.map((o) => [o.id, ""])))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const recordPayment = async (order: OrderListRow) => {
    const amount = amounts[order.id] ?? order.remainingDue
    if (!amount || amount <= 0) {
      setError("Montant invalide.")
      return
    }
    setSaving({ ...saving, [order.id]: true })
    setError(null)
    setDone(null)
    try {
      await api.orders.recordPayment(order.id, {
        amount,
        method: "ESPECES",
        reference: `ESPECES LIVRAISON ${order.orderNumber} — remis par ${remittedBy[order.id] || "membre de l'équipe"}`,
      })
      setDone(order.id)
      notify?.(
        `Paiement de ${formatPrice(amount)} FCFA enregistré pour ${order.orderNumber}.`,
      )
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving({ ...saving, [order.id]: false })
    }
  }

  return (
    <main className="admin-page">
      <div className="shell">
        <div className="admin-header">
          <h1>Encaissement espèces — Livraison</h1>
          <p>
            Enregistrez les espèces récupérées auprès du client par l’équipe de
            livraison. Le montant, la date et l’heure sont enregistrés
            automatiquement avec un historique d’audit.
          </p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        {done && (
          <Alert tone="success">
            Paiement enregistré avec succès pour {done}.
          </Alert>
        )}

        {loading ? (
          <LoadingState label="Chargement des commandes à encaisser…" />
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <p>
              Aucune commande livrée en attente d’encaissement espèces.
            </p>
          </div>
        ) : (
          <table className="register-table">
            <thead>
              <tr>
                <th>Commande</th>
                <th>Client</th>
                <th>Téléphone</th>
                <th>Total</th>
                <th>Déjà payé</th>
                <th>À encaisser</th>
                <th>Remis par (équipe)</th>
                <th>Montant reçu</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                    <br />
                    <small>{order.trackingCode}</small>
                  </td>
                  <td>{order.customerName}</td>
                  <td>{order.customerPhone}</td>
                  <td>{formatPrice(order.total)}</td>
                  <td>{formatPrice(order.paidAmount)}</td>
                  <td>{formatPrice(order.remainingDue)}</td>
                  <td>
                    <input
                      type="text"
                      value={remittedBy[order.id] ?? ""}
                      onChange={(e) => {
                        setRemittedBy({
                          ...remittedBy,
                          [order.id]: e.target.value,
                        })
                      }}
                      placeholder="Nom du remettant"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={amounts[order.id] ?? order.remainingDue}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setAmounts({
                          ...amounts,
                          [order.id]: Number.isFinite(v) && v > 0 ? v : 0,
                        })
                      }}
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <button
                      className="primary"
                      disabled={saving[order.id]}
                      onClick={() => recordPayment(order)}
                    >
                      {saving[order.id] ? "Enregistrement…" : "Encaisser"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
