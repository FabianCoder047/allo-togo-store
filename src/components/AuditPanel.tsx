import { useCallback, useEffect, useMemo, useState } from "react"
import { Icon } from "./Icon"
import { Alert, LoadingState } from "./ui"
import { api, errorMessage } from "../lib/api"
import { formatDate } from "../lib/format"
import { roleLabels } from "../lib/labels"
import type { AuditLogEntry } from "../types"

const actionLabels: Record<string, string> = {
  AUTH_LOGIN: "Connexion",
  AUTH_PROFILE_UPDATED: "Profil modifié",
  AUTH_PASSWORD_CHANGED: "Mot de passe changé",
  USER_CREATED: "Compte créé",
  USER_UPDATED: "Compte modifié",
  USER_DEACTIVATED: "Compte désactivé",
  USER_PASSWORD_RESET: "Mot de passe réinitialisé",
  ORDER_GROUP_CREATED: "Commande créée",
  ORDER_CONFIRMED: "Commande confirmée",
  ORDER_REJECTED: "Commande rejetée",
  ORDER_ASSIGNED: "Commande affectée",
  ORDER_COURSE_STARTED: "Livraison démarrée",
  ORDER_DELIVERED: "Commande livrée",
  ORDER_DELIVERY_FAILED: "Échec de livraison",
  ORDER_PICKED_UP: "Retrait en agence",
  ORDER_CANCELLED: "Commande annulée",
  ORDER_NOTE_ADDED: "Note ajoutée",
  PAYMENT_RECORDED: "Paiement enregistré",
  CUSTOMER_PAYMENT_CHOICE_SET: "Choix de paiement client",
  CUSTOMER_MOBILE_MONEY_DECLARED: "Paiement mobile déclaré par le client",
  BICTORYS_ATTEMPT_CREATED: "Paiement en ligne initié",
  PICKUP_ORDER_EXPIRED: "Retrait expiré",
  QUOTE_CREATED: "Devis demandé",
  QUOTE_UPDATED: "Devis mis à jour",
  PRODUCT_CREATED: "Contenu créé",
  PRODUCT_UPDATED: "Contenu modifié",
  PRODUCT_DELETED: "Contenu supprimé",
  CATEGORY_CREATED: "Catégorie créée",
  CATEGORY_UPDATED: "Catégorie modifiée",
  STOCK_ADJUSTED: "Stock ajusté",
}

export const auditActionLabel = (action: string) =>
  actionLabels[action] ?? action

const entityLabels: Record<string, string> = {
  User: "Compte",
  Order: "Commande",
  OrderGroup: "Groupe de commandes",
  Payment: "Paiement",
  PaymentAttempt: "Tentative de paiement",
  QuoteRequest: "Devis",
  Product: "Catalogue",
  Category: "Catégorie",
  Auth: "Session",
  System: "Système",
}

export const auditEntityLabel = (entity: string) =>
  entityLabels[entity] ?? entity

const actorTypeLabels: Record<AuditLogEntry["actorType"], string> = {
  STAFF: "Personnel",
  CLIENT: "Client",
  SYSTEM: "Système",
}

const metadataLabels: Record<string, string> = {
  amount: "Montant",
  categoryType: "Catégorie",
  choice: "Choix de paiement",
  comment: "Commentaire",
  credentialsEmailSent: "Identifiants envoyés par courriel",
  email: "Adresse courriel",
  id: "Identifiant",
  idempotencyKey: "Clé d’opération",
  instructions: "Consignes",
  leadStaffId: "Responsable",
  name: "Nom",
  orderNumber: "Numéro de commande",
  orders: "Commandes",
  price: "Prix",
  providerRef: "Référence du paiement",
  publicRef: "Référence publique",
  pickupDeadlineAt: "Date limite de retrait",
  quantity: "Quantité",
  reason: "Motif",
  reference: "Référence",
  role: "Rôle",
  requiredRoles: "Rôles requis",
  serviceId: "Service",
  sku: "Référence produit",
  staffIds: "Intervenants",
  total: "Total",
  trackingCode: "Code de suivi",
  type: "Type",
  method: "Mode de paiement",
  phoneLastFour: "Quatre derniers chiffres du numéro",
  stage: "Étape",
  verification: "Type de vérification",
}

const metadataValueLabels: Record<string, string> = {
  ADMIN: "Informaticien",
  BICTORYS: "Paiement en ligne",
  CARTE_BANCAIRE: "Carte bancaire",
  COMMERCIAL: "Agent commercial",
  DELIVERY: "Livreur",
  DIRECTOR: "Directeur",
  DRINK: "Boisson",
  GPS: "Traceur GPS",
  MOBILE_MONEY: "Mobile Money",
  FLOOZ: "Flooz",
  MIXX_BY_YAS: "Mixx by Yas",
  CUSTOMER_DECLARATION: "Déclaration client",
  TEAM_CASH_HANDOVER: "Remise espèces de l'équipe",
  PAIEMENT_A_LA_LIVRAISON: "Paiement à la livraison",
  PAIEMENT_EN_AGENCE: "Paiement en agence",
  SERVICE: "Service",
  TECHNICIAN: "Technicien",
  VIREMENT: "Virement",
  AUTRE: "Autre",
}

export const auditActorLabel = (entry: AuditLogEntry) => {
  if (entry.actor) {
    return `${entry.actor.name} · ${roleLabels[entry.actor.role] ?? entry.actor.role}`
  }
  if (entry.actorType === "SYSTEM") return actorTypeLabels.SYSTEM
  if (entry.actorType === "CLIENT") return actorTypeLabels.CLIENT
  return "Compte supprimé"
}

export const auditActorTypeLabel = (actorType: AuditLogEntry["actorType"]) =>
  actorTypeLabels[actorType]

const metadataValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "Oui" : "Non"
  if (Array.isArray(value)) return value.map(metadataValue).join(", ")
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([key, nestedValue]) =>
          `${metadataLabels[key] ?? key} : ${metadataValue(nestedValue)}`,
      )
      .join(" · ")
  }
  const text = String(value)
  return metadataValueLabels[text] ?? roleLabels[text] ?? text
}

export const auditMetadataSummary = (metadata: unknown) => {
  if (metadata === null || metadata === undefined) return "—"
  if (typeof metadata !== "object") return metadataValue(metadata)
  const entries = Array.isArray(metadata)
    ? metadata.map((value, index) => [String(index + 1), value] as const)
    : Object.entries(metadata as Record<string, unknown>)
  if (entries.length === 0) return "—"
  return entries
    .slice(0, 3)
    .map(
      ([key, value]) =>
        `${metadataLabels[key] ?? key} : ${metadataValue(value)}`,
    )
    .join(" · ")
}

const dateToIso = (value: string, endOfDay = false) => {
  if (!value) return undefined
  return new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`,
  ).toISOString()
}

export function AuditPanel() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [action, setAction] = useState("")
  const [entity, setEntity] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.admin.audit({
        page,
        pageSize: 25,
        action: action.trim() || undefined,
        entity: entity.trim() || undefined,
        from: dateToIso(from),
        to: dateToIso(to, true),
      })
      setLogs(result.data)
      setTotal(result.pagination.total)
      setTotalPages(result.pagination.totalPages || 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [action, entity, from, page, to])

  useEffect(() => {
    void load()
  }, [load])

  const resetFilters = () => {
    setAction("")
    setEntity("")
    setFrom("")
    setTo("")
    setPage(1)
  }

  const summary = useMemo(() => {
    if (loading) return "Chargement…"
    if (!total) return "Aucune action enregistrée"
    const start = (page - 1) * 25 + 1
    const end = Math.min(page * 25, total)
    return `${start}–${end} sur ${total} action(s)`
  }, [loading, page, total])

  return (
    <div className="admin-panel audit-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Journal d’audit</h2>
          <p>
            Consultez les actions enregistrées sur les commandes, paiements,
            comptes, catalogue et connexions.
          </p>
        </div>
        <div className="admin-panel-actions">
          <span className="audit-total">
            {total} événement{total > 1 ? "s" : ""}
          </span>
          <button
            className="secondary small"
            onClick={() => void load()}
            disabled={loading}
          >
            <Icon name="rotate" size={14} />{" "}
            {loading ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      </div>

      <div className="audit-filters">
        <label>
          Action
          <select
            value={action}
            onChange={(event) => {
              setPage(1)
              setAction(event.target.value)
            }}
          >
            <option value="">Toutes les actions</option>
            {Object.entries(actionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entité
          <select
            value={entity}
            onChange={(event) => {
              setPage(1)
              setEntity(event.target.value)
            }}
          >
            <option value="">Toutes les entités</option>
            {Object.entries(entityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date de début
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setPage(1)
              setFrom(event.target.value)
            }}
          />
        </label>
        <label>
          Date de fin
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setPage(1)
              setTo(event.target.value)
            }}
          />
        </label>
        <div className="audit-filter-actions">
          <button
            className="secondary small"
            type="button"
            onClick={resetFilters}
            disabled={!action && !entity && !from && !to}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <LoadingState label="Chargement du journal d’audit…" />
      ) : logs.length === 0 ? (
        <div className="state-block">
          <h3>Aucune action trouvée</h3>
          <p>
            Modifiez les filtres ou attendez que l’activité du site soit
            enregistrée.
          </p>
        </div>
      ) : (
        <>
          <div className="audit-table-wrap">
            <div className="admin-table">
              <div className="admin-tr admin-th audit" aria-hidden="true">
                <span>Date</span>
                <span>Auteur</span>
                <span>Action</span>
                <span>Entité</span>
                <span>Détails</span>
              </div>
              {logs.map((entry) => (
                <div className="admin-tr audit" key={entry.id}>
                  <span data-label="Date et adresse IP">
                    <strong>{formatDate(entry.createdAt)}</strong>
                    <small>
                      {entry.ip
                        ? `Adresse IP : ${entry.ip}`
                        : "Adresse IP non disponible"}
                    </small>
                  </span>
                  <span data-label="Auteur">
                    <strong>{auditActorLabel(entry)}</strong>
                    <small>{auditActorTypeLabel(entry.actorType)}</small>
                  </span>
                  <span data-label="Action">
                    <strong>{auditActionLabel(entry.action)}</strong>
                  </span>
                  <span data-label="Entité">
                    <strong>{auditEntityLabel(entry.entity)}</strong>
                    <small>Référence : {entry.entityId}</small>
                  </span>
                  <span className="audit-metadata" data-label="Détails">
                    {auditMetadataSummary(entry.metadata)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-pagination">
            <span>{summary}</span>
            <div className="audit-pagination-actions">
              <button
                className="secondary small"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Page précédente
              </button>
              <span>
                Page {page} sur {totalPages}
              </span>
              <button
                className="secondary small"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Page suivante
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
