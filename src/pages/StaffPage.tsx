import { useCallback, useEffect, useState } from "react"
import { Icon } from "../components/Icon"
import {
  DashboardBottomNav,
  DashboardMobileBar,
  type DashboardNavItem,
} from "../components/DashboardNav"
import { Alert, LoadingState, StatusBadge } from "../components/ui"
import { AccountSettings } from "../components/AccountSettings"
import { OrderDetailPanel } from "../components/OrderDetailPanel"
import { DashboardNotifications } from "../components/DashboardNotifications"
import { ForcePasswordChange } from "../components/ForcePasswordChange"
import { LoginPage } from "./LoginPage"
import { useStore } from "../context/StoreContext"
import { api, errorMessage } from "../lib/api"
import { BRAND_LOGO } from "../lib/brand"
import { formatDate, formatMoney, formatPrice } from "../lib/format"
import { fulfillmentLabels, roleLabels } from "../lib/labels"
import type { OrderListRow, StaffUser } from "../types"

export function StaffPage({ navigate }: { navigate: (path: string) => void }) {
  const { user, authLoading } = useStore()

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

  if (user.mustChangePassword)
    return <ForcePasswordChange user={user} navigate={navigate} />

  if (user.role !== "TECHNICIAN" && user.role !== "DELIVERY") {
    return (
      <main className="login-page">
        <div className="login-card">
          <span className="eyebrow">Espace intervenant</span>
          <h1>Votre espace est le back-office</h1>
          <p>
            Votre compte ({roleLabels[user.role]}) dispose des droits
            d’administration. Les missions assignées sont visibles depuis la
            gestion des commandes.
          </p>
          <button className="primary" onClick={() => navigate("/admin")}>
            Ouvrir l’administration <Icon name="arrow" />
          </button>
        </div>
      </main>
    )
  }

  return <StaffWorkspace user={user} navigate={navigate} />
}

function StaffWorkspace({
  user,
  navigate,
}: {
  user: StaffUser
  navigate: (path: string) => void
}) {
  const { logout, notify } = useStore()
  const [missions, setMissions] = useState<OrderListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<"missions" | "settings">("missions")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.staff.missions({
        pageSize: 100,
        status: statusFilter || undefined,
      })
      setMissions(result.data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const openOrder = (event: Event) => {
      const detail = (event as CustomEvent<{ orderId?: string }>).detail
      if (detail?.orderId) setSelected(detail.orderId)
    }
    window.addEventListener("allo:open-notification-order", openOrder)
    return () =>
      window.removeEventListener("allo:open-notification-order", openOrder)
  }, [])

  const activeMissions = missions.filter(
    (mission) =>
      !["LIVREE", "ECHEC_LIVRAISON", "REJETEE", "ANNULEE"].includes(mission.status),
  )
  const completed = missions.filter((mission) =>
    mission.status === "LIVREE",
  )

  const areaLabel = user.role === "TECHNICIAN" ? "TECHNICIEN" : "LIVREUR"
  const staffNav: DashboardNavItem[] = [
    {
      id: "missions",
      label: "Mes missions",
      shortLabel: "Missions",
      icon: "fleet",
    },
    {
      id: "settings",
      label: "Paramètres",
      shortLabel: "Paramètres",
      icon: "shield",
    },
    {
      id: "store",
      label: "Retour à la boutique",
      shortLabel: "Boutique",
      icon: "home",
    },
  ]

  return (
    <main className="admin-page">
      <DashboardMobileBar
        area={areaLabel}
        userName={user.name}
        onHome={() => navigate("/")}
        onLogout={() => void logout()}
        extraActions={<DashboardNotifications />}
      />
      <div className="admin-shell staff-shell">
        <aside className="admin-sidebar">
          <div className="brand inverse admin-brand">
            <img src={BRAND_LOGO} alt="" />
            <span>
              <strong>ALLO TOGO</strong>
              <small>{areaLabel}</small>
            </span>
          </div>
          <nav>
            <button
              className={tab === "missions" ? "active" : ""}
              onClick={() => setTab("missions")}
            >
              <Icon name="fleet" /> Mes missions
            </button>
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >
              <Icon name="shield" /> Paramètres
            </button>
            <button onClick={() => navigate("/")}>
              <Icon name="home" /> Retour à la boutique
            </button>
          </nav>
          <div className="admin-demo">
            <strong>{user.name}</strong>
            <p>{roleLabels[user.role]}</p>
            <button className="admin-logout" onClick={() => void logout()}>
              Se déconnecter
            </button>
          </div>
        </aside>

        <section className="admin-content">
          <header>
            <div>
              <span className="eyebrow">Espace intervenant</span>
              <h1>{tab === "settings" ? "Paramètres" : "Mes missions"}</h1>
            </div>
            <div className="admin-header-actions">
              <DashboardNotifications />
              {tab === "missions" && (
                <button className="secondary" onClick={() => void load()}>
                  Actualiser <Icon name="arrow" />
                </button>
              )}
            </div>
          </header>

          {tab === "settings" && <AccountSettings navigate={navigate} />}

          {tab === "missions" && (
            <>
              <div className="stats-grid">
                <article>
                  <span>Missions actives</span>
                  <strong>{activeMissions.length}</strong>
                  <small>à traiter ou en cours</small>
                </article>
                <article>
                  <span>Terminées</span>
                  <strong>{completed.length}</strong>
                  <small>commandes remises</small>
                </article>
                <article>
                  <span>Encaissement</span>
                  <strong>
                    {user.role === "DELIVERY"
                      ? "Selon configuration"
                      : "Non autorisé"}
                  </strong>
                  <small>le serveur applique les règles</small>
                </article>
                <article>
                  <span>Compte</span>
                  <strong>{roleLabels[user.role]}</strong>
                  <small>{user.email}</small>
                </article>
              </div>

              <div className="admin-filters">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="">Toutes mes missions</option>
                  <option value="COMMANDE_ACCEPTEE">Acceptées</option>
                  <option value="COMMANDE_EN_PREPARATION">En préparation</option>
                  <option value="COMMANDE_EN_COURS_DE_LIVRAISON">En cours</option>
                  <option value="LIVREE">Livrées / retirées</option>
                  <option value="ECHEC_LIVRAISON">Échecs de livraison</option>
                </select>
                <button className="secondary small" onClick={() => void load()}>
                  Filtrer
                </button>
              </div>

              {error && <Alert tone="error">{error}</Alert>}
              {loading ? (
                <LoadingState label="Chargement de vos missions…" />
              ) : missions.length === 0 ? (
                <div className="admin-panel">
                  <div className="state-block">
                    <h3>Aucune mission</h3>
                    <p>
                      Les commandes qui vous sont affectées apparaîtront ici.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mission-grid">
                  {missions.map((mission) => (
                    <button
                      className="mission-card"
                      key={mission.id}
                      onClick={() => setSelected(mission.id)}
                    >
                      <header>
                        <div>
                          <span className="eyebrow">
                            {mission.categoryType === "GPS"
                              ? "GPS"
                              : "Boissons"}
                          </span>
                          <h2>{mission.orderNumber}</h2>
                        </div>
                        <StatusBadge status={mission.status} />
                      </header>
                      <div className="mission-meta">
                        <div>
                          <span>Client</span>
                          <strong>{mission.customerName}</strong>
                          <small>{mission.customerPhone}</small>
                        </div>
                        <div>
                          <span>Réception</span>
                          <strong>
                            {fulfillmentLabels[mission.fulfillmentMode]}
                          </strong>
                          <small>
                            {mission.deliveryZone ||
                              mission.deliveryAddress ||
                              (mission.deliveryLatitude !== null ||
                                mission.deliveryMapUrl
                                ? "Point GPS partagé"
                                : "Agence")}
                          </small>
                        </div>
                        <div>
                          <span>Total</span>
                          <strong>{formatPrice(mission.total)}</strong>
                          <small>
                            Reste : {formatMoney(mission.remainingDue)}
                          </small>
                        </div>
                        <div>
                          <span>Créée le</span>
                          <strong>{formatDate(mission.createdAt)}</strong>
                          <small>{mission.trackingCode}</small>
                        </div>
                      </div>
                      <div className="mission-foot">
                        <span>
                          <Icon name="clock" size={15} /> {mission.items.length}{" "}
                          article(s)
                        </span>
                        <span>
                          Ouvrir la mission <Icon name="arrow" size={15} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <DashboardBottomNav
        items={staffNav}
        active={tab}
        onSelect={(id) => {
          if (id === "missions") {
            setTab("missions")
            window.scrollTo({ top: 0, behavior: "smooth" })
          }
          if (id === "settings") {
            setTab("settings")
            window.scrollTo({ top: 0, behavior: "smooth" })
          }
          if (id === "store") navigate("/")
        }}
      />

      {selected && (
        <div
          className="overlay panel-overlay"
          onClick={() => setSelected(null)}
        >
          <div
            className="order-panel-wrap"
            onClick={(event) => event.stopPropagation()}
          >
            <OrderDetailPanel
              orderId={selected}
              user={user}
              onClose={() => setSelected(null)}
              onChanged={() => void load()}
              notify={notify}
            />
          </div>
        </div>
      )}
    </main>
  )
}
