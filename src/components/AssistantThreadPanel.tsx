import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Icon } from './Icon'
import { Alert, LoadingState } from './ui'
import { api, errorMessage } from '../lib/api'
import { formatDate } from '../lib/format'
import { getStaffSocket } from '../lib/realtime'
import type { AssistantThread, AssistantThreadMessage } from '../types'

const statusLabels: Record<string, string> = {
  OPEN: 'En attente de réponse',
  ANSWERED: 'Réponse envoyée',
  RESOLVED: 'Discussion résolue',
}

const authorLabels: Record<string, string> = {
  CLIENT: 'Client',
  AI: 'Assistant Allo Togo',
  STAFF: 'Employé Allo Togo',
  SYSTEM: 'Système',
}

const authorBadges: Record<string, string> = {
  CLIENT: 'Question',
  AI: 'IA',
  STAFF: 'Équipe',
  SYSTEM: 'Info',
}

export function AssistantThreadPanel({
  threadKey,
  reference,
  onClose,
  notify,
}: {
  threadKey: string
  reference?: string
  onClose: () => void
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const [thread, setThread] = useState<AssistantThread | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [saveToKnowledge, setSaveToKnowledge] = useState(true)

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true)
      setError(null)
      try {
        setThread(await api.staff.assistantThread(threadKey))
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        if (!options?.silent) setLoading(false)
      }
    },
    [threadKey],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const socket = getStaffSocket()
    if (!socket) return
    const onMessage = (payload: { threadId?: string }) => {
      if (payload?.threadId === thread?.id) void load({ silent: true })
    }
    const onStatus = (payload: { threadId?: string }) => {
      if (payload?.threadId === thread?.id) void load({ silent: true })
    }
    socket.on('assistant:support-message', onMessage)
    socket.on('assistant:support-status', onStatus)
    return () => {
      socket.off('assistant:support-message', onMessage)
      socket.off('assistant:support-status', onStatus)
    }
  }, [load, thread?.id])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const value = reply.trim()
    if (!value || sending) return
    setSending(true)
    try {
      await api.staff.replyAssistantThread(threadKey, value)
      setReply('')
      if (saveToKnowledge) {
        const clientMessage = messages
          .slice()
          .reverse()
          .find((message) => message.authorType === 'CLIENT')
        if (clientMessage) {
          // L'enregistrement dans les connaissances ne doit pas faire échouer
          // l'envoi de la réponse au client.
          try {
            await api.staff.knowledge.create({
              question: clientMessage.body,
              answer: value,
              keywords: '',
              sourceThreadId: thread?.id ?? undefined,
              sourceMessageId: clientMessage.id,
            })
          } catch {
            // Ignoré : la réponse a déjà été envoyée au client.
          }
        }
      }
      await load({ silent: true })
      notify('Réponse envoyée au client.', 'success')
    } catch (err) {
      notify(errorMessage(err), 'error')
    } finally {
      setSending(false)
    }
  }

  const resolve = async () => {
    if (resolving) return
    setResolving(true)
    try {
      await api.staff.updateAssistantThread(threadKey, 'RESOLVED')
      await load({ silent: true })
      notify('Discussion marquée comme résolue.', 'success')
    } catch (err) {
      notify(errorMessage(err), 'error')
    } finally {
      setResolving(false)
    }
  }

  const messages: AssistantThreadMessage[] = thread?.messages ?? []

  return (
    <div className="order-panel assistant-thread-panel">
      <div className="order-panel-head">
        <div>
          <span className="eyebrow">Assistant Allo Togo</span>
          <h2>Discussion client</h2>
          <small>
            {thread?.reference || reference || 'Question non résolue'}
            {thread ? ` · ${statusLabels[thread.status] ?? thread.status}` : ''}
          </small>
        </div>
        <div className="order-panel-actions">
          {thread && thread.status !== 'RESOLVED' && (
            <button className="secondary small" onClick={() => void resolve()} disabled={resolving}>
              {resolving ? 'Clôture…' : 'Marquer résolu'}
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Fermer la discussion">
            <Icon name="x" />
          </button>
        </div>
      </div>

      <div className="order-panel-body assistant-thread-body">
        {error && <Alert tone="error">{error}</Alert>}
        {loading ? (
          <LoadingState label="Chargement de la discussion…" />
        ) : !thread ? (
          <div className="state-block">
            <h3>Discussion introuvable</h3>
            <p>Cette alerte ne dispose pas encore d’un fil de discussion.</p>
            <button className="secondary small" onClick={onClose}>
              Retour aux alertes
            </button>
          </div>
        ) : (
          <>
            <div className="assistant-thread-context">
              <Icon name="headset" size={16} />
              <p>
                Le client a posé une question que l’assistant n’a pas pu résoudre. Votre réponse sera visible dans son
                fil de discussion.
              </p>
            </div>

            <div className="assistant-thread-list" aria-live="polite">
              {messages.length === 0 ? (
                <div className="state-block">
                  <h3>Aucun message</h3>
                  <p>Le fil de discussion est vide.</p>
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    className={`assistant-thread-message ${message.authorType.toLowerCase()}`}
                    key={message.id}
                  >
                    <span>
                      {authorLabels[message.authorType] ?? message.authorName}
                      <b>{authorBadges[message.authorType] ?? message.authorName}</b>
                    </span>
                    <p>{message.body}</p>
                    <small>{formatDate(message.createdAt)}</small>
                  </article>
                ))
              )}
            </div>

            {thread.status === 'RESOLVED' ? (
              <div className="assistant-thread-resolved">
                <Icon name="check" size={15} /> Cette discussion est clôturée.
              </div>
            ) : (
              <form className="assistant-thread-composer" onSubmit={send}>
                <label>
                  Répondre au client
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Écrivez la réponse qui sera transmise au client…"
                    disabled={sending}
                  />
                </label>
                <div>
                  <small>{reply.length}/2000</small>
                </div>
                <div className="mt-3 flex items-start gap-2 text-xs">
                  <input
                    id="save-to-knowledge"
                    type="checkbox"
                    checked={saveToKnowledge}
                    onChange={(event) => setSaveToKnowledge(event.target.checked)}
                  />
                  <label htmlFor="save-to-knowledge" className="leading-none">
                    Conserver cette réponse dans les connaissances de l’assistant{' '}
                    <span className="block opacity-70 mt-0.5">
                      (réutilisée pour les questions similaires)
                    </span>
                  </label>
                </div>
                <div>
                  <button className="primary small" type="submit" disabled={sending || !reply.trim()}>
                    {sending ? 'Envoi…' : 'Envoyer la réponse'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
