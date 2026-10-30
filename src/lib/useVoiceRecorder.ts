import { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_VOICE_DURATION_MS = 120_000

export interface VoicePreview {
  dataUrl: string
  durationMs: number
}

type RecorderStatus = 'idle' | 'recording' | 'paused' | 'preview' | 'error'

const preferredMimeTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
]

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return ''
  return preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Lecture de l’enregistrement impossible.'))
    reader.readAsDataURL(blob)
  })

/**
 * Enregistrement de notes vocales au format WhatsApp :
 * démarrage immédiat, minuteur, aperçu avant envoi, annulation.
 */
export function useVoiceRecorder() {
  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [preview, setPreview] = useState<VoicePreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const segmentStartedAtRef = useRef(0)
  const accumulatedMsRef = useRef(0)
  const elapsedRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const cancelledRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const reset = useCallback(() => {
    clearTimer()
    cancelledRef.current = true
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    chunksRef.current = []
    segmentStartedAtRef.current = 0
    accumulatedMsRef.current = 0
    elapsedRef.current = 0
    releaseStream()
    setStatus('idle')
    setElapsedMs(0)
    setPreview(null)
  }, [releaseStream])

  useEffect(() => reset, [reset])

  const stop = useCallback(() => {
    clearTimer()
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    const elapsed =
      recorder.state === 'paused'
        ? accumulatedMsRef.current
        : accumulatedMsRef.current + (Date.now() - segmentStartedAtRef.current)
    const durationMs = Math.max(0, Math.min(MAX_VOICE_DURATION_MS, elapsed))
    accumulatedMsRef.current = durationMs
    elapsedRef.current = durationMs
    setElapsedMs(durationMs)
    recorder.stop()
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.min(
        MAX_VOICE_DURATION_MS,
        accumulatedMsRef.current + (Date.now() - segmentStartedAtRef.current),
      )
      elapsedRef.current = elapsed
      setElapsedMs(elapsed)
      if (elapsed >= MAX_VOICE_DURATION_MS) stop()
    }, 100)
  }, [stop])

  const start = useCallback(async () => {
    if (!supported) {
      setError('L’enregistrement vocal n’est pas pris en charge par ce navigateur.')
      setStatus('error')
      return
    }
    setError(null)
    setPreview(null)
    cancelledRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32_000,
      })
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        releaseStream()
        const durationMs = Math.max(200, Math.min(MAX_VOICE_DURATION_MS, elapsedRef.current))
        if (cancelledRef.current) return
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          if (blob.size === 0) throw new Error('Enregistrement vide.')
          const dataUrl = await readAsDataUrl(blob)
          setPreview({ dataUrl, durationMs })
          setStatus('preview')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Enregistrement impossible.')
          setStatus('error')
        }
      }

      accumulatedMsRef.current = 0
      elapsedRef.current = 0
      segmentStartedAtRef.current = Date.now()
      setElapsedMs(0)
      setStatus('recording')
      recorder.start(250)
      startTimer()
    } catch (err) {
      releaseStream()
      const denied =
        err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      setError(
        denied
          ? 'Accès au microphone refusé. Autorisez le microphone dans votre navigateur.'
          : 'Impossible d’accéder au microphone.',
      )
      setStatus('error')
    }
  }, [releaseStream, startTimer, supported])

  const pause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    const elapsed = Math.min(
      MAX_VOICE_DURATION_MS,
      accumulatedMsRef.current + (Date.now() - segmentStartedAtRef.current),
    )
    accumulatedMsRef.current = elapsed
    elapsedRef.current = elapsed
    setElapsedMs(elapsed)
    clearTimer()
    recorder.pause()
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    segmentStartedAtRef.current = Date.now()
    recorder.resume()
    setStatus('recording')
    startTimer()
  }, [startTimer])

  const cancel = useCallback(() => {
    reset()
    setError(null)
  }, [reset])

  return {
    supported,
    status,
    elapsedMs,
    preview,
    error,
    start,
    stop,
    pause,
    resume,
    cancel,
    reset,
  }
}
