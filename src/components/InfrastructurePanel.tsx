import { useCallback, useEffect, useState } from "react"
import { Icon } from "./Icon"
import { Alert, LoadingState } from "./ui"
import { api, errorMessage } from "../lib/api"
import { analyticsConfig } from "../lib/analytics"
import { roleLabels } from "../lib/labels"
import { TechnicalLogsPanel } from "./TechnicalLogsPanel"
import type { InfrastructureOverview, StaffUser } from "../types"

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 0) return `${days} j ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min`
}

const statusLabel = (value: { simulated?: boolean configured?: boolean }) => {
  if (value.simulated) return "Simulation"
  return value.configured ? "Configuré" : "À configurer"
}

const statusTone = (value: { simulated?: boolean configured?: boolean }) => {
  if (value.simulated) return "draft"
  return value.configured ? "live" : "danger"
}

export function InfrastructurePanel({ role }: { role: StaffUser["role"] }) {
  const [data, setData] = useState<InfrastructureOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.admin.infrastructure())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !data)
    return <LoadingState label="Analyse de l’infrastructure…" />

  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <div className="admin-panel">
          <div className="state-block">
            <h3>Infrastructure indisponible</h3>
            <p>Réessayez dans quelques instants.</p>
            <button className="secondary" onClick={() => void load()}>
              Réessayer
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="infra-intro">
            <div className="infra-intro-icon">
              <Icon name="shield" size={22} />
            </div>
            <div>
              <span className="eyebrow">Supervision technique</span>
              <h2>Santé et activité du site</h2>
              <p>
                Suivez les services, les intégrations et les actions
                enregistrées par l’application.
              </p>
            </div>
            <span className={`infra-health ${data.system.database.status}`}>
              <span className={`infra-dot ${data.system.database.status}`} />
              {data.system.database.status === "ok"
                ? "Services opérationnels"
                : "Incident détecté"}
            </span>
          </section>

          <div className="infra-stats">
            <article>
              <span>Sessions de connexion valides</span>
              <strong>{data.activity.validSessions}</strong>
              <small>
                non révoquées et non expirées, pas nécessairement en ligne
              </small>
            </article>
            <article>
              <span>Connexions · 24 h</span>
              <strong>{data.activity.logins24h}</strong>
              <small>{data.activity.logins7d} sur 7 jours</small>
            </article>
            <article>
              <span>Commandes · 24 h</span>
              <strong>{data.activity.orders24h}</strong>
              <small>{data.activity.orders7d} sur 7 jours</small>
            </article>
            <article>
              <span>Devis · 24 h</span>
              <strong>{data.activity.quotes24h}</strong>
              <small>{data.activity.quotes7d} sur 7 jours</small>
            </article>
            <article>
              <span>Contenus actifs</span>
              <strong>{data.catalog.activeProducts}</strong>
              <small>
                sur {data.catalog.totalProducts} contenus du catalogue
              </small>
            </article>
          </div>

          <div className="infra-grid">
            <section className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <h2>Affluence & comportement client</h2>
                  <p>
                    Visites, sources de trafic, pages vues et parcours dans
                    PostHog.
                  </p>
                </div>
                <span
                  className={`infra-badge ${
                    analyticsConfig.configured ? "live" : "danger"
                  }`}
                >
                  {analyticsConfig.configured
                    ? "PostHog actif"
                    : "Non configuré"}
                </span>
              </div>
              <div className="infra-posthog">
                {analyticsConfig.configured ? (
                  <>
                    <p>
                      Le suivi est actif sur la boutique. Les événements
                      produit, panier, devis, commande et suivi sont envoyés
                      avec les pages vues.
                    </p>
                    <div className="infra-kv">
                      <span>Hôte PostHog</span>
                      <strong>{analyticsConfig.host}</strong>
                    </div>
                    {analyticsConfig.dashboardUrl ? (
                      <a
                        className="primary small infra-link"
                        href={analyticsConfig.dashboardUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ouvrir le tableau de bord PostHog{" "}
                        <Icon name="arrow" size={15} />
                      </a>
                    ) : (
                      <Alert tone="info">
                        Ajoutez <code>VITE_POSTHOG_DASHBOARD_URL</code> pour
                        ouvrir directement votre tableau de bord depuis cet
                        écran.
                      </Alert>
                    )}
                  </>
                ) : (
                  <>
                    <Alert tone="info">
                      Aucune clé PostHog n’est configurée. Le suivi reste
                      inactif : aucune donnée n’est inventée dans cet écran.
                    </Alert>
                    <p className="infra-help">
                      Renseignez ces variables dans le fichier <code>.env</code>{" "}
                      du frontend, puis redémarrez Vite :
                    </p>
                    <pre className="infra-code">{`VITE_POSTHOG_KEY=phc_votre_cle_publique
VITE_POSTHOG_HOST=https://eu.i.posthog.com
VITE_POSTHOG_DASHBOARD_URL=https://eu.posthog.com/project/...`}</pre>
                  </>
                )}
                <ul className="infra-events">
                  <li>Pages vues et sources de trafic</li>
                  <li>Produits et services consultés</li>
                  <li>Ajouts au panier et commandes</li>
                  <li>Demandes de devis et suivi de commande</li>
                </ul>
              </div>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <h2>État technique</h2>
                  <p>API, base de données et ressources du serveur.</p>
                </div>
                <button
                  className="secondary small"
                  onClick={() => void load()}
                  disabled={loading}
                >
                  <Icon name="rotate" size={14} />{" "}
                  {loading ? "Actualisation…" : "Actualiser"}
                </button>
              </div>
              <ul className="infra-list">
                <li>
                  <span>Base PostgreSQL</span>
                  <strong>
                    <span
                      className={`infra-dot ${data.system.database.status}`}
                    />
                    {data.system.database.status === "ok"
                      ? "Opérationnelle"
                      : "Dégradée"}{" "}
                    · {data.system.database.latencyMs} ms
                  </strong>
                </li>
                <li>
                  <span>Environnement</span>
                  <strong>{data.system.environment}</strong>
                </li>
                <li>
                  <span>Node.js</span>
                  <strong>{data.system.nodeVersion}</strong>
                </li>
                <li>
                  <span>Disponibilité</span>
                  <strong>{formatUptime(data.system.uptimeSeconds)}</strong>
                </li>
                <li>
                  <span>Mémoire process</span>
                  <strong>
                    {data.system.memory.rssMb} Mo · heap{" "}
                    {data.system.memory.heapUsedMb} Mo
                  </strong>
                </li>
                <li>
                  <span>Catalogue actif</span>
                  <strong>
                    {data.catalog.activeProducts} / {data.catalog.totalProducts}{" "}
                    contenus
                  </strong>
                </li>
                <li>
                  <span>Catégories actives</span>
                  <strong>{data.catalog.activeCategories}</strong>
                </li>
              </ul>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <h2>Intégrations</h2>
                  <p>Services externes et mode de fonctionnement.</p>
                </div>
              </div>
              <ul className="infra-integrations">
                <li>
                  <span>
                    <Icon name="whatsapp" size={17} /> WhatsApp
                  </span>
                  <span
                    className={`infra-badge ${statusTone(data.integrations.whatsapp)}`}
                  >
                    {statusLabel(data.integrations.whatsapp)}
                  </span>
                </li>
                <li>
                  <span>
                    <Icon name="mail" size={17} /> Email
                  </span>
                  <span
                    className={`infra-badge ${statusTone(data.integrations.email)}`}
                  >
                    {statusLabel(data.integrations.email)}
                  </span>
                </li>
                <li>
                  <span>
                    <Icon name="bag" size={17} /> Bictorys
                  </span>
                  <span
                    className={`infra-badge ${
                      data.integrations.bictorys.enabled ? "live" : "danger"
                    }`}
                  >
                    {data.integrations.bictorys.enabled
                      ? `${data.integrations.bictorys.mode}${
                          data.integrations.bictorys.mock ? " · mock" : ""
                        }`
                      : "Désactivé"}
                  </span>
                </li>
              </ul>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <h2>Comptes du personnel</h2>
                  <p>
                    {data.users.active} actif(s) sur {data.users.total}{" "}
                    compte(s).
                  </p>
                </div>
              </div>
              <ul className="infra-list">
                {Object.entries(data.users.byRole).map(([role, count]) => (
                  <li key={role}>
                    <span>{roleLabels[role] ?? role}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {role === "ADMIN" && <TechnicalLogsPanel />}
        </>
      )}
    </>
  )
}
