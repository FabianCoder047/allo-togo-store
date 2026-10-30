import { useState } from "react"
import { Icon } from "./Icon"
import {
  googleMapsEmbedUrl,
  googleMapsUrlForCoordinates,
  parseDeliveryPointInput,
  type DeliveryPointSelection,
} from "../lib/googleMaps"

const DEFAULT_MAP_URL = "https://www.google.com/maps/@6.1319,1.2228,13z"

const formatCoordinates = (latitude: number, longitude: number) =>
  `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`

export function DeliveryLocationPicker({
  value,
  onChange,
  error,
}: {
  value: DeliveryPointSelection
  onChange: (value: DeliveryPointSelection) => void
  error?: string | null
}) {
  const [link, setLink] = useState("")
  const [linkError, setLinkError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)

  const latitude = value?.latitude ?? null
  const longitude = value?.longitude ?? null
  const hasCoordinates = latitude !== null && longitude !== null

  const openMapUrl =
    value?.mapUrl ||
    (latitude !== null && longitude !== null
      ? googleMapsUrlForCoordinates(latitude, longitude)
      : DEFAULT_MAP_URL)

  const applyLink = () => {
    const parsed = parseDeliveryPointInput(link)
    if (!parsed.ok) {
      setLinkError(parsed.error)
      return
    }
    setLinkError(null)
    setGpsError(null)
    onChange(parsed.point)
    setLink("")
  }

  const useCurrentPosition = () => {
    setLinkError(null)
    setGpsError(null)
    if (!navigator.geolocation) {
      setGpsError(
        "La géolocalisation n’est pas disponible sur cet appareil. Collez plutôt un lien Google Maps.",
      )
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6))
        const longitude = Number(position.coords.longitude.toFixed(6))
        onChange({
          latitude,
          longitude,
          mapUrl: googleMapsUrlForCoordinates(latitude, longitude),
          source: "GPS",
          accuracy: position.coords.accuracy,
        })
        setGpsLoading(false)
      },
      (positionError) => {
        setGpsError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "L’accès à votre position a été refusé. Autorisez la localisation ou collez un lien Google Maps."
            : "Votre position n’a pas pu être récupérée. Réessayez ou collez un lien Google Maps.",
        )
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }

  return (
    <div className="delivery-location-card" id="delivery-point">
      <div className="delivery-location-head">
        <div>
          <span className="eyebrow">Point de livraison</span>
          <strong>Choisissez le point exact sur Google Maps</strong>
          <p>
            Partagez votre position actuelle ou collez le lien du point choisi
            dans Google Maps. Un conseiller pourra ouvrir ce point pour vous
            rejoindre précisément.
          </p>
        </div>
        <span className="delivery-location-required">Requis</span>
      </div>

      {(error || linkError || gpsError) && (
        <p className="delivery-location-error" role="alert">
          {error || linkError || gpsError}
        </p>
      )}

      <div className="delivery-location-actions">
        <button
          className="secondary"
          type="button"
          onClick={useCurrentPosition}
          disabled={gpsLoading}
        >
          <Icon name="map" size={17} />
          {gpsLoading ? "Localisation en cours…" : "Utiliser ma position"}
        </button>
        <a
          className="secondary"
          href={openMapUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="arrow" size={16} />
          Ouvrir Google Maps
        </a>
      </div>

      <div className="delivery-location-link">
        <label htmlFor="delivery-map-link">Lien Google Maps</label>
        <div className="delivery-location-link-row">
          <input
            id="delivery-map-link"
            value={link}
            onChange={(event) => {
              setLink(event.target.value)
              if (linkError) setLinkError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                applyLink()
              }
            }}
            placeholder="https://maps.app.goo.gl/…"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="delivery-map-help"
          />
          <button className="secondary" type="button" onClick={applyLink}>
            Utiliser
          </button>
        </div>
      </div>
      <p className="delivery-location-help" id="delivery-map-help">
        Dans Google Maps : appuyez longuement sur le point exact, puis «
        Partager » → « Copier le lien ».
      </p>

      {value && (
        <div className="delivery-location-selected">
          <div>
            <span>
              {value.source === "GPS"
                ? "Position actuelle partagée"
                : "Point Google Maps enregistré"}
            </span>
            <strong>
              {latitude !== null && longitude !== null
                ? formatCoordinates(latitude, longitude)
                : "Lien de localisation prêt à être consulté"}
            </strong>
            {value.accuracy ? (
              <small>
                Précision approximative : {Math.round(value.accuracy)} m
              </small>
            ) : null}
          </div>
          <button
            className="delivery-location-clear"
            type="button"
            onClick={() => {
              onChange(null)
              setLinkError(null)
              setGpsError(null)
            }}
          >
            Retirer
          </button>
        </div>
      )}

      {value && latitude !== null && longitude !== null && (
        <div className="delivery-location-map">
          <iframe
            title="Aperçu du point de livraison sur Google Maps"
            src={googleMapsEmbedUrl(latitude, longitude)}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      )}

      {value && !hasCoordinates && (
        <p className="delivery-location-help">
          Le lien court a bien été enregistré. L’aperçu de la carte sera
          disponible dès que le conseiller ouvrira le lien.
        </p>
      )}
    </div>
  )
}
