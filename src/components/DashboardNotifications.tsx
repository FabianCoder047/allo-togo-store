import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Icon, type IconName } from "./Icon"
import { api } from "../lib/api"
import { formatDateShort, formatTime } from "../lib/format"
import { getStaffSocket } from "../lib/realtime"
import type { StaffNotification } from "../types"

const READ_KEY = "allo.notifications.read.v1"

const readIds = (): string[] => {
  try {
    const raw = window.localStorage.getItem(READ_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

const rememberIds = (ids: string[]) => {
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify(ids.slice(0, 200)))
  } catch {
    // Le stockage local peut être désactivé : le badge reste utilisable.
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : "")

const notificationCopy = (notification: StaffNotification) => {
  const payload = notification.payload ?? {}
  if (notification.template === "ASSISTANT_ESCALATION") {
    return {
      icon: "headset" as IconName,
      title: "Question client non résolue",
      message:
        text(payload.customerMessage) ||
        "Un client attend une réponse de l’équipe.",
      reference: text(payload.reference),
    }
  }
  if (notification.template === "MISSION_ASSIGNED") {
    return {
      icon: "fleet" as IconName,
      title: "Nouvelle mission",
      message: text(payload.message) || "Une commande vous a été attribuée.",
      reference: text(payload.orderNumber),
    }
  }
  if (notification.template === "ORDER_TO_CONFIRM") {
    return {
      icon: "bag" as IconName,
      title: "Nouvelle commande à confirmer",
      message:
        text(payload.message) ||
        "Appelez le client avant de confirmer ou refuser la commande.",
      reference: text(payload.orderNumber),
    }
  }
  if (notification.template === "PAYMENT_TO_VALIDATE") {
    return {
      icon: "bag" as IconName,
      title: "Paiement à valider",
      message:
        text(payload.message) || "Un paiement est en attente de validation.",
      reference: text(payload.orderNumber),
    }
  }
  if (notification.template === "CASH_PAYMENT_RECORDED") {
    return {
      icon: "check" as IconName,
      title: "Encaissement enregistré",
      message:
        text(payload.message) || "Votre remise d'espèces a été enregistrée.",
      reference: text(payload.orderNumber),
    }
  }
  return {
    icon: "bell" as IconName,
    title: "Notification",
    message: text(payload.message) || "Nouvelle activité sur votre espace.",
    reference: "",
  }
}

export function DashboardNotifications() {
  const [notifications, setNotifications] = useState<StaffNotification[]>([])
  const [read, setRead] = useState<string[]>(readIds)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setNotifications(await api.staff.notifications())
    } catch {
      // Le dashboard reste utilisable si la file de notifications est indisponible.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const socket = getStaffSocket()
    if (!socket) return
    const refresh = () => void load()
    socket.on("assistant:escalation", refresh)
    socket.on("assistant:support-message", refresh)
    socket.on("order:new", refresh)
    return () => {
      socket.off("assistant:escalation", refresh)
      socket.off("assistant:support-message", refresh)
      socket.off("order:new", refresh)
    }
  }, [load])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const unread = useMemo(() => {
    const seen = new Set(read)
    return notifications.filter((notification) => !seen.has(notification.id))
      .length
  }, [notifications, read])

  const markRead = (ids: string[]) => {
    setRead((current) => {
      const next = [...new Set([...ids, ...current])].slice(0, 200)
      rememberIds(next)
      return next
    })
  }

  const openNotification = (notification: StaffNotification) => {
    markRead([notification.id])
    setOpen(false)
    const payload = notification.payload ?? {}

    if (notification.template === "ASSISTANT_ESCALATION") {
      window.dispatchEvent(
        new CustomEvent("allo:open-assistant-thread", {
          detail: {
            threadId:
              notification.assistantThreadId ??
              (text(payload.threadId) || undefined),
            reference: text(payload.reference) || undefined,
          },
        }),
      )
      return
    }

    if (notification.orderId) {
      window.dispatchEvent(
        new CustomEvent("allo:open-notification-order", {
          detail: { orderId: notification.orderId },
        }),
      )
    }
  }

  return (
    <div className="dashboard-notifications" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn notification-trigger ${open ? "active" : ""}`}
        onClick={() => {
          setOpen((value) => !value)
          if (!open) void load()
        }}
        aria-label={
          unread > 0 ? `${unread} notification(s) non lue(s)` : "Notifications"
        }
        aria-expanded={open}
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span className="notification-badge">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="notification-popover"
          role="dialog"
          aria-label="Notifications"
        >
          <header>
            <div>
              <strong>Notifications</strong>
              <small>
                {unread > 0 ? `${unread} non lue(s)` : "Tout est à jour"}
              </small>
            </div>
            <div className="notification-popover-actions">
              {unread > 0 && (
                <button
                  type="button"
                  className="secondary small"
                  onClick={() =>
                    markRead(
                      notifications.map((notification) => notification.id),
                    )
                  }
                >
                  Tout lire
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                onClick={() => void load()}
                aria-label="Actualiser"
              >
                <Icon name="rotate" size={15} />
              </button>
            </div>
          </header>

          {loading && notifications.length === 0 ? (
            <div className="notification-empty">Chargement…</div>
          ) : notifications.length === 0 ? (
            <div className="notification-empty">
              <Icon name="bell" size={22} />
              <span>Aucune notification pour le moment.</span>
            </div>
          ) : (
            <ul className="notification-popover-list">
              {notifications.map((notification) => {
                const copy = notificationCopy(notification)
                const isUnread = !read.includes(notification.id)
                return (
                  <li
                    key={notification.id}
                    className={isUnread ? "unread" : ""}
                  >
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                    >
                      <span
                        className={`notification-type ${
                          notification.template === "ASSISTANT_ESCALATION"
                            ? "assistant"
                            : ""
                        }`}
                      >
                        <Icon name={copy.icon} size={17} />
                      </span>
                      <span className="notification-copy">
                        <strong>{copy.title}</strong>
                        <span>{copy.message}</span>
                        <small>
                          {copy.reference ? `Réf. ${copy.reference} · ` : ""}
                          {formatDateShort(notification.createdAt)} à{" "}
                          {formatTime(notification.createdAt)}
                        </small>
                      </span>
                      <Icon name="chevron" size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
