import { useEffect, useState } from "react"
import { Icon } from "./components/Icon"
import { ChatWidget } from "./components/ChatWidget"
import { StaffAssistantAlerts } from "./components/StaffAssistantAlerts"
import { useStore } from "./context/StoreContext"
import { initAnalytics, trackPageview } from "./lib/analytics"
import { AdminPage } from "./pages/AdminPage"
import { CartPage } from "./pages/CartPage"
import { CatalogPage } from "./pages/CatalogPage"
import { CheckoutPage } from "./pages/CheckoutPage"
import { ConfirmationPage } from "./pages/ConfirmationPage"
import { HomePage } from "./pages/HomePage"
import { InfoPage } from "./pages/InfoPage"
import { ProductPage } from "./pages/ProductPage"
import { ServicesPage, ServiceDetailPage } from "./pages/ServicesPage"
import { StaffPage } from "./pages/StaffPage"
import { CashRegisterPage } from "./pages/CashRegisterPage"
import { TrackingPage } from "./pages/TrackingPage"
import { BRAND_LOGO } from "./lib/brand"
import { formatPrice } from "./lib/format"
import { productPriceForQuantity } from "./lib/catalog"
import { productImage } from "./components/ProductCard"

type Navigate = (path: string) => void

const normalizeRoute = (pathname: string) =>
  pathname === "/index.html" ? "/" : pathname || "/"

export default function App() {
  const [route, setRoute] = useState(() =>
    normalizeRoute(window.location.pathname),
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const {
    cartLines,
    cartCount,
    cartSubtotal,
    setQuantity,
    removeFromCart,
    toast,
    dismissToast,
  } = useStore()

  useEffect(() => {
    initAnalytics()
    trackPageview(route)
  }, [route])

  useEffect(() => {
    const syncRoute = () => setRoute(normalizeRoute(window.location.pathname))
    window.addEventListener("popstate", syncRoute)
    return () => window.removeEventListener("popstate", syncRoute)
  }, [])

  const navigate: Navigate = (path) => {
    if (path !== window.location.pathname)
      window.history.pushState({}, "", path)
    setRoute(normalizeRoute(path))
    setMenuOpen(false)
    setCartOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const scrollTo = (id: string) => {
    if (route !== "/") {
      navigate("/")
      window.setTimeout(
        () =>
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }),
        60,
      )
      return
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
    setMenuOpen(false)
  }

  if (route === "/admin") return <AdminPage navigate={navigate} />
  if (route === "/staff" || route === "/conseiller")
    return <StaffPage navigate={navigate} />

  const renderPage = () => {
    if (route === "/")
      return (
        <HomePage
          navigate={navigate}
          scrollTo={scrollTo}
          onAdvisor={() => setChatOpen(true)}
        />
      )
    if (route === "/traceurs")
      return <CatalogPage type="gps" navigate={navigate} />
    if (route === "/boissons")
      return <CatalogPage type="drink" navigate={navigate} />
    if (route === "/services") return <ServicesPage navigate={navigate} />
    if (route.startsWith("/service/"))
      return (
        <ServiceDetailPage
          id={route.split("/").pop() ?? ""}
          navigate={navigate}
        />
      )
    if (route.startsWith("/produit/"))
      return (
        <ProductPage id={route.split("/").pop() ?? ""} navigate={navigate} />
      )
    if (route === "/panier") return <CartPage navigate={navigate} />
    if (route === "/commande") return <CheckoutPage navigate={navigate} />
    if (route === "/confirmation")
      return <ConfirmationPage navigate={navigate} />
    if (route === "/suivi") return <TrackingPage navigate={navigate} />
    if (route.startsWith("/suivi/"))
      return (
        <TrackingPage code={route.split("/").pop() ?? ""} navigate={navigate} />
      )
    if (route === "/encaissement")
      return <CashRegisterPage navigate={navigate} />
    if (route === "/a-propos") return <InfoPage type="about" />
    if (route === "/contact") return <InfoPage type="contact" />
    return <InfoPage type="contact" />
  }

  const navItems = [
    { label: "Accueil", path: "/" },
    { label: "Traceurs GPS", path: "/traceurs" },
    { label: "Boissons", path: "/boissons" },
    { label: "Nos services", path: "/services" },
    { label: "À propos", path: "/a-propos" },
    { label: "Contact", path: "/contact" },
  ]

  return (
    <div className="app">
      <div className="topbar">
        <div className="shell topbar-inner">
          <p>
            <Icon name="headset" size={16} /> Besoin d’aide pour choisir votre
            traceur ?
          </p>
          <div className="topbar-actions">
            <button className="topbar-link" onClick={() => navigate("/suivi")}>
              Suivre ma commande <Icon name="map" size={15} />
            </button>
            <button
              className="topbar-link"
              onClick={() => navigate("/encaissement")}
            >
              Encaissement espèces <Icon name="bag" size={15} />
            </button>
            <button className="topbar-link" onClick={() => setChatOpen(true)}>
              Parler à un conseiller <Icon name="arrow" size={15} />
            </button>
          </div>
        </div>
      </div>

      <header className="header">
        <div className="shell nav">
          <button
            className="icon-btn menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Ouvrir le menu"
          >
            <Icon name={menuOpen ? "x" : "menu"} />
          </button>
          <button
            className="brand"
            onClick={() => navigate("/")}
            aria-label="Allo Togo Store, accueil"
          >
            <img src={BRAND_LOGO} alt="Allo Togo" />
            <span>
              <strong>ALLO TOGO</strong>
              <small>STORE</small>
            </span>
          </button>
          <nav className={menuOpen ? "navlinks open" : "navlinks"}>
            {navItems.map((item) => {
              const active =
                item.path === "/"
                  ? route === "/"
                  : item.path === "/traceurs"
                    ? route === "/traceurs" || route.startsWith("/produit/")
                    : item.path === "/services"
                      ? route === "/services" || route.startsWith("/service/")
                      : route === item.path
              return (
                <button
                  className={active ? "active" : ""}
                  onClick={() => navigate(item.path)}
                  key={item.path}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="nav-actions">
            <button
              className="icon-btn search-button"
              aria-label="Rechercher"
              onClick={() => navigate("/traceurs")}
            >
              <Icon name="search" />
            </button>
            <button
              className="icon-btn cart-button"
              onClick={() => setCartOpen(true)}
              aria-label={`Panier, ${cartCount} articles`}
            >
              <Icon name="bag" />
              <span>{cartCount}</span>
            </button>
            <button
              className="primary small desktop-cta"
              onClick={() => navigate("/traceurs")}
            >
              Nos traceurs <Icon name="arrow" size={17} />
            </button>
          </div>
        </div>
      </header>

      {renderPage()}

      <footer>
        <div className="shell footer-grid">
          <div className="footer-brand">
            <div className="brand inverse">
              <img src={BRAND_LOGO} alt="" />
              <span>
                <strong>ALLO TOGO</strong>
                <small>STORE</small>
              </span>
            </div>
            <p>
              La boutique de solutions GPS, produits et services d’Allo Togo
              Conciergerie Tech-IA.
            </p>
          </div>
          <div>
            <h3>La boutique</h3>
            <button onClick={() => navigate("/traceurs")}>Traceurs GPS</button>
            <button onClick={() => navigate("/boissons")}>Boissons</button>
            <button onClick={() => navigate("/services")}>
              Packs de services
            </button>
            <button onClick={() => navigate("/panier")}>Mon panier</button>
          </div>
          <div>
            <h3>Informations</h3>
            <button onClick={() => navigate("/suivi")}>
              Suivre une commande
            </button>
            <button onClick={() => navigate("/contact")}>
              Livraison & installation
            </button>
            <button onClick={() => navigate("/contact")}>
              Conditions générales
            </button>
            <button onClick={() => navigate("/contact")}>
              Confidentialité
            </button>
          </div>
          <div>
            <h3>Nous contacter</h3>
            <p>Lomé, Togo</p>
            <a
              href="https://www.allotogoconciergerietech-ia.com/"
              target="_blank"
              rel="noreferrer"
            >
              Site officiel
            </a>
            <button className="whatsapp" onClick={() => navigate("/contact")}>
              <Icon name="whatsapp" /> WhatsApp
            </button>
            <button onClick={() => navigate("/staff")}>
              Espace intervenant
            </button>
            <button onClick={() => navigate("/admin")}>
              Espace de gestion
            </button>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© 2026 Allo Togo Store. Tous droits réservés.</span>
          <span>
            Paiement à la livraison, au retrait ou en agence, avant validation.
          </span>
        </div>
      </footer>

      <MobileNavigation route={route} navigate={navigate} />
      <ChatWidget open={chatOpen} setOpen={setChatOpen} navigate={navigate} />
      <StaffAssistantAlerts navigate={navigate} />

      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          <span>{toast.message}</span>
          <button onClick={dismissToast} aria-label="Fermer">
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <aside
            className="cart-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span>Votre panier</span>
                <strong>
                  {cartCount} article{cartCount !== 1 ? "s" : ""}
                </strong>
              </div>
              <button
                className="icon-btn"
                onClick={() => setCartOpen(false)}
                aria-label="Fermer le panier"
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="drawer-body">
              {cartCount === 0 ? (
                <div className="empty-cart">
                  <div>
                    <Icon name="bag" size={32} />
                  </div>
                  <h3>Votre panier est vide</h3>
                  <p>
                    Découvrez nos solutions GPS et ajoutez le modèle qui vous
                    intéresse.
                  </p>
                  <button
                    className="primary"
                    onClick={() => navigate("/traceurs")}
                  >
                    Voir les traceurs
                  </button>
                </div>
              ) : (
                cartLines.map(({ product, quantity }) => (
                  <article className="cart-item" key={product.id}>
                    <img src={productImage(product)} alt="" />
                    <div>
                      <h3>{product.name}</h3>
                      <span>
                        {formatPrice(
                          productPriceForQuantity(product, quantity),
                        )}
                      </span>
                      <div className="qty">
                        <button
                          onClick={() => setQuantity(product.id, quantity - 1)}
                          aria-label="Diminuer"
                        >
                          <Icon name="minus" size={15} />
                        </button>
                        <b>{quantity}</b>
                        <button
                          onClick={() => setQuantity(product.id, quantity + 1)}
                          aria-label="Augmenter"
                        >
                          <Icon name="plus" size={15} />
                        </button>
                        <button
                          className="drawer-remove"
                          onClick={() => removeFromCart(product.id)}
                          aria-label="Retirer"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
            {cartCount > 0 && (
              <div className="drawer-foot">
                <div>
                  <span>Total produits</span>
                  <strong>{formatPrice(cartSubtotal)}</strong>
                </div>
                <p>
                  Paiement à la livraison, au retrait ou en agence, avant
                  validation.
                </p>
                <button
                  className="primary wide"
                  onClick={() => navigate("/panier")}
                >
                  Voir le panier <Icon name="arrow" />
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function MobileNavigation({
  route,
  navigate,
}: {
  route: string
  navigate: Navigate
}) {
  const items: {
    label: string
    path: string
    icon: "home" | "tracker" | "can" | "services" | "headset"
    active: boolean
  }[] = [
    { label: "Accueil", path: "/", icon: "home", active: route === "/" },
    {
      label: "GPS",
      path: "/traceurs",
      icon: "tracker",
      active: route === "/traceurs" || route.startsWith("/produit/"),
    },
    {
      label: "Boissons",
      path: "/boissons",
      icon: "can",
      active: route === "/boissons",
    },
    {
      label: "Services",
      path: "/services",
      icon: "services",
      active: route.startsWith("/service"),
    },
    {
      label: "Suivi",
      path: "/suivi",
      icon: "headset",
      active:
        route === "/suivi" ||
        route.startsWith("/suivi/") ||
        route === "/contact" ||
        route === "/a-propos",
    },
  ]
  return (
    <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
      {items.map((item) => (
        <button
          key={item.path}
          className={item.active ? "active" : ""}
          onClick={() => navigate(item.path)}
          aria-label={item.label}
        >
          <span>
            <Icon name={item.icon} size={21} />
          </span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  )
}
