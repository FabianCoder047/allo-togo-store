import type { ReactNode } from 'react'
import { Icon } from './Icon'
import {
  orderStatusLabel,
  orderStatusLabels,
  orderStatusSteps,
  operationalStatusLabels,
  paymentStatusLabels,
  statusTone,
  terminalOrderStatuses,
} from '../lib/labels'

export function PageHero({
  eyebrow,
  title,
  text,
  image,
  imageAlt,
  imageClassName,
  badge,
}: {
  eyebrow: string
  title: string
  text: string
  image?: string
  imageAlt?: string
  imageClassName?: string
  badge?: ReactNode
}) {
  return (
    <section className="page-hero">
      <div className={`shell ${image ? 'page-hero-grid' : ''}`}>
        <div className="page-hero-copy">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{text}</p>
        </div>
        {image && (
          <div className={`page-hero-visual ${imageClassName ?? ''}`}>
            <img src={image} alt={imageAlt ?? ''} />
            {badge && <span className="page-hero-badge">{badge}</span>}
          </div>
        )}
      </div>
    </section>
  )
}

export function SectionTitle({
  eyebrow,
  title,
  text,
  center = false,
}: {
  eyebrow: string
  title: string
  text?: string
  center?: boolean
}) {
  return (
    <div className={`section-heading ${center ? 'center' : ''}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  )
}

export function StatusBadge({
  status,
  kind = 'order',
  fulfillmentMode,
}: {
  status: string
  kind?: 'order' | 'operational' | 'payment' | 'quote'
  fulfillmentMode?: string
}) {
  const label =
    kind === 'order'
      ? orderStatusLabel(status, fulfillmentMode)
      : kind === 'operational'
        ? (operationalStatusLabels[status] ?? status)
        : kind === 'payment'
          ? (paymentStatusLabels[status] ?? status)
          : (orderStatusLabels[status] ?? operationalStatusLabels[status] ?? status)
  return <span className={`status ${statusTone(status)}`}>{label}</span>
}

/**
 * Progression du parcours : une seule occurrence par étape, index courant
 * déterminé par le code métier renvoyé par l'API — jamais par la position DOM.
 * - étape courante : vert clignotant (désactivé si prefers-reduced-motion)
 * - étapes franchies : gris
 * - étapes à venir : jaune
 * - statut terminal : résultat final, aucune étape « à venir » artificielle
 */
export function OrderProgress({
  status,
  fulfillmentMode,
  reachedStatuses = [],
}: {
  status: string
  fulfillmentMode: string
  reachedStatuses?: string[]
}) {
  const steps = orderStatusSteps(fulfillmentMode)
  const reached = new Set([...reachedStatuses, status])
  const negativeTerminal = ['ECHEC_LIVRAISON', 'REJETEE', 'ANNULEE'].includes(status)
  const isTerminal = terminalOrderStatuses.includes(status)
  const currentIndex = steps.indexOf(status)
  const reachedIndex = steps.reduce((max, step, index) => (reached.has(step) ? index : max), 0)
  // Pour un statut négatif, on n'affiche que les étapes réellement franchies :
  // afficher la suite en jaune laisserait croire que le parcours continue.
  const visibleSteps = negativeTerminal ? steps.slice(0, reachedIndex + 1) : steps

  return (
    <div className="order-progress" aria-label="Progression de la commande">
      <ol>
        {visibleSteps.map((step) => {
          const index = steps.indexOf(step)
          const delivered = status === 'LIVREE'
          const current = delivered ? step === 'LIVREE' : !negativeTerminal && index === currentIndex
          const previous = !current && (delivered || negativeTerminal || index < currentIndex)
          return (
            <li
              key={step}
              className={current ? 'current' : previous ? 'previous' : 'upcoming'}
              aria-current={current ? 'step' : undefined}
            >
              <span className="order-progress-badge">
                <span className="order-progress-dot" />
                <span>{orderStatusLabel(step, fulfillmentMode)}</span>
              </span>
            </li>
          )
        })}
      </ol>
      {isTerminal && (
        <div className="order-progress-terminal">
          <StatusBadge status={status} fulfillmentMode={fulfillmentMode} />
        </div>
      )}
    </div>
  )
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="state-block">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-block error">
      <Icon name="shield" size={28} />
      <h3>Impossible de charger les données</h3>
      <p>{message}</p>
      {onRetry && (
        <button className="secondary" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="state-block">
      <div className="state-icon">
        <Icon name="bag" size={26} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error' | 'warning'; children: ReactNode }) {
  return <div className={`alert ${tone}`}>{children}</div>
}

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string
  hint?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b aria-hidden="true"> *</b>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
