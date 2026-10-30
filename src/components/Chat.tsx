import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { formatTime } from '../lib/format'
import {
  MAX_VOICE_DURATION_MS,
  useVoiceRecorder,
} from '../lib/useVoiceRecorder'
import type { ChatMessage, ChatMessagePayload } from '../types'

const formatDuration = (ms: number) => {
  const total = Math.max(1, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

type MediaAttachment = {
  kind: 'IMAGE' | 'VIDEO'
  dataUrl: string
  mimeType: string
  name: string
  size: number
  durationMs?: number
}

const MAX_IMAGE_FILE_BYTES = 12 * 1024 * 1024
const MAX_VIDEO_FILE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_DATA_URL_LENGTH = 5_800_000

const readFileAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.readAsDataURL(file)
  })

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image illisible.'))
    image.src = source
  })

const compressImage = async (file: File) => {
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error('Image trop volumineuse (12 Mo maximum avant compression).')
  }
  const original = await readFileAsDataUrl(file)
  if (file.type === 'image/gif') {
    if (original.length > MAX_IMAGE_DATA_URL_LENGTH) {
      throw new Error('GIF trop volumineux. Choisissez un fichier plus léger.')
    }
    return { dataUrl: original, mimeType: file.type || 'image/gif', size: file.size }
  }

  const image = await loadImage(original)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const scale = Math.min(1, 1600 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    if (original.length > MAX_IMAGE_DATA_URL_LENGTH) throw new Error('Image trop volumineuse.')
    return { dataUrl: original, mimeType: file.type || 'image/jpeg', size: file.size }
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  let dataUrl = canvas.toDataURL('image/webp', 0.82)
  let mimeType = 'image/webp'
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    mimeType = 'image/jpeg'
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.68)
    mimeType = 'image/jpeg'
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error('Image trop volumineuse après compression. Choisissez une image plus légère.')
  }
  const blob = await (await fetch(dataUrl)).blob()
  return { dataUrl, mimeType, size: blob.size }
}

const readVideoDuration = (source: string) =>
  new Promise<number>((resolve) => {
    const video = document.createElement('video')
    let settled = false
    let timeout = 0
    const finish = (value: number) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      video.removeAttribute('src')
      resolve(value)
    }
    timeout = window.setTimeout(() => finish(0), 6_000)
    video.preload = 'metadata'
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0)
    video.onerror = () => finish(0)
    video.src = source
  })

const waveformFor = (id: string) => {
  let seed = 0
  for (let index = 0; index < id.length; index += 1)
    seed = (seed * 31 + id.charCodeAt(index)) % 997
  return Array.from({ length: 26 }, (_, index) => {
    seed = (seed * 37 + index * 11) % 997
    return 24 + (seed % 72)
  })
}

/**
 * Les pièces jointes sont stockées en data URL. Les navigateurs gèrent mal les
 * data URL de grande taille : on les convertit en Blob URL pour garantir la
 * lecture audio/vidéo et l’affichage des images.
 */
function useDataObjectUrl(source: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!source) {
      setUrl(null)
      setFailed(false)
      return
    }

    let active = true
    let objectUrl: string | null = null
    setUrl(null)
    setFailed(false)

    fetch(source)
      .then((response) => {
        if (!response.ok) throw new Error('Audio indisponible')
        return response.blob()
      })
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source])

  return { url, failed }
}

function AudioBubble({
  message,
  mine,
}: {
  message: ChatMessage
  mine: boolean
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [playError, setPlayError] = useState<string | null>(null)
  const { url, failed } = useDataObjectUrl(message.audioData)
  const bars = useMemo(() => waveformFor(message.id), [message.id])
  const durationMs = message.durationMs ?? 0

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setPlayError(null)
  }, [url])

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio || !url) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    try {
      await audio.play()
      setPlayError(null)
    } catch {
      setPlaying(false)
      setPlayError(
        'Lecture impossible. Vérifiez le volume de votre appareil puis réessayez.',
      )
    }
  }

  if (!message.audioData || failed) {
    return <p className="wa-audio-missing">Note vocale indisponible.</p>
  }

  return (
    <div className="wa-audio-wrap">
      <div className={`wa-audio ${mine ? 'mine' : ''}`}>
        <audio
          ref={audioRef}
          src={url ?? undefined}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setProgress(0)
          }}
          onError={() =>
            setPlayError(
              'La note vocale ne peut pas être lue sur cet appareil.',
            )
          }
          onTimeUpdate={(event) => {
            const audio = event.currentTarget
            if (audio.duration && Number.isFinite(audio.duration)) {
              setProgress(audio.currentTime / audio.duration)
            }
          }}
        />
        <button
          type="button"
          className="wa-audio-play"
          onClick={() => void toggle()}
          disabled={!url}
          aria-label={
            playing ? 'Mettre la note vocale en pause' : 'Lire la note vocale'
          }
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <span className="wa-wave" aria-hidden="true">
          {bars.map((height, index) => (
            <i
              key={index}
              style={{ height: `${height}%` }}
              className={index / bars.length <= progress ? 'played' : ''}
            />
          ))}
        </span>
        <small>{formatDuration(durationMs)}</small>
      </div>
      {playError && <p className="wa-audio-error">{playError}</p>}
    </div>
  )
}

function ImageBubble({
  message,
  mine,
}: {
  message: ChatMessage
  mine: boolean
}) {
  const { url, failed } = useDataObjectUrl(message.mediaData)
  if (!message.mediaData || failed) {
    return <p className="wa-audio-missing">Image indisponible.</p>
  }
  const caption = message.body && message.body !== 'Photo' ? message.body : null
  return (
    <figure className={`wa-media ${mine ? 'mine' : ''}`}>
      {url ? (
        <a className="wa-media-link" href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={message.mediaName || 'Image envoyée'} loading="lazy" />
        </a>
      ) : (
        <span className="wa-media-loading">Chargement de l’image…</span>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

function VideoBubble({
  message,
  mine,
}: {
  message: ChatMessage
  mine: boolean
}) {
  const { url, failed } = useDataObjectUrl(message.mediaData)
  if (!message.mediaData || failed) {
    return <p className="wa-audio-missing">Vidéo indisponible.</p>
  }
  return (
    <figure className={`wa-media wa-media-video-wrap ${mine ? 'mine' : ''}`}>
      {url ? (
        <video
          className="wa-media-video"
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={message.mediaName || 'Vidéo envoyée'}
        />
      ) : (
        <span className="wa-media-loading">Chargement de la vidéo…</span>
      )}
      {message.body && message.body !== 'Vidéo' && <figcaption>{message.body}</figcaption>}
    </figure>
  )
}

function LocationBubble({
  message,
  mine,
}: {
  message: ChatMessage
  mine: boolean
}) {
  if (
    message.latitude === null ||
    message.longitude === null ||
    message.latitude === undefined ||
    message.longitude === undefined
  ) {
    return <p className="wa-audio-missing">Position indisponible.</p>
  }
  const latitude = message.latitude
  const longitude = message.longitude
  const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`
  const embedUrl = `https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`
  return (
    <div className={`wa-location ${mine ? 'mine' : ''}`}>
      <iframe
        className="wa-location-map"
        src={embedUrl}
        title={`Carte Google Maps — ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <span className="wa-location-copy">
        <strong>{message.locationLabel || 'Position partagée'}</strong>
        <small>
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
          {message.accuracy ? ` · ±${Math.round(message.accuracy)} m` : ''}
        </small>
        <a href={mapUrl} target="_blank" rel="noreferrer">
          Ouvrir dans Google Maps <Icon name="arrow" size={11} />
        </a>
      </span>
    </div>
  )
}

export function ChatMessageList({
  messages,
  me,
  emptyLabel = 'Aucun message pour le moment.',
}: {
  messages: ChatMessage[]
  me: 'CLIENT' | 'STAFF'
  emptyLabel?: string
}) {
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const list = listRef.current
    const container = list?.parentElement
    if (container) container.scrollTop = container.scrollHeight
  }, [messages.length])

  if (messages.length === 0) {
    return <p className="wa-empty">{emptyLabel}</p>
  }

  return (
    <div className="wa-list" ref={listRef}>
      {messages.map((message) => {
        if (message.authorType === 'SYSTEM') {
          return (
            <div className="wa-system" key={message.id}>
              <Icon name="check" size={12} /> {message.body}
            </div>
          )
        }
        const mine = message.authorType === me
        return (
          <div className={`wa-row ${mine ? 'out' : 'in'}`} key={message.id}>
            <div className={`wa-bubble ${mine ? 'out' : 'in'}`}>
              {!mine && (
                <span className="wa-author">
                  {message.authorName || 'Allo Togo'}
                </span>
              )}
              {message.kind === 'AUDIO' ? (
                <AudioBubble message={message} mine={mine} />
              ) : message.kind === 'IMAGE' ? (
                <ImageBubble message={message} mine={mine} />
              ) : message.kind === 'VIDEO' ? (
                <VideoBubble message={message} mine={mine} />
              ) : message.kind === 'LOCATION' ? (
                <LocationBubble message={message} mine={mine} />
              ) : (
                <p>{message.body}</p>
              )}
              <small className="wa-time">
                {formatTime(message.createdAt)}
                {mine && <Icon name="check" size={11} />}
              </small>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = 'Écrivez votre message…',
  onNotice,
}: {
  onSend: (payload: ChatMessagePayload) => Promise<void> | void
  disabled?: boolean
  placeholder?: string
  onNotice?: (message: string, tone?: 'success' | 'error' | 'info') => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [mediaPreview, setMediaPreview] = useState<MediaAttachment | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [preparingMedia, setPreparingMedia] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewProgress, setPreviewProgress] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const recorder = useVoiceRecorder()
  const previewSource = useDataObjectUrl(recorder.preview?.dataUrl)

  const busy = disabled || sending
  const recording = recorder.status === 'recording' || recorder.status === 'paused'
  const paused = recorder.status === 'paused'
  const preview = recorder.status === 'preview'

  useEffect(() => {
    if (recorder.status === 'error' && recorder.error) {
      onNotice?.(recorder.error, 'error')
    }
  }, [recorder.status, recorder.error, onNotice])

  useEffect(() => {
    setPreviewPlaying(false)
    setPreviewProgress(0)
    setPreviewError(null)
  }, [recorder.preview?.dataUrl])

  const send = async (payload: ChatMessagePayload) => {
    if (busy) return
    setSending(true)
    try {
      await onSend(payload)
      return true
    } catch (error) {
      onNotice?.(
        error instanceof Error ? error.message : 'Envoi impossible.',
        'error',
      )
      return false
    } finally {
      setSending(false)
    }
  }

  const sendText = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    const ok = await send({ kind: 'TEXT', body: value })
    if (ok) setText('')
  }

  const sendVoice = async () => {
    if (!recorder.preview) return
    const ok = await send({
      kind: 'AUDIO',
      audioData: recorder.preview.dataUrl,
      durationMs: recorder.preview.durationMs,
    })
    if (ok) recorder.reset()
  }

  const sendMedia = async () => {
    if (!mediaPreview) return
    const common = {
      mediaData: mediaPreview.dataUrl,
      mediaMimeType: mediaPreview.mimeType,
      mediaName: mediaPreview.name,
      mediaSize: mediaPreview.size,
    }
    const payload: ChatMessagePayload =
      mediaPreview.kind === 'IMAGE'
        ? { kind: 'IMAGE', ...common }
        : { kind: 'VIDEO', ...common, durationMs: mediaPreview.durationMs }
    const ok = await send(payload)
    if (ok) {
      setMediaPreview(null)
      setMediaError(null)
    }
  }

  const handleMediaFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMediaError(null)
    setLocationOpen(false)
    setPreparingMedia(true)
    try {
      if (file.type.startsWith('image/')) {
        const prepared = await compressImage(file)
        setMediaPreview({ kind: 'IMAGE', ...prepared, name: file.name })
      } else if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_FILE_BYTES) {
          throw new Error('Vidéo trop volumineuse (10 Mo maximum).')
        }
        const dataUrl = await readFileAsDataUrl(file)
        if (dataUrl.length > 15_500_000) {
          throw new Error('Vidéo trop volumineuse après encodage. Choisissez une vidéo plus courte.')
        }
        const durationMs = await readVideoDuration(dataUrl)
        setMediaPreview({
          kind: 'VIDEO',
          dataUrl,
          mimeType: file.type || 'video/mp4',
          name: file.name,
          size: file.size,
          durationMs,
        })
      } else {
        throw new Error('Choisissez une image ou une vidéo.')
      }
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'Impossible de préparer ce fichier.')
    } finally {
      setPreparingMedia(false)
    }
  }

  const togglePreview = async () => {
    const audio = previewAudioRef.current
    if (!audio || !previewSource.url) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    try {
      await audio.play()
      setPreviewError(null)
    } catch {
      setPreviewPlaying(false)
      setPreviewError(
        'Lecture impossible. Vérifiez le volume de votre appareil puis réessayez.',
      )
    }
  }

  const shareLocation = () => {
    if (!navigator.geolocation) {
      setLocationError(
        'La géolocalisation n’est pas disponible sur cet appareil.',
      )
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const ok = await send({
          kind: 'LOCATION',
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: position.coords.accuracy
            ? Math.round(position.coords.accuracy)
            : undefined,
          locationLabel: 'Ma position',
        })
        setLocating(false)
        if (ok) setLocationOpen(false)
      },
      (error) => {
        setLocating(false)
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Accès à la position refusé. Autorisez la géolocalisation dans votre navigateur.'
            : 'Position introuvable. Réessayez dans un instant.',
        )
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }

  return (
    <div className="wa-composer-wrap">
      <input
        ref={fileInputRef}
        className="wa-file-input"
        type="file"
        accept="image/*,video/*"
        onChange={handleMediaFile}
        tabIndex={-1}
      />

      {mediaPreview && (
        <div className="wa-media-sheet">
          <div className={`wa-media-sheet-preview ${mediaPreview.kind.toLowerCase()}`}>
            {mediaPreview.kind === 'IMAGE' ? (
              <img src={mediaPreview.dataUrl} alt={`Aperçu de ${mediaPreview.name}`} />
            ) : (
              <video src={mediaPreview.dataUrl} controls playsInline preload="metadata" />
            )}
          </div>
          <div className="wa-media-sheet-copy">
            <strong>{mediaPreview.kind === 'IMAGE' ? 'Photo prête à envoyer' : 'Vidéo prête à envoyer'}</strong>
            <small>
              {mediaPreview.name} · {formatBytes(mediaPreview.size)}
              {mediaPreview.durationMs ? ` · ${formatDuration(mediaPreview.durationMs)}` : ''}
            </small>
          </div>
          <div className="wa-media-sheet-actions">
            <button
              type="button"
              className="wa-sheet-cancel"
              onClick={() => {
                setMediaPreview(null)
                setMediaError(null)
              }}
            >
              Annuler
            </button>
            <button type="button" className="wa-send-location" onClick={() => void sendMedia()} disabled={busy}>
              Envoyer
            </button>
          </div>
        </div>
      )}

      {locationOpen && (
        <div className="wa-location-sheet">
          <span className="wa-location-sheet-icon">
            <Icon name="map" size={20} />
          </span>
          <div>
            <strong>Partager ma position</strong>
            <p>Votre position actuelle sera envoyée dans la conversation.</p>
            {locationError && <em>{locationError}</em>}
          </div>
          <div className="wa-location-sheet-actions">
            <button
              type="button"
              className="wa-sheet-cancel"
              onClick={() => setLocationOpen(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="wa-send-location"
              onClick={shareLocation}
              disabled={locating || busy}
            >
              {locating ? 'Localisation…' : 'Envoyer'}
            </button>
          </div>
        </div>
      )}

      {recording ? (
        <div className={`wa-recording ${paused ? 'paused' : ''}`}>
          <span className="wa-recording-dot" />
          <strong>{formatDuration(recorder.elapsedMs)}</strong>
          <span className="wa-recording-wave" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i key={index} style={{ animationDelay: `${index * 70}ms` }} />
            ))}
          </span>
          <small>{paused ? 'En pause' : `Max ${formatDuration(MAX_VOICE_DURATION_MS)}`}</small>
          <button
            type="button"
            className="wa-recording-cancel"
            onClick={recorder.cancel}
            aria-label="Annuler l’enregistrement"
          >
            <Icon name="trash" size={17} />
          </button>
          <button
            type="button"
            className="wa-recording-pause"
            onClick={paused ? recorder.resume : recorder.pause}
            aria-label={paused ? 'Reprendre l’enregistrement' : 'Mettre l’enregistrement en pause'}
            title={paused ? 'Reprendre' : 'Pause'}
          >
            <Icon name={paused ? 'play' : 'pause'} size={15} />
          </button>
          <button
            type="button"
            className="wa-recording-stop"
            onClick={recorder.stop}
            aria-label="Terminer l’enregistrement"
            title="Terminer et prévisualiser"
          >
            <Icon name="stop" size={15} />
          </button>
        </div>
      ) : preview && recorder.preview ? (
        <>
          <div className="wa-preview">
            <audio
              ref={previewAudioRef}
              src={previewSource.url ?? undefined}
              preload="metadata"
              onPlay={() => setPreviewPlaying(true)}
              onPause={() => setPreviewPlaying(false)}
              onEnded={() => {
                setPreviewPlaying(false)
                setPreviewProgress(0)
              }}
              onError={() =>
                setPreviewError(
                  'La note vocale ne peut pas être lue sur cet appareil.',
                )
              }
              onTimeUpdate={(event) => {
                const audio = event.currentTarget
                if (audio.duration && Number.isFinite(audio.duration)) {
                  setPreviewProgress(audio.currentTime / audio.duration)
                }
              }}
            />
            <button
              type="button"
              className="wa-audio-play"
              onClick={() => void togglePreview()}
              disabled={!previewSource.url}
              aria-label={
                previewPlaying
                  ? 'Mettre la note vocale en pause'
                  : 'Écouter la note vocale'
              }
            >
              <Icon name={previewPlaying ? 'pause' : 'play'} size={15} />
            </button>
            <span className="wa-wave wa-preview-wave" aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => (
                <i
                  key={index}
                  style={{ height: `${28 + ((index * 37) % 64)}%` }}
                  className={index / 18 <= previewProgress ? 'played' : ''}
                />
              ))}
            </span>
            <small>{formatDuration(recorder.preview.durationMs)}</small>
            <button
              type="button"
              className="wa-ghost"
              onClick={recorder.cancel}
              aria-label="Supprimer la note vocale"
            >
              <Icon name="trash" size={16} />
            </button>
            <button
              type="button"
              className="wa-send-voice"
              onClick={sendVoice}
              disabled={busy}
              aria-label="Envoyer la note vocale"
            >
              <Icon name="send" size={17} />
            </button>
          </div>
          {(previewError || previewSource.failed) && (
            <p className="wa-composer-error">
              {previewError ||
                'La note vocale ne peut pas être lue sur cet appareil.'}
            </p>
          )}
        </>
      ) : (
        <form className="wa-composer" onSubmit={sendText}>
          <button
            type="button"
            className="wa-composer-icon"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Joindre une image ou une vidéo"
            title="Joindre une image ou une vidéo"
            disabled={busy || preparingMedia}
          >
            <Icon name={preparingMedia ? 'clock' : 'attach'} size={19} />
          </button>
          <button
            type="button"
            className={`wa-composer-icon ${locationOpen ? 'active' : ''}`}
            onClick={() => {
              setLocationOpen((value) => !value)
              setLocationError(null)
            }}
            aria-label="Partager ma position"
            disabled={busy}
          >
            <Icon name="map" size={19} />
          </button>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={placeholder}
            maxLength={4000}
            disabled={busy}
          />
          {text.trim() ? (
            <button
              type="submit"
              className="wa-composer-send"
              disabled={busy}
              aria-label="Envoyer"
            >
              <Icon name="send" size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="wa-composer-mic"
              onClick={() => void recorder.start()}
              disabled={busy || !recorder.supported}
              title={
                recorder.supported
                  ? 'Enregistrer une note vocale'
                  : 'Enregistrement non pris en charge'
              }
              aria-label="Enregistrer une note vocale"
            >
              <Icon name="mic" size={19} />
            </button>
          )}
        </form>
      )}
      {preparingMedia && <p className="wa-composer-info">Préparation du média…</p>}
      {mediaError && <p className="wa-composer-error">{mediaError}</p>}
      {recorder.error && !recording && (
        <p className="wa-composer-error">{recorder.error}</p>
      )}
    </div>
  )
}
