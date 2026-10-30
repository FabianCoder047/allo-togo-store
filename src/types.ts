export type ProductType = "GPS" | "DRINK" | "SERVICE"

export interface ProductImage {
  id: string
  url: string
  alt: string | null
  sortOrder: number
}

export interface ProductVideo {
  id: string
  url: string
  alt: string | null
  sortOrder: number
}

export interface WholesalePrice {
  minQuantity: number
  maxQuantity?: number | null
  unitPrice: number
}

export interface ProductSpecs {
  idealFor?: string
  installation?: string
  power?: string
  connectivity?: string
  tracking?: string
  alerts?: string
  sim?: string
  warranty?: string
  [key: string]: string | undefined
}

export interface Product {
  id: string
  categoryId: string
  name: string
  slug: string
  sku: string
  type: ProductType
  shortDescription: string | null
  description: string | null
  price: number
  previousPrice: number | null
  cartonPrice: number | null
  wholesalePrices: WholesalePrice[] | null
  quoteOnly: boolean
  specs: ProductSpecs | null
  stock: number | null
  manageStock: boolean
  available: boolean
  active: boolean
  featured: boolean
  sortOrder: number
  images: ProductImage[]
  videos: ProductVideo[]
  category: { id: string; name: string; slug: string; type: ProductType }
}

export interface Category {
  id: string
  name: string
  slug: string
  type: ProductType
  description: string | null
  active: boolean
  sortOrder: number
  _count?: { products: number }
}

export interface StaffUser {
  id: string
  name: string
  firstName?: string | null
  lastName?: string | null
  email: string
  role: "DIRECTOR" | "ADMIN" | "COMMERCIAL" | "TECHNICIAN" | "DELIVERY"
  phone?: string | null
  active?: boolean
  mustChangePassword?: boolean
  lastLoginAt?: string | null
}

export interface AuditLogEntry {
  id: string
  actorId: string | null
  actorType: "STAFF" | "CLIENT" | "SYSTEM"
  action: string
  entity: string
  entityId: string
  metadata: unknown
  ip: string | null
  userAgent: string | null
  createdAt: string
  actor: { id: string; name: string; role: string } | null
}

export interface AuditLogPage {
  data: AuditLogEntry[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface InfrastructureOverview {
  generatedAt: string
  system: {
    environment: string
    nodeVersion: string
    uptimeSeconds: number
    database: { status: "ok" | "degraded"; latencyMs: number }
    memory: { rssMb: number; heapUsedMb: number }
  }
  users: {
    active: number
    total: number
    byRole: Record<string, number>
  }
  catalog: {
    activeProducts: number
    totalProducts: number
    activeCategories: number
  }
  activity: {
    validSessions: number
    logins24h: number
    logins7d: number
    orders24h: number
    orders7d: number
    quotes24h: number
    quotes7d: number
  }
  integrations: {
    whatsapp: { provider: string; simulated: boolean; configured: boolean }
    email: { provider: string; simulated: boolean; configured: boolean }
    bictorys: { enabled: boolean; mode: string; mock: boolean }
  }
}

export interface TechnicalLogEntry {
  id: string
  time: string
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal"
  message: string
  details: Record<string, unknown>
}

export interface TechnicalLogPage {
  data: TechnicalLogEntry[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface OrderItem {
  id: string
  productId: string | null
  productName: string
  productSku: string | null
  productType: ProductType
  unitPrice: number
  quantity: number
  lineTotal: number
}

export interface OrderGroupCreated {
  groupRef: string
  customer: {
    name: string
    phone: string
    whatsapp: string | null
    email: string | null
  }
  orders: Array<{
    id: string
    orderNumber: string
    trackingCode: string
    categoryType: "GPS" | "DRINK"
    status: string
    fulfillmentMode: "LIVRAISON" | "RETRAIT_AGENCE"
    requiresTechnician: boolean
    subtotal: number
    deliveryFee: number
    total: number
    items: OrderItem[]
  }>
}

export interface TrackingTimelineEntry {
  status: string
  statusLabel: string
  comment: string | null
  createdAt: string
}

export interface PublicTracking {
  groupRef: string
  orderNumber: string
  trackingCode: string
  categoryType: "GPS" | "DRINK"
  status: string
  statusLabel: string
  paymentStatus: string
  customerPaymentChoice: "ESPECES" | "FLOOZ" | "MIXX_BY_YAS" | null
  customerPaymentChoiceAt: string | null
  operationalStatus: string
  operationalLabel: string
  fulfillmentMode: "LIVRAISON" | "RETRAIT_AGENCE"
  requiresTechnician: boolean
  createdAt: string
  updatedAt: string
  total: number
  totalLabel: string
  items: Array<{
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  timeline: TrackingTimelineEntry[]
  otherOrders: Array<{
    orderNumber: string
    categoryType: "GPS" | "DRINK"
    status: string
    statusLabel: string
  }>
  access: { conversationProtected: boolean; message: string }
}

export type MessageKind = "TEXT" | "AUDIO" | "LOCATION" | "IMAGE" | "VIDEO"

export interface ChatMessage {
  id: string
  authorType: "CLIENT" | "STAFF" | "SYSTEM"
  authorName: string | null
  body: string
  kind: MessageKind
  audioData?: string | null
  mediaData?: string | null
  mediaMimeType?: string | null
  mediaName?: string | null
  mediaSize?: number | null
  durationMs?: number | null
  latitude?: number | null
  longitude?: number | null
  accuracy?: number | null
  locationLabel?: string | null
  createdAt: string
}

export type TrackingMessage = ChatMessage

export type ChatMessagePayload = { kind: "TEXT"; body: string } | {
  kind: "AUDIO"
  audioData: string
  durationMs: number
  body?: string
} | {
  kind: "IMAGE"
  mediaData: string
  mediaMimeType?: string
  mediaName?: string
  mediaSize?: number
  body?: string
} | {
  kind: "VIDEO"
  mediaData: string
  mediaMimeType?: string
  mediaName?: string
  mediaSize?: number
  durationMs?: number
  body?: string
} | {
  kind: "LOCATION"
  latitude: number
  longitude: number
  accuracy?: number
  locationLabel?: string
}

export interface TrackingMessages {
  conversationId: string
  messages: TrackingMessage[]
}

export interface TrackingAccess {
  token: string
  expiresAt: string
  orderNumber: string
  trackingCode: string
}

export type TrackingPaymentChoice = { choice: "ESPECES" } | {
  choice: "FLOOZ" | "MIXX_BY_YAS"
  phone?: string
}

export interface TrackingPaymentChoiceResult {
  choice: "ESPECES" | "FLOOZ" | "MIXX_BY_YAS"
  paymentStatus: string
  paidAmount: number
  paymentId?: string
}

export interface OrderListRow {
  id: string
  orderNumber: string
  trackingCode: string
  categoryType: "GPS" | "DRINK"
  status: string
  operationalStatus: string
  paymentStatus: string
  paymentMode: string
  customerPaymentChoice: "ESPECES" | "FLOOZ" | "MIXX_BY_YAS" | null
  customerPaymentPhone: string | null
  customerPaymentChoiceAt: string | null
  fulfillmentMode: "LIVRAISON" | "RETRAIT_AGENCE"
  requiresTechnician: boolean
  customerName: string
  customerPhone: string
  customerWhatsapp: string | null
  customerEmail: string | null
  deliveryZone: string | null
  deliveryAddress: string | null
  deliveryInstructions: string | null
  deliveryLatitude: number | null
  deliveryLongitude: number | null
  deliveryMapUrl: string | null
  subtotal: number
  deliveryFee: number
  total: number
  paidAmount: number
  remainingDue: number
  createdAt: string
  confirmedAt: string | null
  pickupDeadlineAt: string | null
  fulfillmentCompletedAt: string | null
  closedAt: string | null
  items: OrderItem[]
  assignedTo: { id: string; name: string; role: string } | null
  group: { id: string; publicRef: string } | null
  _count?: { payments: number; notes: number }
}

export interface OrderHistoryEntry {
  id: string
  fromStatus: string | null
  toStatus: string
  fromOperational: string | null
  toOperational: string | null
  actorType: string
  actorName: string | null
  comment: string | null
  publicComment: boolean
  createdAt: string
  actor?: { name: string } | null
}

export interface Payment {
  id: string
  amount: number
  method: string
  reference: string | null
  createdAt: string
  receivedBy?: { name: string } | null
}

export interface OrderNote {
  id: string
  body: string
  createdAt: string
  author?: { name: string } | null
}

export interface Conversation {
  id: string
  visibility: "CLIENT" | "INTERNAL"
  messages: ChatMessage[]
  participants: Array<{ id: string; role: string; displayName: string }>
}

export type OrderAction = "confirm" | "reject" | "assign" | "start" | "deliver" | "fail" | "pickup" | "cancel"

export interface OrderDetail
  extends OrderListRow {
  /** Actions autorisées calculées par le backend pour l'utilisateur courant. */
  availableActions: OrderAction[]
  history: OrderHistoryEntry[]
  payments: Payment[]
  notes: OrderNote[]
  conversations: Conversation[]
  assignments: Array<{
    id: string
    type: string
    active: boolean
    isLead: boolean
    instructions: string | null
    staff: { id: string; name: string; role: string; phone: string | null }
  }>
}

export interface Dashboard {
  period: { from: string; to: string }
  indicators: {
    pendingConfirmation: number
    accepted: number
    preparing: number
    inProgress: number
    readyPickup: number
    deliveredPaid: number
    deliveredUnpaid: number
    cancelled: number
    failed: number
    paymentsReceived: number
    outstanding: number
    pendingQuotes: number
  }
  charts: {
    ordersByDay: Array<{ date: string; count: number }>
    paymentsByDay: Array<{ date: string; amount: number }>
    statusDistribution: Array<{ status: string; count: number }>
    fulfillmentDistribution: Array<{ fulfillmentMode: string; count: number }>
    salesByCategory: Array<{ categoryType: string; total: number; count: number }>
    staffActivity: Array<{
      id: string
      name: string
      role: string
      assignments: number
      completed: number
    }>
  }
  recentOrders: Array<{
    id: string
    orderNumber: string
    trackingCode: string
    customerName: string
    status: string
    paymentStatus: string
    total: number
    paidAmount: number
    createdAt: string
    categoryType: string
    items: Array<{ productName: string; quantity: number }>
    assignedTo: { name: string; role: string } | null
  }>
}

export interface QuoteRequest {
  id: string
  reference: string
  name: string
  phone: string
  email: string | null
  serviceId: string | null
  message: string
  status: string
  adminNotes: string | null
  createdAt: string
  updatedAt: string
  service?: { id: string; name: string } | null
}

export type AssistantAction = "ANSWER" | "ESCALATE" | "OUT_OF_SCOPE" | "CLARIFY"

export interface AssistantSuggestion {
  label: string
  path: string
}

export interface AssistantReply {
  reply: string
  action: AssistantAction
  escalated: boolean
  reference?: string
  suggestions?: AssistantSuggestion[]
}

export interface AssistantAlert {
  id: string
  assistantThreadId?: string | null
  status: string
  createdAt: string
  payload: {
    reference?: string
    customerMessage?: string
    conversation?: string[]
    sessionId?: string | null
    threadId?: string | null
    source?: string
    createdAt?: string
  } | null
}

export interface AssistantThreadMessage {
  id: string
  authorType: "CLIENT" | "AI" | "STAFF" | "SYSTEM" | string
  authorName: string
  body: string
  createdAt: string
}

export interface AssistantThread {
  id: string
  reference: string
  sessionId: string | null
  status: "OPEN" | "ANSWERED" | "RESOLVED" | string
  createdAt: string
  updatedAt: string
  messages: AssistantThreadMessage[]
}

export interface AssistantKnowledge {
  id: string
  question: string
  answer: string
  keywords: string
  sourceThreadId: string | null
  sourceMessageId: string | null
  createdById: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  createdBy?: { id: string; name: string } | null
}

export interface StaffNotification {
  id: string
  orderId: string | null
  assistantThreadId: string | null
  template: string
  status: string
  payload: Record<string, unknown> | null
  createdAt: string
}

export interface StaffMember {
  id: string
  name: string
  role: string
  phone: string | null
  active: boolean
  _count?: { assignments: number }
}

export interface ApiErrorShape {
  error?: { code?: string; message?: string; details?: unknown }
}
