import { useCallback, useEffect, useState } from "react"
import { Icon } from "./Icon"
import { Alert, LoadingState } from "./ui"
import { api, errorMessage } from "../lib/api"
import { formatDate } from "../lib/format"
import type { TechnicalLogEntry } from "../types"

const pageSize = 50

const levelLabels: Record<TechnicalLogEntry["level"], string> = {
  trace: "Détail",
  debug: "Débogage",
  info: "Information",
  warn: "Avertissement",
  error: "Erreur",
  fatal: "Critique",
}

const dateToIso = (value: string, endOfDay = false) => {
  if (!value) return undefined
  return new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`,
  ).toISOString()
}

export function TechnicalLogsPanel() {
  const [logs, setLogs] = useState<TechnicalLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [appliedFrom, setAppliedFrom] = useState("")
  const [appliedTo, setAppliedTo] = useState("")
  const [level, setLevel] = useState("")
  const [appliedLevel, setAppliedLevel] = useState("")
  const [filterError, setFilterError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.admin.technicalLogs({
        page,
        pageSize,
        from: dateToIso(appliedFrom),
        to: dateToIso(appliedTo, true),
        level: appliedLevel || undefined,
      })
      setLogs(result.data)
      setTotal(result.pagination.total)
      setTotalPages(result.pagination.totalPages || 1)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [appliedFrom, appliedLevel, appliedTo, page])

  useEffect(() => {
    void load()
  }, [load])

  const applyFilters = () => {
    if (Boolean(from) !== Boolean(to)) {
      setFilterError("Renseignez les deux dates pour filtrer une période.")
      return
    }
    if (from && to && from > to) {
      setFilterError("La date de début doit précéder la date de fin.")
      return
    }
    setFilterError(null)
    setPage(1)
    setAppliedFrom(from)
    setAppliedTo(to)
    setAppliedLevel(level)
  }

  const showAll = () => {
    setFrom("")
    setTo("")
    setLevel("")
    setAppliedFrom("")
    setAppliedTo("")
    setAppliedLevel("")
    setFilterError(null)
    setPage(1)
  }

  return (
    <section className="admin-panel technical-logs-panel">
      <div className="admin-panel-head">
        <div>
          <span className="eyebrow">Accès informaticien uniquement</span>
          <h2>Logs techniques de l’application</h2>
          <p>
            Événements du code et du serveur, conservés pendant 30 jours.
            Ce journal est distinct de l’audit des actions utilisateurs.
          </p>
        </div>
        <div className="technical-logs-actions">
          <span className="technical-logs-total">
            {total} ligne{total === 1 ? "" : "s"}
          </span>
          <button
            className="secondary small"
            onClick={() => void load()}
            disabled={loading}
          >
            <Icon name="rotate" size={14} />
            {loading ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      </div>

      <div className="technical-logs-filters">
        <label>
          Date de début
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFilterError(null)
              setFrom(event.target.value)
            }}
          />
        </label>
        <label>
          Date de fin
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => {
              setFilterError(null)
              setTo(event.target.value)
            }}
          />
        </label>
        <label>
          Niveau
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="">Tous les niveaux</option>
            {Object.entries(levelLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <div className="technical-logs-filter-actions">
          <button
            className="secondary small"
            onClick={showAll}
            disabled={!appliedFrom && !appliedTo && !appliedLevel}
          >
            Tout afficher
          </button>
          <button
            className="primary small"
            onClick={applyFilters}
            disabled={loading}
          >
            Filtrer
          </button>
        </div>
      </div>

      {filterError && <div className="technical-logs-filter-error">{filterError}</div>}
      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <LoadingState label="Chargement des logs techniques…" />
      ) : logs.length === 0 ? (
        <div className="technical-logs-empty">
          <Icon name="shield" size={23} />
          <strong>Aucun log pour ces filtres</strong>
          <span>Les nouveaux événements techniques apparaîtront ici.</span>
        </div>
      ) : (
        <>
          <div className="technical-logs-list">
            {logs.map((entry) => (
              <article className="technical-log-entry" key={entry.id}>
                <span className={`technical-log-level ${entry.level}`}>
                  {levelLabels[entry.level]}
                </span>
                <div className="technical-log-main">
                  <div className="technical-log-title">
                    <strong>{entry.message}</strong>
                    <time dateTime={entry.time}>{formatDate(entry.time)}</time>
                  </div>
                  {Object.keys(entry.details).length > 0 && (
                    <details>
                      <summary>Voir les détails techniques</summary>
                      <pre>{JSON.stringify(entry.details, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="technical-logs-pagination">
            <span>
              Affichage de {(page - 1) * pageSize + 1} à{" "}
              {Math.min(page * pageSize, total)} sur {total} lignes
            </span>
            <div className="audit-pagination-actions">
              <button
                className="secondary small"
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Précédent
              </button>
              <span>Page {page} sur {totalPages}</span>
              <button
                className="secondary small"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Suivant
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
