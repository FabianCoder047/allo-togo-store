import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "../components/Icon"
import {
  DashboardBottomNav,
  DashboardMobileBar,
  type DashboardNavItem,
} from "../components/DashboardNav"
import { Alert, LoadingState, StatusBadge } from "../components/ui"
import { OrderDetailPanel } from "../components/OrderDetailPanel"
import { AssistantThreadPanel } from "../components/AssistantThreadPanel"
import { DashboardNotifications } from "../components/DashboardNotifications"
import { AccountSettings } from "../components/AccountSettings"
import { AuditPanel } from "../components/AuditPanel"
import { InfrastructurePanel } from "../components/InfrastructurePanel"
import { ForcePasswordChange } from "../components/ForcePasswordChange"
import { StaffAssistantAlerts } from "../components/StaffAssistantAlerts"
import { LoginPage } from "./LoginPage"
import { useStore } from "../context/StoreContext"
import { api, errorMessage } from "../lib/api"
import { BRAND_LOGO } from "../lib/brand"
import { formatDate, formatMoney, formatPrice } from "../lib/format"
import {
  fulfillmentLabels,
  orderStatusLabel,
  orderStatusLabels,
  productTypeLabels,
  quoteStatusLabels,
  roleLabels,
} from "../lib/labels"
import type {
  AssistantAlert,
  Category,
  Dashboard,
  OrderListRow,
  Product,
  ProductType,
  QuoteRequest,
  StaffUser,
} from "../types"

type Tab = "overview" | "orders" | "catalog" | "quotes" | "users" | "infrastructure" | "audit" | "settings"
type PendingDeletion = { kind: "catalog" , id: string , name: string } | {
  kind: "staff"
  id: string
  name: string
}

const tabs: DashboardNavItem[] = [
  {
    id: "overview",
    label: "Vue d’ensemble",
    shortLabel: "Accueil",
    icon: "building",
  },
  { id: "orders", label: "Commandes", shortLabel: "Commandes", icon: "bag" },
  {
    id: "catalog",
    label: "Catalogue",
    shortLabel: "Catalogue",
    icon: "catalog",
  },
  {
    id: "quotes",
    label: "Demandes de devis",
    shortLabel: "Devis",
    icon: "headset",
  },
  { id: "users", label: "Personnel", shortLabel: "Personnel", icon: "user" },
  {
    id: "infrastructure",
    label: "Infrastructure",
    shortLabel: "Infra",
    icon: "shield",
  },
  { id: "audit", label: "Journal d’audit", shortLabel: "Audit", icon: "clock" },
  {
    id: "settings",
    label: "Paramètres",
    shortLabel: "Paramètres",
    icon: "shield",
  },
]

export function AdminPage({ navigate }: { navigate: (path: string) => void }) {
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

  if (!user) return <LoginPage area="admin" navigate={navigate} />

  if (user.mustChangePassword)
    return <ForcePasswordChange user={user} navigate={navigate} />

  if (
    user.role !== "DIRECTOR" &&
    user.role !== "ADMIN" &&
    user.role !== "COMMERCIAL"
  ) {
    return (
      <main className="login-page">
        <div className="login-card">
          <span className="eyebrow">Accès refusé</span>
          <h1>Espace administrateur</h1>
          <p>
            Votre compte ({roleLabels[user.role]}) n’a pas accès au back-office.
            Utilisez l’espace intervenant pour consulter vos missions.
          </p>
          <button className="primary" onClick={() => navigate("/staff")}>
            Ouvrir l’espace intervenant <Icon name="arrow" />
          </button>
        </div>
      </main>
    )
  }

  return <AdminWorkspace user={user} navigate={navigate} />
}

function AdminWorkspace({
  user,
  navigate,
}: {
  user: StaffUser
  navigate: (path: string) => void
}) {
  const { logout, notify } = useStore()
  const [tab, setTab] = useState<Tab>(() =>
    user.role === "ADMIN" ? "infrastructure" : "overview",
  )
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [orders, setOrders] = useState<OrderListRow[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersTotalPages, setOrdersTotalPages] = useState(1)
  const [orderSearch, setOrderSearch] = useState("")
  const [orderStatus, setOrderStatus] = useState("")
  const [orderCategory, setOrderCategory] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [assistantThreadKey, setAssistantThreadKey] = useState<string | null>(
    null,
  )
  const [assistantThreadReference, setAssistantThreadReference] =
    useState<string | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [catalogSection, setCatalogSection] = useState<"products" | "services">(
    "products",
  )
  const [catalogProduct, setCatalogProduct] =
    useState<Product | null | undefined>(undefined)
  const [quotes, setQuotes] = useState<QuoteRequest[]>([])
  const [quotesLoading, setQuotesLoading] = useState(false)
  const [quotesError, setQuotesError] = useState<string | null>(null)
  const [users, setUsers] = useState<StaffUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [userModal, setUserModal] = useState<StaffUser | null | undefined>(
    undefined,
  )
  const [pendingDeletion, setPendingDeletion] =
    useState<PendingDeletion | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [assistantAlerts, setAssistantAlerts] = useState<AssistantAlert[]>([])
  const [assistantAlertsLoading, setAssistantAlertsLoading] = useState(false)
  const [assistantAlertsError, setAssistantAlertsError] =
    useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true)
    setDashboardError(null)
    try {
      setDashboard(await api.admin.dashboard())
    } catch (error) {
      setDashboardError(errorMessage(error))
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const result = await api.orders.list({
        page: ordersPage,
        pageSize: 20,
        search: orderSearch || undefined,
        status: orderStatus || undefined,
        categoryType: orderCategory || undefined,
      })
      setOrders(result.data)
      setOrdersTotalPages(result.pagination.totalPages || 1)
    } catch (error) {
      setOrdersError(errorMessage(error))
    } finally {
      setOrdersLoading(false)
    }
  }, [ordersPage, orderSearch, orderStatus, orderCategory])

  const loadProducts = useCallback(async () => {
    setProductsLoading(true)
    setProductsError(null)
    try {
      const [catalogProducts, catalogCategories] = await Promise.all([
        api.admin.catalog.products(),
        api.admin.catalog.categories(),
      ])
      setProducts(catalogProducts)
      setCategories(catalogCategories)
    } catch (error) {
      setProductsError(errorMessage(error))
    } finally {
      setProductsLoading(false)
    }
  }, [])

  const loadQuotes = useCallback(async () => {
    setQuotesLoading(true)
    setQuotesError(null)
    try {
      const result = await api.quotes.list({ pageSize: 50 })
      setQuotes(result.data)
    } catch (error) {
      setQuotesError(errorMessage(error))
    } finally {
      setQuotesLoading(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      setUsers(await api.admin.users({ includeInactive: true }))
    } catch (error) {
      setUsersError(errorMessage(error))
    } finally {
      setUsersLoading(false)
    }
  }, [])

  const loadAssistantAlerts = useCallback(async () => {
    setAssistantAlertsLoading(true)
    setAssistantAlertsError(null)
    try {
      setAssistantAlerts(await api.staff.assistantAlerts())
    } catch (error) {
      setAssistantAlertsError(errorMessage(error))
    } finally {
      setAssistantAlertsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "overview") {
      void loadDashboard()
      void loadAssistantAlerts()
    }
    if (tab === "orders") void loadOrders()
    if (tab === "catalog") void loadProducts()
    if (tab === "quotes") void loadQuotes()
    if (tab === "users") void loadUsers()
  }, [
    tab,
    loadDashboard,
    loadAssistantAlerts,
    loadOrders,
    loadProducts,
    loadQuotes,
    loadUsers,
  ])

  const openAssistantThread = useCallback(
    (threadKey?: string | null, reference?: string | null) => {
      const key = threadKey || reference
      if (!key) {
        setTab("overview")
        setSelectedOrder(null)
        void loadAssistantAlerts()
        window.setTimeout(() => {
          document
            .getElementById("admin-assistant-alerts")
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 120)
        return
      }
      setAssistantThreadKey(key)
      setAssistantThreadReference(reference ?? null)
    },
    [loadAssistantAlerts],
  )

  useEffect(() => {
    const openAlerts = () => openAssistantThread()
    const openThread = (event: Event) => {
      const detail = (event as CustomEvent<{
        threadId?: string
        reference?: string
      }>).detail
      openAssistantThread(detail?.threadId, detail?.reference)
    }
    const openOrder = (event: Event) => {
      const detail = (event as CustomEvent<{ orderId?: string }>).detail
      if (!detail?.orderId) return
      setTab("orders")
      setSelectedOrder(detail.orderId)
    }
    window.addEventListener("allo:open-assistant-alerts", openAlerts)
    window.addEventListener("allo:open-assistant-thread", openThread)
    window.addEventListener("allo:open-notification-order", openOrder)
    return () => {
      window.removeEventListener("allo:open-assistant-alerts", openAlerts)
      window.removeEventListener("allo:open-assistant-thread", openThread)
      window.removeEventListener("allo:open-notification-order", openOrder)
    }
  }, [openAssistantThread])

  const selectTab = (next: string) => {
    setTab(next as Tab)
    setSelectedOrder(null)
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const indicators = dashboard?.indicators
  const canManageUsers = user.role === "DIRECTOR" || user.role === "ADMIN"
  // Chaque rôle ne voit que les espaces qui le concernent.
  const visibleTabs = useMemo(() => {
    const allowed: Record<StaffUser["role"], Tab[]> = {
      DIRECTOR: [
        "overview",
        "orders",
        "catalog",
        "quotes",
        "users",
        "infrastructure",
        "audit",
        "settings",
      ],
      ADMIN: ["users", "infrastructure", "audit", "settings"],
      COMMERCIAL: ["overview", "orders", "catalog", "quotes", "settings"],
      TECHNICIAN: [],
      DELIVERY: [],
    }
    const ids = allowed[user.role]
    return tabs.filter((item) => ids.includes(item.id as Tab))
  }, [user.role])
  const workspaceLabel =
    user.role === "DIRECTOR"
      ? "DIRECTION"
      : user.role === "ADMIN"
        ? "INFORMATIQUE"
        : "BACK-OFFICE"
  const pageTitles: Record<Tab, string> = {
    overview: "Tableau de bord",
    orders: "Commandes",
    catalog: "Catalogue",
    quotes: "Demandes de devis",
    users: "Personnel",
    infrastructure: "Infrastructure",
    audit: "Journal d’audit",
    settings: "Paramètres",
  }
  const maxOrdersByDay = useMemo(
    () =>
      Math.max(
        1,
        ...(dashboard?.charts.ordersByDay.map((row) => row.count) ?? [1]),
      ),
    [dashboard],
  )

  return (
    <main className="admin-page">
      <DashboardMobileBar
        area={workspaceLabel}
        userName={user.name}
        onHome={() => navigate("/")}
        onLogout={() => void logout()}
        extraActions={<DashboardNotifications />}
      />
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="brand inverse admin-brand">
            <img src={BRAND_LOGO} alt="" />
            <span>
              <strong>ALLO TOGO</strong>
              <small>{workspaceLabel}</small>
            </span>
          </div>
          <nav>
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => selectTab(item.id)}
              >
                <Icon name={item.icon} /> {item.label}
              </button>
            ))}
          </nav>
          <div className="admin-demo">
            <strong>{user.name}</strong>
            <p>{roleLabels[user.role]} · connecté</p>
            <button className="admin-logout" onClick={() => void logout()}>
              Se déconnecter
            </button>
          </div>
        </aside>

        <section className="admin-content" ref={contentRef}>
          <header>
            <div>
              <span className="eyebrow">Back-office</span>
              <h1>{pageTitles[tab]}</h1>
            </div>
            <div className="admin-header-actions">
              <DashboardNotifications />
              <button className="secondary" onClick={() => navigate("/")}>
                Voir la boutique <Icon name="arrow" />
              </button>
            </div>
          </header>

          {tab === "overview" && (
            <>
              {dashboardError && <Alert tone="error">{dashboardError}</Alert>}
              {dashboardLoading || !dashboard ? (
                <LoadingState label="Chargement des indicateurs…" />
              ) : (
                <>
                  <div className="stats-grid">
                    <article>
                      <span>À confirmer</span>
                      <strong>{indicators?.pendingConfirmation ?? 0}</strong>
                      <small>commandes en attente</small>
                    </article>
                    <article>
                      <span>En cours</span>
                      <strong>
                        {(indicators?.accepted ?? 0) +
                          (indicators?.preparing ?? 0) +
                          (indicators?.inProgress ?? 0)}
                      </strong>
                      <small>acceptées, préparation, livraison</small>
                    </article>
                    <article>
                      <span>Livrées non payées</span>
                      <strong>{indicators?.deliveredUnpaid ?? 0}</strong>
                      <small>paiement à régulariser</small>
                    </article>
                    <article>
                      <span>Encaissé (période)</span>
                      <strong>
                        {formatMoney(indicators?.paymentsReceived ?? 0)}
                      </strong>
                      <small>
                        reste dû : {formatMoney(indicators?.outstanding ?? 0)}
                      </small>
                    </article>
                  </div>

                  <div className="admin-overview-grid">
                    <div className="admin-panel">
                      <div className="admin-panel-head">
                        <div>
                          <h2>Commandes récentes</h2>
                          <p>Les 8 dernières commandes créées.</p>
                        </div>
                        <button
                          className="secondary small"
                          onClick={() => setTab("orders")}
                        >
                          Tout voir
                        </button>
                      </div>
                      <div className="admin-table">
                        <div className="admin-tr admin-th orders-compact">
                          <span>Commande</span>
                          <span>Client</span>
                          <span>Statut</span>
                          <span>Total</span>
                        </div>
                        {dashboard.recentOrders.map((order) => (
                          <div
                            className="admin-tr orders-compact clickable"
                            key={order.id}
                            onClick={() => {
                              setTab("orders")
                              setSelectedOrder(order.id)
                            }}
                          >
                            <span>
                              <strong>{order.orderNumber}</strong>
                              <small>{formatDate(order.createdAt)}</small>
                            </span>
                            <span>{order.customerName}</span>
                            <span>
                              <StatusBadge status={order.status} />
                            </span>
                            <span>{formatPrice(order.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="admin-side-column">
                      <div className="admin-panel">
                        <div className="admin-panel-head">
                          <div>
                            <h2>Activité</h2>
                            <p>Commandes créées sur 30 jours.</p>
                          </div>
                        </div>
                        <div className="mini-chart">
                          {dashboard.charts.ordersByDay
                            .slice(-14)
                            .map((row) => (
                              <div
                                key={row.date}
                                title={`${row.date} : ${row.count}`}
                              >
                                <span
                                  style={{
                                    height: `${Math.max(6, (row.count / maxOrdersByDay) * 100)}%`,
                                  }}
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                      <div className="admin-panel">
                        <div className="admin-panel-head">
                          <div>
                            <h2>Devis en attente</h2>
                            <p>
                              {indicators?.pendingQuotes ?? 0} demande(s)
                              nouvelle(s).
                            </p>
                          </div>
                          <button
                            className="secondary small"
                            onClick={() => setTab("quotes")}
                          >
                            Ouvrir
                          </button>
                        </div>
                      </div>
                      <div className="admin-panel" id="admin-assistant-alerts">
                        <div className="admin-panel-head">
                          <div>
                            <h2>Messages assistant</h2>
                            <p>
                              {assistantAlerts.length > 0
                                ? `${assistantAlerts.length} question(s) transmise(s) à l’équipe.`
                                : "Les questions non résolues apparaîtront ici."}
                            </p>
                          </div>
                          <button
                            className="secondary small"
                            onClick={() => void loadAssistantAlerts()}
                          >
                            Actualiser
                          </button>
                        </div>
                        {assistantAlertsError && (
                          <Alert tone="error">{assistantAlertsError}</Alert>
                        )}
                        {assistantAlertsLoading ? (
                          <LoadingState label="Chargement des messages…" />
                        ) : assistantAlerts.length === 0 ? (
                          <div className="state-block">
                            <h3>Aucun message en attente</h3>
                            <p>
                              L’assistant transfère ici les questions qu’il ne
                              peut pas résoudre.
                            </p>
                          </div>
                        ) : (
                          <ul className="notification-list assistant-notification-list">
                            {assistantAlerts.slice(0, 5).map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  className="notification-item"
                                  onClick={() =>
                                    openAssistantThread(
                                      item.assistantThreadId ??
                                        item.payload?.threadId,
                                      item.payload?.reference,
                                    )
                                  }
                                >
                                  <span>
                                    <strong>
                                      {item.payload?.reference ?? "Assistant"}
                                    </strong>
                                    <small>
                                      {formatDate(
                                        item.payload?.createdAt ??
                                          item.createdAt,
                                      )}
                                    </small>
                                  </span>
                                  <span>
                                    {item.payload?.customerMessage ??
                                      "Message client non résolu."}
                                  </span>
                                  <span className="notification-item-action">
                                    Répondre <Icon name="arrow" size={12} />
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="admin-panel">
                        <div className="admin-panel-head">
                          <div>
                            <h2>Répartition</h2>
                            <p>Statuts des commandes de la période.</p>
                          </div>
                        </div>
                        <ul className="distribution-list">
                          {dashboard.charts.statusDistribution.map((row) => (
                            <li key={row.status}>
                              <span>{orderStatusLabel(row.status)}</span>
                              <strong>{row.count}</strong>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === "orders" && (
            <>
              <div className="admin-filters">
                <label className="catalog-search">
                  <Icon name="search" />
                  <input
                    value={orderSearch}
                    onChange={(event) => {
                      setOrdersPage(1)
                      setOrderSearch(event.target.value)
                    }}
                    placeholder="Numéro, code de suivi, client, téléphone…"
                  />
                </label>
                <select
                  value={orderStatus}
                  onChange={(event) => {
                    setOrdersPage(1)
                    setOrderStatus(event.target.value)
                  }}
                >
                  <option value="">Tous les statuts</option>
                  {Object.entries(orderStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={orderCategory}
                  onChange={(event) => {
                    setOrdersPage(1)
                    setOrderCategory(event.target.value)
                  }}
                >
                  <option value="">Tous les types</option>
                  <option value="GPS">GPS</option>
                  <option value="DRINK">Boissons</option>
                </select>
                <button
                  className="secondary small"
                  onClick={() => void loadOrders()}
                >
                  Actualiser
                </button>
              </div>
              {ordersError && <Alert tone="error">{ordersError}</Alert>}
              {ordersLoading ? (
                <LoadingState label="Chargement des commandes…" />
              ) : orders.length === 0 ? (
                <div className="admin-panel">
                  <div className="state-block">
                    <h3>Aucune commande</h3>
                    <p>
                      Aucune commande ne correspond aux filtres sélectionnés.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="admin-panel">
                  <div className="admin-table">
                    <div className="admin-tr admin-th orders">
                      <span>Commande</span>
                      <span>Client</span>
                      <span>Type</span>
                      <span>Statut</span>
                      <span>Paiement</span>
                      <span>Total</span>
                      <span>Affectation</span>
                    </div>
                    {orders.map((order) => (
                      <div
                        className="admin-tr orders clickable"
                        key={order.id}
                        onClick={() => setSelectedOrder(order.id)}
                      >
                        <span>
                          <strong>{order.orderNumber}</strong>
                          <small>{order.trackingCode}</small>
                        </span>
                        <span>
                          {order.customerName}
                          <small>{order.customerPhone}</small>
                        </span>
                        <span>
                          {order.categoryType === "GPS" ? "GPS" : "Boissons"}
                        </span>
                        <span>
                          <StatusBadge status={order.status} />
                        </span>
                        <span>
                          <StatusBadge
                            status={order.paymentStatus}
                            kind="payment"
                          />
                        </span>
                        <span>{formatPrice(order.total)}</span>
                        <span>{order.assignedTo?.name || "—"}</span>
                      </div>
                    ))}
                  </div>
                  <div className="admin-pagination">
                    <button
                      className="secondary small"
                      disabled={ordersPage <= 1}
                      onClick={() =>
                        setOrdersPage((page) => Math.max(1, page - 1))
                      }
                    >
                      Précédent
                    </button>
                    <span>
                      Page {ordersPage} / {ordersTotalPages}
                    </span>
                    <button
                      className="secondary small"
                      disabled={ordersPage >= ordersTotalPages}
                      onClick={() => setOrdersPage((page) => page + 1)}
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "catalog" && (
            <>
              {productsError && <Alert tone="error">{productsError}</Alert>}
              {productsLoading ? (
                <LoadingState label="Chargement du catalogue…" />
              ) : (
                <div className="admin-panel">
                  <div className="admin-panel-head">
                    <div>
                      <h2>
                        {catalogSection === "products"
                          ? "Produits"
                          : "Services"}
                      </h2>
                      <p>
                        {
                          products.filter((product) =>
                            catalogSection === "services"
                              ? product.type === "SERVICE"
                              : product.type !== "SERVICE",
                          ).length
                        }{" "}
                        élément(s). Les modifications sont immédiatement
                        visibles en boutique.
                      </p>
                    </div>
                    <div className="admin-panel-actions">
                      <button
                        className="secondary small"
                        onClick={() => void loadProducts()}
                      >
                        Actualiser
                      </button>
                      <button
                        className="primary small"
                        onClick={() => setCatalogProduct(null)}
                      >
                        <Icon name="plus" /> Ajouter
                      </button>
                    </div>
                  </div>
                  <div
                    className="catalog-admin-tabs"
                    role="tablist"
                    aria-label="Sections du catalogue"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={catalogSection === "products"}
                      className={catalogSection === "products" ? "active" : ""}
                      onClick={() => setCatalogSection("products")}
                    >
                      Produits
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={catalogSection === "services"}
                      className={catalogSection === "services" ? "active" : ""}
                      onClick={() => setCatalogSection("services")}
                    >
                      Services
                    </button>
                  </div>
                  <div className="admin-table">
                    <div
                      className={`admin-tr admin-th catalog ${
                        catalogSection === "services" ? "services" : ""
                      }`}
                    >
                      <span>Produit</span>
                      <span>Type</span>
                      <span>Prix</span>
                      {catalogSection !== "services" && <span>Stock</span>}
                      <span>Disponible</span>
                      <span>État</span>
                      <span>Actions</span>
                    </div>
                    {products
                      .filter((product) =>
                        catalogSection === "services"
                          ? product.type === "SERVICE"
                          : product.type !== "SERVICE",
                      )
                      .map((product) => (
                        <div
                          className={`admin-tr catalog ${
                            catalogSection === "services" ? "services" : ""
                          }`}
                          key={product.id}
                        >
                          <div className="catalog-product-cell">
                            {product.images[0] ? (
                              <img
                                className="catalog-product-thumbnail"
                                src={product.images[0].url}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <span
                                className="catalog-product-thumbnail catalog-product-thumbnail-empty"
                                aria-label="Image manquante"
                              >
                                <Icon name="services" size={18} />
                              </span>
                            )}
                            <span className="catalog-product-name">
                              <strong>{product.name}</strong>
                              <small>{product.sku}</small>
                            </span>
                          </div>
                          <span>{productTypeLabels[product.type]}</span>
                          <span>{formatPrice(product.price)}</span>
                          {catalogSection !== "services" && (
                            <span>
                              {product.manageStock ? (product.stock ?? 0) : "—"}
                            </span>
                          )}
                          <span>
                            <button
                              className="toggle-pill"
                              onClick={async () => {
                                try {
                                  await api.admin.catalog.updateProduct(
                                    product.id,
                                    { available: !product.available },
                                  )
                                  await loadProducts()
                                  notify(
                                    "Disponibilité mise à jour.",
                                    "success",
                                  )
                                } catch (error) {
                                  notify(errorMessage(error), "error")
                                }
                              }}
                            >
                              {product.available ? "Oui" : "Non"}
                            </button>
                          </span>
                          <span>
                            <button
                              className="toggle-pill"
                              onClick={async () => {
                                try {
                                  await api.admin.catalog.updateProduct(
                                    product.id,
                                    { active: !product.active },
                                  )
                                  await loadProducts()
                                  notify("Publication mise à jour.", "success")
                                } catch (error) {
                                  notify(errorMessage(error), "error")
                                }
                              }}
                            >
                              {product.active ? "Désactiver" : "Activer"}
                            </button>
                          </span>
                          <span className="catalog-row-actions">
                            <button
                              className="secondary compact"
                              onClick={() => setCatalogProduct(product)}
                            >
                              Modifier
                            </button>
                            <button
                              className="danger compact"
                              onClick={async () => {
                                setPendingDeletion({
                                  kind: "catalog",
                                  id: product.id,
                                  name: product.name,
                                })
                              }}
                            >
                              Supprimer
                            </button>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "quotes" && (
            <>
              {quotesError && <Alert tone="error">{quotesError}</Alert>}
              {quotesLoading ? (
                <LoadingState label="Chargement des devis…" />
              ) : quotes.length === 0 ? (
                <div className="admin-panel">
                  <div className="state-block">
                    <h3>Aucune demande de devis</h3>
                    <p>
                      Les demandes envoyées depuis la boutique apparaîtront ici.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="admin-panel">
                  <div className="admin-table">
                    <div className="admin-tr admin-th quotes">
                      <span>Référence</span>
                      <span>Contact</span>
                      <span>Demande</span>
                      <span>Statut</span>
                      <span>Date</span>
                    </div>
                    {quotes.map((quote) => (
                      <div className="admin-tr quotes" key={quote.id}>
                        <span>
                          <strong>{quote.reference}</strong>
                          {quote.service && <small>{quote.service.name}</small>}
                        </span>
                        <span>
                          {quote.name}
                          <small>{quote.phone}</small>
                        </span>
                        <span className="quote-message">{quote.message}</span>
                        <span>
                          <select
                            value={quote.status}
                            onChange={async (event) => {
                              try {
                                await api.quotes.update(quote.id, {
                                  status: event.target.value,
                                })
                                await loadQuotes()
                                notify("Statut du devis mis à jour.", "success")
                              } catch (error) {
                                notify(errorMessage(error), "error")
                              }
                            }}
                          >
                            {Object.entries(quoteStatusLabels).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </span>
                        <span>{formatDate(quote.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "users" && (
            <>
              {usersError && <Alert tone="error">{usersError}</Alert>}
              <div className="admin-panel admin-panel-full">
                <div className="admin-panel-head">
                  <div>
                    <h2>Comptes du personnel</h2>
                    <p>{users.length} compte(s), y compris inactifs.</p>
                  </div>
                  <div className="admin-panel-actions">
                    <button
                      className="secondary small"
                      onClick={() => void loadUsers()}
                    >
                      Actualiser
                    </button>
                    {canManageUsers && (
                      <button
                        className="primary small"
                        onClick={() => setUserModal(null)}
                      >
                        <Icon name="plus" /> Ajouter un membre
                      </button>
                    )}
                  </div>
                </div>
                {usersLoading ? (
                  <LoadingState />
                ) : (
                  <div className="admin-table">
                    <div
                      className={`admin-tr admin-th users ${
                        !canManageUsers ? "without-actions" : ""
                      }`}
                    >
                      <span>Nom</span>
                      <span>Rôle</span>
                      <span>Email</span>
                      <span>Actif</span>
                      {canManageUsers && <span>Actions</span>}
                    </div>
                    {users.map((member) => (
                      <div
                        className={`admin-tr users ${
                          !canManageUsers ? "without-actions" : ""
                        }`}
                        key={member.id}
                      >
                        <span>
                          <strong>{member.name}</strong>
                          <small>{member.phone || "—"}</small>
                        </span>
                        <span>{roleLabels[member.role]}</span>
                        <span>
                          {member.email}
                          {member.mustChangePassword && (
                            <small>Mot de passe provisoire à changer</small>
                          )}
                        </span>
                        <span>
                          <button
                            className="toggle-pill"
                            onClick={async () => {
                              try {
                                await api.admin.updateUser(member.id, {
                                  active: !member.active,
                                })
                                await loadUsers()
                                notify("Compte mis à jour.", "success")
                              } catch (error) {
                                notify(errorMessage(error), "error")
                              }
                            }}
                          >
                            {member.active ? "Actif" : "Inactif"}
                          </button>
                        </span>
                        {canManageUsers && (
                          <span className="staff-row-actions">
                            <button
                              className="secondary compact"
                              onClick={() => setUserModal(member)}
                            >
                              Modifier
                            </button>
                            <button
                              className="danger compact"
                              disabled={!member.active}
                              onClick={() =>
                                setPendingDeletion({
                                  kind: "staff",
                                  id: member.id,
                                  name: member.name,
                                })
                              }
                            >
                              Supprimer
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "infrastructure" && <InfrastructurePanel role={user.role} />}

          {tab === "audit" && <AuditPanel />}

          {tab === "settings" && <AccountSettings navigate={navigate} />}
        </section>
      </div>

      <DashboardBottomNav
        items={visibleTabs}
        active={tab}
        onSelect={selectTab}
      />

      {selectedOrder && (
        <div
          className="overlay panel-overlay"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="order-panel-wrap"
            onClick={(event) => event.stopPropagation()}
          >
            <OrderDetailPanel
              orderId={selectedOrder}
              user={user}
              onClose={() => setSelectedOrder(null)}
              onChanged={() => {
                void loadOrders()
                void loadDashboard()
              }}
              notify={notify}
            />
          </div>
        </div>
      )}

      {assistantThreadKey && (
        <div
          className="overlay panel-overlay"
          onClick={() => setAssistantThreadKey(null)}
        >
          <div
            className="order-panel-wrap"
            onClick={(event) => event.stopPropagation()}
          >
            <AssistantThreadPanel
              threadKey={assistantThreadKey}
              reference={assistantThreadReference ?? undefined}
              onClose={() => setAssistantThreadKey(null)}
              notify={notify}
            />
          </div>
        </div>
      )}

      {userModal !== undefined && (
        <CreateUserModal
          member={userModal}
          onClose={() => setUserModal(undefined)}
          onCreated={() => {
            setUserModal(undefined)
            void loadUsers()
          }}
          notify={notify}
        />
      )}

      {pendingDeletion && (
        <div
          className="overlay centered"
          onClick={() => {
            if (!deleting) setPendingDeletion(null)
          }}
        >
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-dialog-icon">
              <Icon name="trash" size={22} />
            </div>
            <span className="eyebrow">Confirmation</span>
            <h2 id="delete-confirm-title">
              {pendingDeletion.kind === "staff"
                ? "Supprimer ce compte ?"
                : "Supprimer ce contenu ?"}
            </h2>
            <p id="delete-confirm-description">
              <strong>« {pendingDeletion.name} »</strong>{" "}
              {pendingDeletion.kind === "staff"
                ? "sera désactivé et ne pourra plus se connecter. Son historique sera conservé."
                : "sera définitivement supprimé du catalogue. Cette action est irréversible."}
            </p>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="secondary"
                disabled={deleting}
                onClick={() => setPendingDeletion(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="danger"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  try {
                    if (pendingDeletion.kind === "staff") {
                      await api.admin.deleteUser(pendingDeletion.id)
                      await loadUsers()
                      notify("Compte supprimé et désactivé.", "success")
                    } else {
                      await api.admin.catalog.deleteProduct(pendingDeletion.id)
                      await loadProducts()
                      notify("Contenu supprimé.", "success")
                    }
                    setPendingDeletion(null)
                  } catch (error) {
                    notify(errorMessage(error), "error")
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                <Icon name="trash" size={16} />
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {catalogProduct !== undefined && (
        <CatalogProductModal
          product={catalogProduct}
          initialType={catalogSection === "services" ? "SERVICE" : "GPS"}
          categories={categories}
          onClose={() => setCatalogProduct(undefined)}
          onSaved={() => {
            setCatalogProduct(undefined)
            void loadProducts()
          }}
          notify={notify}
        />
      )}

      <StaffAssistantAlerts navigate={navigate} />
    </main>
  )
}

function CatalogProductModal({
  product,
  initialType,
  categories,
  onClose,
  onSaved,
  notify,
}: {
  product: Product | null
  initialType: ProductType
  categories: Category[]
  onClose: () => void
  onSaved: () => void
  notify: (message: string, tone?: "success" | "error" | "info") => void
}) {
  type MediaItem = { url: string , alt: string | null , sortOrder: number }
  type TierRow = { minQuantity: string , maxQuantity: string , unitPrice: string }

  const [type, setType] = useState<ProductType>(product?.type ?? initialType)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [images, setImages] = useState<MediaItem[]>(
    () =>
      product?.images.map(({ url, alt }, sortOrder) => ({
        url,
        alt,
        sortOrder,
      })) ?? [],
  )
  const [videos, setVideos] = useState<MediaItem[]>(
    () =>
      product?.videos.map(({ url, alt }, sortOrder) => ({
        url,
        alt,
        sortOrder,
      })) ?? [],
  )
  const [tiers, setTiers] = useState<TierRow[]>(
    () =>
      product?.wholesalePrices?.map((tier, index, all) => {
        const maxQuantity =
          tier.maxQuantity ??
          (tier.maxQuantity === undefined && index < all.length - 1
            ? all[index + 1].minQuantity - 1
            : null)
        return {
          minQuantity: String(tier.minQuantity),
          maxQuantity: maxQuantity === null ? "" : String(maxQuantity),
          unitPrice: String(tier.unitPrice),
        }
      }) ?? [],
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    product?.categoryId ?? "",
  )
  const compatibleCategories = categories.filter(
    (category) => category.type === type,
  )
  const categoryId = compatibleCategories.some(
    (category) => category.id === selectedCategoryId,
  )
    ? selectedCategoryId
    : (compatibleCategories[0]?.id ?? "")

  const uploadFiles = async (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: "image" | "video",
  ) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ""
    const currentCount = kind === "image" ? images.length : videos.length
    if (files.length + currentCount > 8) {
      notify(
        `Huit ${kind === "image" ? "images" : "vidéos"} maximum par fiche.`,
        "error",
      )
      return
    }

    setUploading(true)
    try {
      const uploaded: MediaItem[] = []
      for (const file of files) {
        const result = await api.admin.catalog.uploadMedia(file)
        uploaded.push({
          url: result.url,
          alt: file.name,
          sortOrder: currentCount + uploaded.length,
        })
      }
      if (kind === "image") setImages((current) => [...current, ...uploaded])
      else setVideos((current) => [...current, ...uploaded])
      notify(`${uploaded.length} fichier(s) téléversé(s).`, "success")
    } catch (error) {
      notify(errorMessage(error), "error")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="overlay centered"
      onClick={() => {
        if (!submitting && !uploading) onClose()
      }}
    >
      <div
        className="staff-modal catalog-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-product-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="staff-modal-head">
          <div>
            <span className="eyebrow">
              {product ? "Catalogue" : "Nouveau catalogue"}
            </span>
            <h2 id="catalog-product-title">
              {product ? "Modifier le contenu" : "Ajouter un contenu"}
            </h2>
            <p>
              Renseignez les tarifs, caractéristiques et médias. Images : 8 Mo
              maximum ; vidéos : 32 Mo maximum.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={submitting || uploading}
            aria-label="Fermer"
          >
            <Icon name="x" />
          </button>
        </div>
        <form
          className="staff-modal-form"
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const name = String(form.get("name") ?? "").trim()
            const categoryId = String(form.get("categoryId") ?? "").trim()
            const priceRaw = String(form.get("price") ?? "").trim()
            const price = Number(priceRaw)
            if (!name) {
              notify("Le nom du contenu est obligatoire.", "error")
              return
            }
            if (!categoryId) {
              notify("La catégorie est obligatoire.", "error")
              return
            }
            if (!priceRaw || Number.isNaN(price) || price < 0) {
              notify(
                "Le prix est obligatoire et doit être un nombre valide.",
                "error",
              )
              return
            }
            const specs = Object.fromEntries(
              String(form.get("specs") ?? "")
                .split("\n")
                .map((row) => row.trim())
                .filter(Boolean)
                .map((row) => {
                  const separator = row.indexOf(":")
                  return separator < 0
                    ? [row, ""]
                    : [
                        row.slice(0, separator).trim(),
                        row.slice(separator + 1).trim(),
                      ]
                })
                .filter(([key, value]) => key && value),
            )
            if (uploading) {
              notify(
                "Attendez la fin des téléversements avant d’enregistrer.",
                "error",
              )
              return
            }
            if (images.length === 0) {
              notify(
                "Téléversez au moins une image avant d’enregistrer cette fiche.",
                "error",
              )
              return
            }
            const wholesalePrices = tiers.map((tier) => ({
              minQuantity: Number(tier.minQuantity),
              maxQuantity: tier.maxQuantity ? Number(tier.maxQuantity) : null,
              unitPrice: Number(tier.unitPrice),
            }))
            const payload = {
              categoryId: String(form.get("categoryId") ?? ""),
              name,
              sku: String(form.get("sku") ?? "").trim(),
              type,
              shortDescription: String(
                form.get("shortDescription") ?? "",
              ).trim(),
              description: String(form.get("description") ?? "").trim(),
              price,
              previousPrice: String(form.get("previousPrice") ?? "")
                ? Number(form.get("previousPrice"))
                : null,
              cartonPrice:
                type === "DRINK" && String(form.get("cartonPrice") ?? "")
                  ? Number(form.get("cartonPrice"))
                  : null,
              quoteOnly: form.get("quoteOnly") === "on",
              specs,
              stock:
                type === "SERVICE"
                  ? null
                  : String(form.get("stock") ?? "")
                    ? Number(form.get("stock"))
                    : null,
              manageStock:
                type !== "SERVICE" && form.get("manageStock") === "on",
              available: form.get("available") === "on",
              active: form.get("active") === "on",
              featured: form.get("featured") === "on",
              sortOrder: Number(form.get("sortOrder") || 0),
              wholesalePrices,
              images: images.map((image, sortOrder) => ({
                ...image,
                sortOrder,
              })),
              videos: videos.map((video, sortOrder) => ({
                ...video,
                sortOrder,
              })),
            }
            setSubmitting(true)
            try {
              if (product)
                await api.admin.catalog.updateProduct(product.id, payload)
              else await api.admin.catalog.createProduct(payload)
              notify(
                product
                  ? "Contenu du catalogue mis à jour."
                  : "Contenu ajouté au catalogue.",
                "success",
              )
              onSaved()
            } catch (error) {
              notify(errorMessage(error), "error")
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <div className="staff-modal-fields catalog-product-fields">
            <label>
              Nom
              <input
                name="name"
                minLength={2}
                maxLength={120}
                defaultValue={product?.name ?? ""}
                autoFocus
              />
            </label>
            <label>
              Section / type
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ProductType)}
              >
                <option value="GPS">Produit · Traceur GPS</option>
                <option value="DRINK">Produit · Boisson</option>
                <option value="SERVICE">Service</option>
              </select>
            </label>
            <label>
              Catégorie
              <select
                name="categoryId"
                value={categoryId}
                onChange={(event) => setSelectedCategoryId(event.target.value)}
              >
                {compatibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Référence / SKU
              <input
                name="sku"
                minLength={2}
                maxLength={60}
                defaultValue={product?.sku ?? ""}
              />
            </label>
            <label>
              Prix actuel (FCFA)
              <input
                type="number"
                name="price"
                min="0"
                step="1"
                defaultValue={product?.price ?? 0}
              />
            </label>
            <label>
              Prix avant (FCFA)
              <input
                type="number"
                name="previousPrice"
                min="1"
                step="1"
                defaultValue={product?.previousPrice ?? ""}
              />
            </label>
            {type === "DRINK" && (
              <label>
                Prix du carton (FCFA)
                <input
                  type="number"
                  name="cartonPrice"
                  min="1"
                  step="1"
                  defaultValue={product?.cartonPrice ?? ""}
                />
              </label>
            )}
            {type !== "SERVICE" && (
              <label>
                Stock (laisser vide si non géré)
                <input
                  type="number"
                  name="stock"
                  min="0"
                  step="1"
                  defaultValue={product?.stock ?? ""}
                />
              </label>
            )}
            <label>
              Ordre d’affichage
              <input
                type="number"
                name="sortOrder"
                min="0"
                step="1"
                defaultValue={product?.sortOrder ?? 0}
              />
            </label>
            <label className="catalog-product-wide">
              Résumé
              <input
                name="shortDescription"
                minLength={2}
                maxLength={240}
                defaultValue={product?.shortDescription ?? ""}
              />
            </label>
            <label className="catalog-product-wide">
              Description complète
              <textarea
                name="description"
                minLength={2}
                maxLength={5000}
                rows={4}
                defaultValue={product?.description ?? ""}
              />
            </label>
            <label className="catalog-product-wide">
              Caractéristiques (une par ligne : « Nom : valeur »)
              <textarea
                name="specs"
                rows={4}
                defaultValue={Object.entries(product?.specs ?? {})
                  .map(([key, value]) => `${key} : ${value}`)
                  .join("\n")}
                placeholder={"Contenance : 33 cl\nMarque : Exemple"}
              />
            </label>
            <section className="catalog-tier-editor catalog-product-wide">
              <h3>Prix dégressifs — ventes en gros</h3>
              <p>
                Facultatif, 5 paliers maximum. Une quantité maximale vide
                signifie « illimité ».
              </p>
              {tiers.map((tier, index) => (
                <div className="catalog-tier-row" key={index}>
                  <input
                    aria-label={`Quantité minimale du palier ${index + 1}`}
                    type="number"
                    min="1"
                    step="1"
                    value={tier.minQuantity}
                    placeholder="Qté min"
                    onChange={(event) =>
                      setTiers((current) =>
                        current.map((item, row) =>
                          row === index
                            ? { ...item, minQuantity: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Quantité maximale du palier ${index + 1}`}
                    type="number"
                    min="1"
                    step="1"
                    value={tier.maxQuantity}
                    placeholder="Qté max (vide = ∞)"
                    onChange={(event) =>
                      setTiers((current) =>
                        current.map((item, row) =>
                          row === index
                            ? { ...item, maxQuantity: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Prix FCFA du palier ${index + 1}`}
                    type="number"
                    min="1"
                    step="1"
                    value={tier.unitPrice}
                    placeholder="Prix FCFA"
                    onChange={(event) =>
                      setTiers((current) =>
                        current.map((item, row) =>
                          row === index
                            ? { ...item, unitPrice: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="tier-remove"
                    onClick={() =>
                      setTiers((current) =>
                        current.filter((_, row) => row !== index),
                      )
                    }
                    aria-label={`Supprimer le palier ${index + 1}`}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
              {tiers.length < 5 && (
                <button
                  type="button"
                  className="secondary small catalog-add-tier"
                  onClick={() =>
                    setTiers((current) => [
                      ...current,
                      { minQuantity: "", maxQuantity: "", unitPrice: "" },
                    ])
                  }
                >
                  <Icon name="plus" size={15} /> Ajouter un palier
                </button>
              )}
            </section>
            <section className="catalog-media-editor catalog-product-wide">
              <h3>
                Images{" "}
                <span className="catalog-media-required">
                  Obligatoire · au moins 1
                </span>
              </h3>
              <label className="catalog-file-picker">
                <span className="catalog-file-picker-icon">
                  <Icon name="attach" size={22} />
                </span>
                <span className="catalog-file-picker-copy">
                  <strong>
                    {images.length
                      ? "Ajouter d’autres images"
                      : "Choisir les images du produit ou service"}
                  </strong>
                  <small>
                    JPEG, PNG, WebP ou AVIF · 8 Mo maximum par image ·{" "}
                    {images.length}/8 ajoutée(s)
                  </small>
                </span>
                <span className="catalog-file-picker-action">Parcourir</span>
                <input
                  className="catalog-file-input"
                  type="file"
                  accept="image/jpeg,image/gif,image/png,image/webp,image/avif"
                  multiple
                  disabled={uploading || images.length >= 8}
                  onChange={(event) => void uploadFiles(event, "image")}
                />
              </label>
              {images.length === 0 && (
                <p className="catalog-media-hint" role="status">
                  Téléversez au moins une image pour pouvoir enregistrer cette
                  fiche.
                </p>
              )}
              <div className="catalog-upload-list">
                {images.map((image, index) => (
                  <div
                    className="catalog-upload-item"
                    key={`${image.url}-${index}`}
                  >
                    <img src={image.url} alt={image.alt || ""} />
                    <span>{image.alt}</span>
                    <button
                      type="button"
                      className="tier-remove"
                      onClick={() =>
                        setImages((current) =>
                          current.filter((_, item) => item !== index),
                        )
                      }
                      aria-label="Retirer cette image"
                    >
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section className="catalog-media-editor catalog-product-wide">
              <h3>Vidéos</h3>
              <label className="catalog-file-picker">
                <span className="catalog-file-picker-icon">
                  <Icon name="play" size={22} />
                </span>
                <span className="catalog-file-picker-copy">
                  <strong>
                    {videos.length
                      ? "Ajouter d’autres vidéos"
                      : "Choisir des vidéos de présentation"}
                  </strong>
                  <small>
                    MP4, MOV ou WebM · 32 Mo maximum par vidéo · {videos.length}
                    /8 ajoutée(s)
                  </small>
                </span>
                <span className="catalog-file-picker-action">Parcourir</span>
                <input
                  className="catalog-file-input"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  multiple
                  disabled={uploading || videos.length >= 8}
                  onChange={(event) => void uploadFiles(event, "video")}
                />
              </label>
              <div className="catalog-upload-list">
                {videos.map((video, index) => (
                  <div
                    className="catalog-upload-item"
                    key={`${video.url}-${index}`}
                  >
                    <video
                      src={video.url}
                      aria-label={video.alt || "Aperçu de la vidéo"}
                    />
                    <span>{video.alt}</span>
                    <button
                      type="button"
                      className="tier-remove"
                      onClick={() =>
                        setVideos((current) =>
                          current.filter((_, item) => item !== index),
                        )
                      }
                      aria-label="Retirer cette vidéo"
                    >
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                ))}
              </div>
              {uploading && <small>Téléversement en cours…</small>}
            </section>
            <div className="catalog-product-checks catalog-product-wide">
              {[
                [
                  "available",
                  "Disponible à la commande",
                  product?.available ?? true,
                ],
                ["active", "Publié dans la boutique", product?.active ?? true],
                ["featured", "Mis en avant", product?.featured ?? false],
                ...(type !== "SERVICE"
                  ? [
                      [
                        "manageStock",
                        "Gérer le stock",
                        product?.manageStock ?? false,
                      ],
                    ]
                  : []),
                [
                  "quoteOnly",
                  "Demande de devis uniquement",
                  product?.quoteOnly ?? false,
                ],
              ].map(([field, label, checked]) => (
                <label key={String(field)}>
                  <input
                    type="checkbox"
                    name={String(field)}
                    defaultChecked={Boolean(checked)}
                  />
                  {String(label)}
                </label>
              ))}
            </div>
          </div>
          {compatibleCategories.length === 0 && (
            <Alert tone="error">
              Aucune catégorie n’est configurée pour ce type. Créez d’abord une
              catégorie dans la base du catalogue.
            </Alert>
          )}
          <div className="staff-modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={submitting || uploading}
            >
              Annuler
            </button>
            <button
              className="primary"
              type="submit"
              disabled={
                submitting || uploading || compatibleCategories.length === 0
              }
            >
              {submitting
                ? "Enregistrement…"
                : product
                  ? "Enregistrer"
                  : "Créer le contenu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateUserModal({
  member,
  onClose,
  onCreated,
  notify,
}: {
  member: StaffUser | null
  onClose: () => void
  onCreated: () => void
  notify: (message: string, tone?: "success" | "error" | "info") => void
}) {
  const [submitting, setSubmitting] = useState(false)

  return (
    <div
      className="overlay centered"
      onClick={() => {
        if (!submitting) onClose()
      }}
    >
      <div
        className="staff-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-user-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="staff-modal-head">
          <div>
            <span className="eyebrow">Personnel</span>
            <h2 id="staff-user-title">
              {member ? "Modifier un membre" : "Ajouter un membre"}
            </h2>
            <p>
              {member
                ? "Mettez à jour les informations et le rôle de ce compte."
                : "Un mot de passe provisoire sera généré et envoyé par email. Le membre devra le changer dès sa première connexion."}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
          >
            <Icon name="x" />
          </button>
        </div>
        <form
          className="staff-modal-form"
          onSubmit={async (event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            setSubmitting(true)
            try {
              const payload = {
                name: String(form.get("name") ?? "").trim(),
                email: String(form.get("email") ?? "").trim(),
                role: String(form.get("role") ?? "COMMERCIAL"),
                phone: String(form.get("phone") ?? "").trim(),
              }
              if (member) {
                await api.admin.updateUser(member.id, payload)
                notify("Compte mis à jour.", "success")
              } else {
                await api.admin.createUser(payload)
                notify(
                  "Compte créé. Un email avec le mot de passe provisoire a été envoyé.",
                  "success",
                )
              }
              onCreated()
            } catch (error) {
              notify(errorMessage(error), "error")
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <div className="staff-modal-fields">
            <label>
              Nom complet
              <input
                required
                name="name"
                minLength={2}
                maxLength={120}
                defaultValue={member?.name}
                autoFocus
              />
            </label>
            <label>
              Email professionnel
              <input
                required
                type="email"
                name="email"
                maxLength={160}
                defaultValue={member?.email}
              />
            </label>
            <label>
              Téléphone facultatif
              <input
                name="phone"
                maxLength={30}
                defaultValue={member?.phone ?? ""}
              />
            </label>
            <label>
              Rôle
              <select name="role" defaultValue={member?.role ?? "COMMERCIAL"}>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="staff-modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Annuler
            </button>
            <button className="primary" type="submit" disabled={submitting}>
              {submitting
                ? member
                  ? "Enregistrement…"
                  : "Création…"
                : member
                  ? "Enregistrer"
                  : "Créer le compte"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
