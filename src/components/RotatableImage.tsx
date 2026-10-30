import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { Icon } from "./Icon"

type Rotation = { x: number , y: number }

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/**
 * Visuel produit manipulable : un glissement horizontal ou vertical fait
 * pivoter l’image dans l’espace. Le geste fonctionne à la souris comme au
 * doigt, avec un recentrage au double-clic et des commandes clavier.
 */
export function RotatableImage({
  src,
  alt,
  className = "",
  showHint = true,
}: {
  src: string
  alt: string
  className?: string
  showHint?: boolean
}) {
  const [rotation, setRotation] = useState<Rotation>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origin: Rotation
  } | null>(null)

  const reset = () => setRotation({ x: 0, y: 0 })

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: rotation,
    }
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    setRotation({
      x: clamp(drag.origin.x - deltaY * 0.22, -28, 28),
      y: clamp(drag.origin.y + deltaX * 0.38, -55, 55),
    })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 8
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      setRotation((current) => ({
        ...current,
        y: clamp(current.y - step, -55, 55),
      }))
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      setRotation((current) => ({
        ...current,
        y: clamp(current.y + step, -55, 55),
      }))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setRotation((current) => ({
        ...current,
        x: clamp(current.x + step, -28, 28),
      }))
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setRotation((current) => ({
        ...current,
        x: clamp(current.x - step, -28, 28),
      }))
    } else if (event.key === "Escape" || event.key === "Enter") {
      reset()
    }
  }

  const moved = rotation.x !== 0 || rotation.y !== 0
  const style = {
    transform: `perspective(900px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
  } satisfies CSSProperties

  return (
    <div
      className={`rotatable ${className} ${dragging ? "dragging" : ""}`.trim()}
      tabIndex={0}
      role="group"
      aria-label={`${alt}. Faites glisser ou utilisez les flèches pour pivoter le visuel.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    >
      <img
        src={src}
        alt={alt}
        style={style}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      />
      {showHint && (
        <span className="rotatable-hint" aria-hidden="true">
          <Icon name="rotate" size={12} /> Glissez pour pivoter
        </span>
      )}
      {moved && (
        <button
          type="button"
          className="rotatable-reset"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            reset()
          }}
          aria-label="Recentrer le visuel"
          title="Recentrer le visuel"
        >
          <Icon name="rotate" size={14} />
        </button>
      )}
    </div>
  )
}
