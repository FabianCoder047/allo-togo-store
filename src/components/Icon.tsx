import type { ReactNode } from "react"

export type IconName = "arrow" | "attach" | "bag" | "bell" | "building" | "can" | "car" | "chat" | "check" | "chevron" | "clock" | "catalog" | "compare" | "download" | "fleet" | "headset" | "eye" | "eyeOff" | "home" | "logout" | "mail" | "map" | "menu" | "lock" | "leader" | "mic" | "minus" | "pause" | "play" | "motorbike" | "phone" | "plus" | "rotate" | "search" | "send" | "services" | "shield" | "spark" | "stop" | "tracker" | "trash" | "truck" | "user" | "whatsapp" | "x"

const iconPaths: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  bag: (
    <>
      <path d="M6 8h12l1 13H5L6 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  x: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </>
  ),
  chevron: (
    <>
      <path d="m9 18 6-6-6-6" />
    </>
  ),
  map: (
    <>
      <path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3" />
    </>
  ),
  leader: (
    <>
      <path d="m3 8 4 3 5-6 5 6 4-3-2 12H5L3 8Z" />
      <path d="M7 15h10" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.2 6.2C3.5 7.8 2 12 2 12s3.5 6 10 6c1 0 1.9-.2 2.8-.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.7 3 8.2 7 10 4-1.8 7-5.3 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  fleet: (
    <>
      <rect x="3" y="7" width="14" height="9" rx="2" />
      <path d="M17 10h2l2 3v3h-4M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6 7l2-3h5l2 3" />
    </>
  ),
  headset: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14v4h4v-6H4Zm16 0v4h-4v-6h4ZM16 20h-4" />
    </>
  ),
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  car: (
    <>
      <path d="m5 11 2-5h10l2 5M3 12h18v6H3zM6 18v2m12-2v2M7 14h.01M17 14h.01" />
    </>
  ),
  chat: (
    <>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5A8 8 0 1 1 21 15Z" />
      <path d="M8 11h.01M12 11h.01M16 11h.01" />
    </>
  ),
  motorbike: (
    <>
      <circle cx="5" cy="17" r="3" />
      <circle cx="19" cy="17" r="3" />
      <path d="m8 17 3-6h4l4 6M9 8h4l2 3M5 17l4-9" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5l8-2v18M12 8h8v13M2 21h20M7 8h2m-2 4h2m-2 4h2m8-4h1m-1 4h1" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h12v11H3zM15 10h4l2 3v4h-6M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </>
  ),
  check: (
    <>
      <path d="m5 12 4 4L19 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 1.3 4.7L18 9l-4.7 1.3L12 15l-1.3-4.7L6 9l4.7-1.3L12 3ZM18 15l.7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z" />
    </>
  ),
  phone: (
    <>
      <path d="M7 3h3l1 5-2 1a15 15 0 0 0 6 6l1-2 5 1v3c0 2-2 4-4 4C9 20 4 15 3 7c0-2 2-4 4-4Z" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M20 11.5a8 8 0 0 1-12 7L4 20l1.4-3.8A8 8 0 1 1 20 11.5Z" />
      <path d="M9 8c.5 3 2 4.5 5 5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  minus: (
    <>
      <path d="M5 12h14" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </>
  ),
  play: (
    <>
      <path d="m8 5 11 7-11 7V5Z" />
    </>
  ),
  pause: (
    <>
      <path d="M9 5v14M15 5v14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
    </>
  ),
  stop: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H5v16h4M14 8l4 4-4 4M18 12H9" />
    </>
  ),
  tracker: (
    <>
      <rect x="7" y="8" width="10" height="13" rx="2.5" />
      <path d="M12 8V5M9.5 5h5" />
      <circle cx="12" cy="14" r="1.6" />
      <path d="M4.5 6.5a4 4 0 0 0 0 5M19.5 6.5a4 4 0 0 1 0 5M7 9a2.5 2.5 0 0 0 0 3M17 9a2.5 2.5 0 0 1 0 3" />
    </>
  ),
  can: (
    <>
      <path d="M7.5 5.5h9l1 2.5v10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V8l1-2.5Z" />
      <path d="M7.5 5.5c0-1 2-1.5 4.5-1.5s4.5.5 4.5 1.5M7.5 8.5h9M9 13h6M9 16.5h4" />
    </>
  ),
  services: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
    </>
  ),
  catalog: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
    </>
  ),
  compare: (
    <>
      <rect x="3" y="5" width="7.5" height="14" rx="1.5" />
      <rect x="13.5" y="5" width="7.5" height="14" rx="1.5" />
      <path d="M5.5 9H7M5.5 12H7M17 9h1.5M17 12h1.5" />
    </>
  ),
  attach: (
    <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l7.5-7.5" />
  ),
  rotate: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  download: (
    <path d="M21 15l-3-3m0 6l-3 3M15 3v16M9 12h6" />
  )
}

export function Icon({ name, size = 20 }: { name: IconName, size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  )
}
