import { useEffect, useRef, useState } from "react"
import { Icon } from "./Icon"
import { useStore } from "../context/StoreContext"
import { api } from "../lib/api"
import { getStaffSocket } from "../lib/realtime"

type StaffAlert = {
  key: string
  reference?: string
  threadId?: string
  customerMessage: string
  createdAt?: string
}

type RealtimeAlert = {
  reference?: string
  threadId?: string
  customerMessage?: string
  createdAt?: string
}

const DISMISSED_KEY = "allo.assistant.dismissed.v1"

const readDismissed = (): string[] => {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

const rememberDismissed = (key: string) => {
  try {
    const current = readDismissed().filter((item) => item !== key)
    window.localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify([key, ...current].slice(0, 50)),
    )
  } catch {
    // Le stockage local peut être désactivé : le bandeau reste fonctionnel.
  }
}

export function StaffAssistantAlerts({
  navigate,
}: {
  navigate: (path: string) => void
}) {
  const { user } = useStore()
  const [alert, setAlert] = useState<StaffAlert | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  const isAllowed = user?.role === "DIRECTOR" || user?.role === "COMMERCIAL"

  useEffect(() => {
    if (!isAllowed) return
    const unlock = () => {
      try {
        if (!audioRef.current) {
          // Le contexte doit être créé pendant le geste utilisateur, sinon Chrome le
          // démarre suspendu et journalise un avertissement d'autoplay.
          const AudioContextClass = window.AudioContext
          if (!AudioContextClass) return
          audioRef.current = new AudioContextClass()
        }
        const context = audioRef.current
        if (context.state === "suspended")
          void context.resume().catch(() => undefined)
        // Lecture d'un buffer muet : confirme l'autorisation audio (Chrome, Safari).
        const buffer = context.createBuffer(1, 1, context.sampleRate)
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(context.destination)
        source.start(0)
      } catch {
        // Certains navigateurs bloquent l'audio sans interaction : le bandeau suffit.
      }
    }
    window.addEventListener("pointerdown", unlock, { once: true })
    window.addEventListener("keydown", unlock, { once: true })
    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
    }
  }, [isAllowed])

  useEffect(() => {
    if (!isAllowed) return
    let cancelled = false
    void api.staff
      .assistantAlerts()
      .then((alerts) => {
        if (cancelled) return
        const dismissed = new Set(readDismissed())
        const latest = alerts.find((item) => {
          const key = item.payload?.reference ?? item.id
          return !dismissed.has(key)
        })
        if (!latest) return
        setAlert({
          key: latest.payload?.reference ?? latest.id,
          reference: latest.payload?.reference,
          threadId:
            latest.assistantThreadId ?? latest.payload?.threadId ?? undefined,
          customerMessage:
            latest.payload?.customerMessage ?? "Un client attend une réponse.",
          createdAt: latest.payload?.createdAt ?? latest.createdAt,
        })
      })
      .catch(() => {
        // L'employé peut être déconnecté ou le serveur momentanément indisponible.
      })
    return () => {
      cancelled = true
    }
  }, [isAllowed])

  useEffect(() => {
    if (!isAllowed) return
    const socket = getStaffSocket()
    if (!socket) return

    const playAlert = () => {
      const context = audioRef.current
      // Sans contexte déverrouillé par un geste, on ne relance pas : `resume()`
      // hors activation déclencherait l'avertissement d'autoplay de Chrome.
      if (!context) return
      const schedule = () => {
        const start = context.currentTime
        const beep = (offset: number, frequency: number) => {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          oscillator.type = "sine"
          oscillator.frequency.value = frequency
          gain.gain.setValueAtTime(0.0001, start + offset)
          gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.2)
          oscillator.connect(gain)
          gain.connect(context.destination)
          oscillator.start(start + offset)
          oscillator.stop(start + offset + 0.22)
        }
        beep(0, 880)
        beep(0.24, 1175)
      }
      if (context.state === "suspended") {
        if (!navigator.userActivation?.isActive) return
        void context
          .resume()
          .then(schedule)
          .catch(() => undefined)
        return
      }
      schedule()
    }

    const onEscalation = (payload: RealtimeAlert) => {
      const customerMessage =
        payload.customerMessage?.trim() || "Un client attend une réponse."
      setAlert({
        key: payload.reference ?? `${Date.now()}`,
        reference: payload.reference,
        threadId: payload.threadId,
        customerMessage,
        createdAt: payload.createdAt,
      })
      playAlert()
    }

    socket.on("assistant:escalation", onEscalation)
    return () => {
      socket.off("assistant:escalation", onEscalation)
    }
  }, [isAllowed])

  if (!isAllowed || !alert) return null

  const openAlerts = () => {
    rememberDismissed(alert.key)
    setAlert(null)
    const detail = { threadId: alert.threadId, reference: alert.reference }
    const eventName =
      alert.threadId || alert.reference
        ? "allo:open-assistant-thread"
        : "allo:open-assistant-alerts"
    if (window.location.pathname === "/admin") {
      window.dispatchEvent(new CustomEvent(eventName, { detail }))
      return
    }
    navigate("/admin")
    window.setTimeout(
      () => window.dispatchEvent(new CustomEvent(eventName, { detail })),
      400,
    )
  }

  const dismiss = () => {
    rememberDismissed(alert.key)
    setAlert(null)
  }

  return (
    <div className="staff-assistant-alert" role="alert">
      <div className="staff-assistant-alert-icon">
        <Icon name="headset" size={20} />
      </div>
      <div className="staff-assistant-alert-copy">
        <strong>Message client non résolu</strong>
        <span>{alert.customerMessage}</span>
        <small>
          {alert.reference ? `Réf. ${alert.reference}` : "Assistant Allo Togo"}
          {alert.createdAt
            ? ` · ${new Date(alert.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </small>
      </div>
      <div className="staff-assistant-alert-actions">
        <button className="primary small" onClick={openAlerts}>
          Répondre
        </button>
        <button
          className="icon-btn"
          onClick={dismiss}
          aria-label="Fermer l’alerte"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </div>
  )
}
