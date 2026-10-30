import type { ReactNode } from "react"
import { Icon, type IconName } from "./Icon"
import { BRAND_LOGO } from "../lib/brand"
import { initials } from "../lib/format"

export interface DashboardNavItem {
  id: string
  label: string
  shortLabel: string
  icon: IconName
}

/**
 * Barre supérieure des dashboards sur mobile et tablette : le logo reste
 * visible, comme sur la boutique, sans reprendre la sidebar desktop.
 */
export function DashboardMobileBar({
  area,
  userName,
  onHome,
  onLogout,
  extraActions,
}: {
  area: string
  userName: string
  onHome: () => void
  onLogout: () => void
  extraActions?: ReactNode
}) {
  return (
    <header className="dashboard-mobile-bar">
      <button
        className="brand"
        onClick={onHome}
        aria-label={`Allo Togo ${area}, retour à la boutique`}
      >
        <img src={BRAND_LOGO} alt="" />
        <span>
          <strong>ALLO TOGO</strong>
          <small>{area}</small>
        </span>
      </button>
      <div className="dashboard-mobile-actions">
        {extraActions}
        <span className="dashboard-mobile-user" title={userName}>
          {initials(userName)}
        </span>
        <button
          className="icon-btn"
          onClick={onHome}
          aria-label="Voir la boutique"
        >
          <Icon name="home" size={19} />
        </button>
        <button
          className="icon-btn"
          onClick={onLogout}
          aria-label="Se déconnecter"
        >
          <Icon name="logout" size={19} />
        </button>
      </div>
    </header>
  )
}

/**
 * Navigation basse façon boutique (pilule sombre, pastille orange active).
 * Utilisée uniquement sous 1024 px, la sidebar reprend la main au-dessus.
 */
export function DashboardBottomNav({
  items,
  active,
  onSelect,
}: {
  items: DashboardNavItem[]
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <nav
      className={`mobile-bottom-nav dashboard-bottom-nav cols-${items.length}`}
      aria-label="Navigation du tableau de bord"
    >
      {items.map((item) => (
        <button
          key={item.id}
          className={active === item.id ? "active" : ""}
          onClick={() => onSelect(item.id)}
          aria-current={active === item.id ? "page" : undefined}
        >
          <span>
            <Icon name={item.icon} size={20} />
          </span>
          <small>{item.shortLabel}</small>
        </button>
      ))}
    </nav>
  )
}
