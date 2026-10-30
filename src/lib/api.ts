import type {
  AssistantAlert,
  AssistantKnowledge,
  AssistantReply,
  AssistantThread,
  AssistantThreadMessage,
  AuditLogPage,
  Category,
  ChatMessage,
  ChatMessagePayload,
  Dashboard,
  InfrastructureOverview,
  OrderDetail,
  OrderGroupCreated,
  OrderListRow,
  Product,
  PublicTracking,
  QuoteRequest,
  StaffMember,
  StaffNotification,
  StaffUser,
  TechnicalLogPage,
  TrackingAccess,
  TrackingMessage,
  TrackingMessages,
  TrackingPaymentChoice,
  TrackingPaymentChoiceResult,
} from "../types"

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "/api"

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown
  rawBody?: BodyInit
  skipRefresh?: boolean
  retryTransient?: boolean
}

type RefreshResult = "ok" | "expired" | "unavailable"

const SESSION_MARKER = "allo_session"

let accessToken: string | null = null
let refreshPromise: Promise<RefreshResult> | null = null
let onSessionExpired: (() => void) | null = null

export const setAccessToken = (token: string | null) => {
  accessToken = token
}

export const getAccessToken = () => accessToken

export const setSessionExpiredHandler = (handler: (() => void) | null) => {
  onSessionExpired = handler
}

export const hasSessionMarker = () => {
  if (typeof document === "undefined") return false
  return document.cookie
    .split("; ")
    .some((cookie) => cookie === `${SESSION_MARKER}=1`)
}

export const clearSessionMarker = () => {
  if (typeof document === "undefined") return
  document.cookie = `${SESSION_MARKER}=; Max-Age=0; path=/; SameSite=Lax`
}

const wait = (delayMs: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMs))

const isTransientStatus = (status: number) =>
  status === 502 || status === 503 || status === 504

const refreshSession = async (): Promise<RefreshResult> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const callRefresh = () =>
          fetch(`${API_BASE}/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })

        let response = await callRefresh()
        for (
          let attempt = 0;
          attempt < 2 && isTransientStatus(response.status);
          attempt += 1
        ) {
          await wait(400 * (attempt + 1))
          response = await callRefresh()
        }
        if (response.status === 401) return "expired"
        if (!response.ok) return "unavailable"
        const payload = (await response.json()) as {
          data?: { accessToken?: string }
        }
        if (!payload.data?.accessToken) return "unavailable"
        accessToken = payload.data.accessToken
        return "ok"
      } catch {
        return "unavailable"
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

const parseError = async (response: Response): Promise<ApiError> => {
  let code = "UNKNOWN"
  let message = `Erreur ${response.status}`
  let details: unknown
  try {
    const payload = (await response.json()) as {
      error?: { code?: string message?: string details?: unknown }
    }
    if (payload.error) {
      code = payload.error.code ?? code
      message = payload.error.message ?? message
      details = payload.error.details
    } else if (isTransientStatus(response.status)) {
      code = "API_UNAVAILABLE"
      message =
        "L’API est momentanément indisponible. Réessayez dans quelques instants."
    }
  } catch {
    // Réponse non JSON (proxy, erreur réseau…)
    if (isTransientStatus(response.status)) {
      code = "API_UNAVAILABLE"
      message =
        "L’API est momentanément indisponible. Réessayez dans quelques instants."
    }
  }
  return new ApiError(response.status, code, message, details)
}

const request = async <T,>(
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const { body, rawBody, skipRefresh, retryTransient, headers, ...rest } =
    options
  const method = (rest.method ?? "GET").toUpperCase()
  const canRetryTransient = retryTransient ?? method === "GET"

  const perform = async (): Promise<Response> =>
    fetch(`${API_BASE}${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(rawBody !== undefined
          ? {
              "Content-Type":
                rawBody instanceof File
                  ? rawBody.type
                  : "application/octet-stream",
            }
          : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(headers ?? {}),
      },
      ...(body !== undefined
        ? { body: JSON.stringify(body) }
        : rawBody !== undefined
          ? { body: rawBody }
          : {}),
    })

  const performWithRetry = async (): Promise<Response> => {
    let response = await perform()
    if (canRetryTransient) {
      for (
        let attempt = 0;
        attempt < 2 && isTransientStatus(response.status);
        attempt += 1
      ) {
        await wait(400 * (attempt + 1))
        response = await perform()
      }
    }
    return response
  }

  let response = await performWithRetry()

  if (response.status === 401 && !skipRefresh) {
    const refreshed = await refreshSession()
    if (refreshed === "ok") {
      response = await performWithRetry()
    } else if (refreshed === "expired") {
      accessToken = null
      clearSessionMarker()
      onSessionExpired?.()
    } else {
      throw new ApiError(
        503,
        "API_UNAVAILABLE",
        "L’API est momentanément indisponible. Vos données sont conservées ; réessayez dans quelques instants.",
      )
    }
  }

  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const unwrap = async <T>(promise: Promise<{ data: T }>): Promise<T> =>
  (await promise).data

export const api = {
  // ── Assistant ────────────────────────────────────────────────────────────
  assistant: {
    ask: (payload: {
      message: string
      sessionId?: string
      history?: Array<{ role: "client" | "ai" text: string }>
    }) =>
      unwrap(
        request<{ data: AssistantReply }>("/assistant", {
          method: "POST",
          body: payload,
          skipRefresh: true,
        }),
      ),
    thread: (sessionId: string) =>
      unwrap(
        request<{ data: AssistantThread | null }>(
          `/assistant/thread/${encodeURIComponent(sessionId)}`,
          {
            skipRefresh: true,
          },
        ),
      ),
  },

  // ── Catalogue public ─────────────────────────────────────────────────────
  catalog: {
    products: (
      query: {
        type?: string
        search?: string
        category?: string
        featured?: boolean
      } = {},
    ) => {
      const params = new URLSearchParams()
      if (query.type) params.set("type", query.type)
      if (query.search) params.set("search", query.search)
      if (query.category) params.set("category", query.category)
      if (query.featured !== undefined)
        params.set("featured", String(query.featured))
      const suffix = params.size ? `?${params.toString()}` : ""
      return unwrap(request<{ data: Product[] }>(`/products${suffix}`))
    },
    product: (id: string) =>
      unwrap(request<{ data: Product }>(`/products/${encodeURIComponent(id)}`)),
    categories: (type?: string) =>
      unwrap(
        request<{ data: Category[] }>(
          `/categories${type ? `?type=${encodeURIComponent(type)}` : ""}`,
        ),
      ),
    services: () => unwrap(request<{ data: Product[] }>("/services")),
  },

  // ── Commandes ────────────────────────────────────────────────────────────
  orders: {
    create: (payload: {
      customer: {
        name: string
        phone: string
        whatsapp?: string | null
        email?: string | null
      }
      fulfillmentMode: "LIVRAISON" | "RETRAIT_AGENCE"
      delivery: {
        zone?: string
        address?: string
        instructions?: string
        contactPhone?: string
        latitude?: number | null
        longitude?: number | null
        mapUrl?: string | null
      }
      requiresTechnician: boolean
      items: Array<{ productId: string quantity: number }>
    }) =>
      unwrap(
        request<{ data: OrderGroupCreated }>("/orders", {
          method: "POST",
          body: payload,
        }),
      ),
    list: (query: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value))
      }
      const suffix = params.size ? `?${params.toString()}` : ""
      return request<{
        data: OrderListRow[]
        pagination: {
          page: number
          pageSize: number
          total: number
          totalPages: number
        }
      }>(`/orders${suffix}`)
    },
    get: (id: string) =>
      unwrap(
        request<{ data: OrderDetail }>(`/orders/${encodeURIComponent(id)}`),
      ),
    confirm: (id: string, comment?: string) =>
      request<{ data: OrderListRow }>(
        `/orders/${encodeURIComponent(id)}/confirm`,
        {
          method: "POST",
          body: { comment },
        },
      ),
    cancel: (id: string, reason: string) =>
      request<{ data: OrderListRow }>(
        `/orders/${encodeURIComponent(id)}/cancel`,
        {
          method: "POST",
          body: { reason },
        },
      ),
    reject: (id: string, reason: string) =>
      request<{ data: OrderListRow }>(
        `/orders/${encodeURIComponent(id)}/reject`,
        {
          method: "POST",
          body: { reason },
        },
      ),
    updateStatus: (
      id: string,
      status: string,
      comment?: string,
      publicComment = false,
    ) =>
      request<{ data: OrderListRow }>(
        `/orders/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          body: { status, comment, publicComment },
        },
      ),
    start: (id: string, comment?: string) =>
      request<{ data: OrderListRow }>(
        `/orders/${encodeURIComponent(id)}/start`,
        { method: "POST", body: { comment } },
      ),
    deliver: (id: string, comment?: string) =>
      request<{ data: OrderListRow }>(
        `/orders/${encodeURIComponent(id)}/deliver`,
        { method: "POST", body: { comment } },
      ),
    fail: (id: string, comment: string) =>
      request<{ data: OrderListRow }>(
        `/orders/${encodeURIComponent(id)}/fail`,
        { method: "POST", body: { comment } },
      ),
    pickup: (id: string, comment?: string) =>
      request<{ data: OrderListRow }>(
        `/orders/${encodeURIComponent(id)}/pickup`,
        { method: "POST", body: { comment } },
      ),
    assign: (
      id: string,
      staffIds: string[],
      leadStaffId: string,
      instructions?: string,
    ) =>
      request<{ data: unknown }>(`/orders/${encodeURIComponent(id)}/assign`, {
        method: "POST",
        body: { staffIds, leadStaffId, instructions },
      }),
    addNote: (id: string, body: string) =>
      request<{ data: unknown }>(`/orders/${encodeURIComponent(id)}/notes`, {
        method: "POST",
        body: { body },
      }),
    recordPayment: (
      id: string,
      payload: {
        amount: number
        method: string
        reference?: string
        idempotencyKey?: string
      },
    ) =>
      request<{ data: { created: unknown order: OrderListRow } }>(
        `/orders/${encodeURIComponent(id)}/payments`,
        {
          method: "POST",
          body: payload,
        },
      ),
    conversations: (id: string) =>
      unwrap(
        request<{
          data: Array<{
            id: string
            visibility: "CLIENT" | "INTERNAL"
            messages: ChatMessage[]
            participants: Array<{ id: string role: string displayName: string }>
          }>
        }>(`/orders/${encodeURIComponent(id)}/conversations`),
      ),
  },

  conversations: {
    reply: (id: string, payload: ChatMessagePayload) =>
      unwrap(
        request<{ data: ChatMessage }>(
          `/conversations/${encodeURIComponent(id)}/messages`,
          {
            method: "POST",
            body: payload,
          },
        ),
      ),
  },

  // ── Suivi public ─────────────────────────────────────────────────────────
  tracking: {
    get: (code: string) =>
      unwrap(
        request<{ data: PublicTracking }>(
          `/tracking/${encodeURIComponent(code)}`,
        ),
      ),
    access: (code: string, phone: string) =>
      unwrap(
        request<{ data: TrackingAccess }>(
          `/tracking/${encodeURIComponent(code)}/access`,
          {
            method: "POST",
            body: { phone },
          },
        ),
      ),
    paymentChoice: (
      code: string,
      token: string,
      payload: TrackingPaymentChoice,
    ) =>
      unwrap(
        request<{ data: TrackingPaymentChoiceResult }>(
          `/tracking/${encodeURIComponent(code)}/payment-choice?token=${encodeURIComponent(token)}`,
          { method: "POST", body: payload },
        ),
      ),
    messages: (code: string, token: string) =>
      unwrap(
        request<{ data: TrackingMessages }>(
          `/tracking/${encodeURIComponent(code)}/messages?token=${encodeURIComponent(token)}`,
        ),
      ),
    send: (code: string, token: string, payload: ChatMessagePayload) =>
      unwrap(
        request<{ data: TrackingMessage }>(
          `/tracking/${encodeURIComponent(code)}/messages?token=${encodeURIComponent(token)}`,
          { method: "POST", body: payload },
        ),
      ),
  },

  // ── Devis ────────────────────────────────────────────────────────────────
  quotes: {
    create: (payload: {
      name: string
      phone: string
      email?: string | null
      serviceId?: string | null
      message: string
    }) =>
      unwrap(
        request<{
          data: {
            id: string
            reference: string
            status: string
            createdAt: string
          }
        }>("/quotes", {
          method: "POST",
          body: payload,
        }),
      ),
    list: (query: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value))
      }
      const suffix = params.size ? `?${params.toString()}` : ""
      return request<{
        data: QuoteRequest[]
        pagination: {
          page: number
          pageSize: number
          total: number
          totalPages: number
        }
      }>(`/quotes${suffix}`)
    },
    update: (
      id: string,
      payload: {
        status?: string
        adminNotes?: string | null
        assignedToId?: string | null
      },
    ) =>
      unwrap(
        request<{ data: QuoteRequest }>(`/quotes/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: payload,
        }),
      ),
  },

  // ── Authentification ─────────────────────────────────────────────────────
  auth: {
    login: (email: string, password: string) =>
      unwrap(
        request<{ data: { accessToken: string user: StaffUser } }>(
          "/auth/login",
          {
            method: "POST",
            body: { email, password },
            skipRefresh: true,
          },
        ),
      ),
    refresh: () =>
      unwrap(
        request<{ data: { accessToken: string user: StaffUser } }>(
          "/auth/refresh",
          {
            method: "POST",
            body: {},
            skipRefresh: true,
            retryTransient: true,
          },
        ),
      ),
    logout: () =>
      request<void>("/auth/logout", {
        method: "POST",
        body: {},
        skipRefresh: true,
      }),
    me: () => unwrap(request<{ data: StaffUser }>("/auth/me")),
    updateProfile: (payload: {
      firstName: string
      lastName: string
      phone?: string | null
    }) =>
      unwrap(
        request<{ data: StaffUser }>("/auth/profile", {
          method: "PATCH",
          body: payload,
        }),
      ),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<void>("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      }),
  },

  // ── Administration ───────────────────────────────────────────────────────
  admin: {
    dashboard: (
      query: { from?: string to?: string categoryType?: string } = {},
    ) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value) params.set(key, value)
      }
      const suffix = params.size ? `?${params.toString()}` : ""
      return unwrap(request<{ data: Dashboard }>(`/admin/dashboard${suffix}`))
    },
    users: (query: { role?: string includeInactive?: boolean } = {}) => {
      const params = new URLSearchParams()
      if (query.role) params.set("role", query.role)
      if (query.includeInactive) params.set("includeInactive", "true")
      const suffix = params.size ? `?${params.toString()}` : ""
      return unwrap(request<{ data: StaffUser[] }>(`/admin/users${suffix}`))
    },
    createUser: (payload: {
      name: string
      email: string
      role: string
      phone?: string
    }) =>
      unwrap(
        request<{ data: StaffUser }>("/admin/users", {
          method: "POST",
          body: payload,
        }),
      ),
    updateUser: (
      id: string,
      payload: {
        name?: string
        email?: string
        role?: string
        phone?: string | null
        active?: boolean
      },
    ) =>
      unwrap(
        request<{ data: StaffUser }>(`/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: payload,
        }),
      ),
    deleteUser: (id: string) =>
      unwrap(
        request<{ data: StaffUser }>(`/admin/users/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      ),
    resetPassword: (id: string, newPassword: string) =>
      unwrap(
        request<{ data: unknown }>(
          `/admin/users/${encodeURIComponent(id)}/reset-password`,
          {
            method: "POST",
            body: { newPassword },
          },
        ),
      ),
    payments: (query: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value))
      }
      const suffix = params.size ? `?${params.toString()}` : ""
      return request<{
        data: Array<Record<string, unknown>>
        pagination: Record<string, number>
      }>(`/admin/payments${suffix}`)
    },
    audit: (query: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value))
      }
      const suffix = params.size ? `?${params.toString()}` : ""
      return request<AuditLogPage>(`/admin/audit${suffix}`)
    },
    technicalLogs: (
      query: Record<string, string | number | undefined> = {},
    ) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value))
      }
      const suffix = params.size ? `?${params.toString()}` : ""
      return request<TechnicalLogPage>(`/admin/technical-logs${suffix}`)
    },
    infrastructure: () =>
      unwrap(
        request<{ data: InfrastructureOverview }>("/admin/infrastructure"),
      ),
    notifications: (status?: string) =>
      unwrap(
        request<{ data: Array<Record<string, unknown>> }>(
          `/admin/notifications${status ? `?status=${status}` : ""}`,
        ),
      ),
    processNotifications: () =>
      unwrap(
        request<{ data: { processed: number } }>(
          "/admin/notifications/process",
          { method: "POST" },
        ),
      ),
    settings: () =>
      unwrap(
        request<{
          data: {
            environment: {
              deliveryFee: number
              deliveryCanRecordPayment: boolean
              bictorysEnabled: boolean
              bictorysMode: string
              whatsapp: {
                provider: string
                simulated: boolean
                configured: boolean
              }
              email: { provider: string simulated: boolean configured: boolean }
            }
            stored: Record<string, unknown>
          }
        }>("/admin/settings"),
      ),
    updateSetting: (key: string, value: unknown) =>
      unwrap(
        request<{ data: unknown }>(
          `/admin/settings/${encodeURIComponent(key)}`,
          { method: "PUT", body: { value } },
        ),
      ),
    staffMembers: () =>
      unwrap(request<{ data: StaffMember[] }>("/staff/members")),
    catalog: {
      products: (
        query: Record<string, string | number | boolean | undefined> = {},
      ) => {
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined && value !== "")
            params.set(key, String(value))
        }
        const suffix = params.size ? `?${params.toString()}` : ""
        return unwrap(
          request<{ data: Product[] }>(`/admin/catalog/products${suffix}`),
        )
      },
      categories: () =>
        unwrap(request<{ data: Category[] }>("/admin/catalog/categories")),
      updateProduct: (id: string, payload: Record<string, unknown>) =>
        unwrap(
          request<{ data: Product }>(
            `/admin/catalog/products/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              body: payload,
            },
          ),
        ),
      createProduct: (payload: Record<string, unknown>) =>
        unwrap(
          request<{ data: Product }>("/admin/catalog/products", {
            method: "POST",
            body: payload,
          }),
        ),
      uploadMedia: (file: File) =>
        unwrap(
          request<{ data: { url: string type: string } }>(
            "/admin/catalog/uploads",
            {
              method: "POST",
              rawBody: file,
            },
          ),
        ),
      deleteProduct: (id: string) =>
        request<void>(`/admin/catalog/products/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      adjustStock: (id: string, quantity: number, reason?: string) =>
        unwrap(
          request<{ data: Product }>(
            `/admin/catalog/products/${encodeURIComponent(id)}/stock`,
            {
              method: "POST",
              body: { quantity, reason },
            },
          ),
        ),
    },
  },

  // ── Espace intervenant ───────────────────────────────────────────────────
  staff: {
    notifications: () =>
      unwrap(request<{ data: StaffNotification[] }>("/staff/notifications")),
    assistantAlerts: () =>
      unwrap(request<{ data: AssistantAlert[] }>("/staff/assistant-alerts")),
    assistantThread: (key: string) =>
      unwrap(
        request<{ data: AssistantThread }>(
          `/staff/assistant-threads/${encodeURIComponent(key)}`,
        ),
      ),
    replyAssistantThread: (key: string, body: string) =>
      unwrap(
        request<{ data: AssistantThreadMessage }>(
          `/staff/assistant-threads/${encodeURIComponent(key)}/messages`,
          {
            method: "POST",
            body: { body },
          },
        ),
      ),
    updateAssistantThread: (
      key: string,
      status: "OPEN" | "ANSWERED" | "RESOLVED",
    ) =>
      unwrap(
        request<{ data: AssistantThread }>(
          `/staff/assistant-threads/${encodeURIComponent(key)}`,
          {
            method: "PATCH",
            body: { status },
          },
        ),
      ),
    missions: (query: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value))
      }
      const suffix = params.size ? `?${params.toString()}` : ""
      return request<{
        data: OrderListRow[]
        pagination: {
          page: number
          pageSize: number
          total: number
          totalPages: number
        }
      }>(`/staff/missions${suffix}`)
    },
    knowledge: {
      list: (query?: { active?: boolean q?: string }) => {
        const params = new URLSearchParams()
        if (query?.active !== undefined)
          params.set("active", String(query.active))
        if (query?.q) params.set("q", query.q)
        const suffix = params.size ? `?${params.toString()}` : ""
        return unwrap(
          request<{ data: AssistantKnowledge[] }>(
            `/api/assistant/knowledge${suffix}`,
          ),
        )
      },
      create: (payload: {
        question: string
        answer: string
        keywords: string
        sourceThreadId?: string | null
        sourceMessageId?: string | null
      }) =>
        unwrap(
          request<{ data: AssistantKnowledge }>("/api/assistant/knowledge", {
            method: "POST",
            body: payload,
          }),
        ),
    },
  },
}

export const errorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return "Trop de tentatives. Merci de patienter quelques instants."
    if (error.status === 0)
      return "Le serveur est injoignable. Vérifiez que l’API est démarrée."
    return error.message
  }
  if (error instanceof TypeError)
    return "Le serveur est injoignable. Vérifiez que l’API est démarrée."
  if (error instanceof Error) return error.message
  return "Une erreur inattendue est survenue."
}
