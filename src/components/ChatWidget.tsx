import { useEffect, useRef, useState, type FormEvent } from "react"
import { Icon } from "./Icon"
import { api, errorMessage } from "../lib/api"
import type { AssistantAction, AssistantSuggestion } from "../types"

type ChatMessage = {
  id: string | number
  role: "client" | "ai" | "advisor" | "system"
  text: string
  authorName?: string
  action?: AssistantAction
  suggestions?: AssistantSuggestion[]
}

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "ai",
    text: "Bonjour, je suis l’assistant Allo Togo. Je réponds à partir du catalogue et des informations de la boutique. Si une question dépasse mes informations, je la transmets à un employé Allo Togo.",
  },
]

const createSessionId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const SESSION_KEY = "allo.assistant.session.v1"

const readSessionId = () => {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const created = createSessionId()
    window.sessionStorage.setItem(SESSION_KEY, created)
    return created
  } catch {
    return createSessionId()
  }
}

export function ChatWidget({
  open,
  setOpen,
  navigate,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  navigate: (path: string) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId] = useState(readSessionId)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const seenAdvisorMessages = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [messages, open, sending, error])

  // Les réponses d'un employé sont conservées côté serveur. Le widget les
  // récupère pendant que la discussion est ouverte pour afficher la reprise
  // humaine sans recharger la page.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const loadAdvisorReplies = async () => {
      try {
        const thread = await api.assistant.thread(sessionId)
        if (cancelled || !thread) return
        const fresh = thread.messages.filter(
          (message) =>
            message.authorType === "STAFF" &&
            !seenAdvisorMessages.current.has(message.id),
        )
        if (fresh.length === 0) return
        fresh.forEach((message) => seenAdvisorMessages.current.add(message.id))
        setMessages((current) => [
          ...current,
          ...fresh.map((message) => ({
            id: message.id,
            role: "advisor" as const,
            text: message.body,
            authorName: message.authorName,
          })),
        ])
      } catch {
        // L'assistant reste utilisable même si le fil de reprise est indisponible.
      }
    }
    void loadAdvisorReplies()
    const timer = window.setInterval(loadAdvisorReplies, 8000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, sessionId])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const value = text.trim()
    if (!value || sending) return

    const now = Date.now()
    const history = messages
      .filter((message) => message.role !== "system")
      .slice(-8)
      .map((message) => ({
        role: message.role === "client" ? "client" as const : "ai" as const,
        text: message.text,
      }))

    setMessages((current) => [
      ...current,
      { id: now, role: "client", text: value },
    ])
    setText("")
    setError(null)
    setSending(true)

    try {
      const response = await api.assistant.ask({
        message: value,
        sessionId,
        history,
      })
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "ai",
          text: response.reply,
          action: response.action,
          suggestions: response.suggestions,
        },
      ])
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "system",
          text: "L’assistant est momentanément indisponible. Vous pouvez contacter l’équipe via la page Contact.",
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <>
      <button
        className={`support-fab ${open ? "open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Ouvrir l’assistant Allo Togo"
      >
        <Icon name={open ? "x" : "chat"} size={25} />
        <span>Besoin d’aide ?</span>
      </button>
      {open && (
        <aside className="chat-widget">
          <header className="chat-header">
            <div className="chat-brand">
              <div>
                <Icon name="headset" />
              </div>
              <span>
                <strong>Assistant Allo Togo</strong>
                <small>
                  <i></i>Réponses dynamiques
                </small>
              </span>
            </div>
            <button
              className="icon-btn"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
            >
              <Icon name="x" />
            </button>
          </header>
          <div className="chat-participants">
            <span className="client">
              <Icon name="user" size={13} /> Client
            </span>
            <span className="ai">
              <Icon name="spark" size={13} /> Assistant
            </span>
            <span className="advisor">
              <Icon name="headset" size={13} /> Employé Allo Togo
            </span>
          </div>
          <div className="chat-thread" ref={threadRef} aria-live="polite">
            {messages.map((message) =>
              message.role === "system" ? (
                <div className="system-message" key={message.id}>
                  <Icon name="check" size={13} />
                  {message.text}
                </div>
              ) : (
                <div
                  className={`chat-message ${message.role}`}
                  key={message.id}
                >
                  <div className="chat-avatar">
                    {message.role === "ai" ? (
                      <Icon name="spark" size={15} />
                    ) : message.role === "advisor" ? (
                      <Icon name="headset" size={15} />
                    ) : (
                      <Icon name="user" size={15} />
                    )}
                  </div>
                  <div>
                    <span className="chat-author">
                      {message.role === "ai"
                        ? "Assistant Allo Togo"
                        : message.role === "advisor"
                          ? message.authorName || "Employé Allo Togo"
                          : "Vous"}
                      <b>
                        {message.role === "ai"
                          ? "IA"
                          : message.role === "advisor"
                            ? "Équipe"
                            : "Client"}
                      </b>
                    </span>
                    <p>{message.text}</p>
                    {message.action === "ESCALATE" && (
                      <span className="chat-escalation">
                        <Icon name="headset" size={11} /> Transmis à un employé
                      </span>
                    )}
                    {message.suggestions && message.suggestions.length > 0 && (
                      <div className="chat-suggestions">
                        {message.suggestions.map((suggestion) => (
                          <button
                            key={`${message.id}-${suggestion.path}`}
                            onClick={() => go(suggestion.path)}
                          >
                            {suggestion.label} <Icon name="arrow" size={11} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {sending && (
              <div className="chat-typing" role="status">
                <span />
                <span />
                <span />
                L’assistant analyse votre demande…
              </div>
            )}
          </div>
          {error && <div className="chat-error">{error}</div>}
          <div className="chat-quick-links">
            <button onClick={() => go("/suivi")}>
              <Icon name="map" size={14} /> Suivre une commande
            </button>
            <button onClick={() => go("/services")}>
              <Icon name="spark" size={14} /> Demander un devis
            </button>
            <button onClick={() => go("/contact")}>
              <Icon name="headset" size={14} /> Contacter l’équipe
            </button>
          </div>
          <form className="chat-composer" onSubmit={send}>
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Posez votre question…"
              aria-label="Votre message"
              maxLength={1200}
            />
            <button
              type="submit"
              aria-label="Envoyer"
              disabled={sending || !text.trim()}
            >
              <Icon name="send" size={18} />
            </button>
          </form>
          <div className="chat-disclaimer">
            Assistant Allo Togo — réponses basées sur le catalogue. Les
            questions non résolues sont transmises à un employé.
          </div>
        </aside>
      )}
    </>
  )
}
