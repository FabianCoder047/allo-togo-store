import { useEffect, useRef, useState } from "react"

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function PwaControls() {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [needRefresh, setNeedRefresh] = useState(false)
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null)
  const reloadAfterUpdate = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return

    let active = true
    const handleControllerChange = () => {
      if (reloadAfterUpdate.current) window.location.reload()
    }
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    )

    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((serviceWorkerRegistration) => {
        if (!active) return
        setRegistration(serviceWorkerRegistration)
        if (
          serviceWorkerRegistration.waiting &&
          navigator.serviceWorker.controller
        ) {
          setNeedRefresh(true)
        }
        serviceWorkerRegistration.addEventListener("updatefound", () => {
          const installing = serviceWorkerRegistration.installing
          if (!installing) return
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setNeedRefresh(true)
            }
          })
        })
      })
      .catch((error: unknown) => {
        console.error("Échec de l’enregistrement de la PWA.", error)
      })

    return () => {
      active = false
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      )
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD) return
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    const userAgent = window.navigator.userAgent
    const ios =
      !isStandalone &&
      (/iPad|iPhone|iPod/.test(userAgent) ||
        (window.navigator.platform === "MacIntel" &&
          window.navigator.maxTouchPoints > 1))
    setIsIos(ios)

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      setDismissed(true)
    }

    window.addEventListener("beforeinstallprompt", handleInstallPrompt)
    window.addEventListener("appinstalled", handleInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt)
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [])

  if (
    !import.meta.env.PROD ||
    (!needRefresh && !installPrompt && !isIos) ||
    dismissed
  ) {
    return null
  }

  const install = async () => {
    if (!installPrompt) return
    setInstallError(null)
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === "accepted") setDismissed(true)
      setInstallPrompt(null)
    } catch {
      setInstallError("L’installation n’a pas pu démarrer. Réessayez depuis votre navigateur.")
    }
  }

  const update = () => {
    const waitingWorker = registration?.waiting
    if (!waitingWorker) {
      setNeedRefresh(false)
      return
    }
    reloadAfterUpdate.current = true
    setNeedRefresh(false)
    waitingWorker.postMessage({ type: "SKIP_WAITING" })
  }

  return (
    <aside className="pwa-controls" aria-live="polite">
      <div className="pwa-controls-copy">
        <strong>
          {needRefresh ? "Mise à jour disponible" : "Emportez Allo Togo"}
        </strong>
        <span>
          {needRefresh
            ? "Une nouvelle version de l’application est prête."
            : isIos && !installPrompt
              ? "Dans Safari, touchez Partager puis « Sur l’écran d’accueil »."
              : "Installez la boutique sur votre appareil pour la retrouver facilement."}
        </span>
        {installError && <span className="pwa-controls-error">{installError}</span>}
      </div>
      {needRefresh ? (
        <button
          className="pwa-controls-action"
          onClick={update}
        >
          Actualiser
        </button>
      ) : installPrompt ? (
        <button className="pwa-controls-action" onClick={() => void install()}>
          Installer
        </button>
      ) : null}
      <button
        className="pwa-controls-close"
        aria-label="Fermer"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </aside>
  )
}
