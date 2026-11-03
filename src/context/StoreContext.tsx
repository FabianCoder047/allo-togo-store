import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  api,
  clearSessionMarker,
  errorMessage,
  hasSessionMarker,
  setAccessToken,
  setSessionExpiredHandler,
} from "../lib/api"
import { productSelectionTotal } from "../lib/catalog"
import { identifyAnalytics, resetAnalytics, trackEvent } from "../lib/analytics"
import type { Product, StaffUser } from "../types"

type ToastTone = "success" | "error" | "info"
type Toast = { message: string , tone: ToastTone }
type CartSelection = { quantity: number; cartonCount: number }

interface StoreContextValue {
  products: Product[]
  services: Product[]
  loadingCatalog: boolean
  catalogError: string | null
  reloadCatalog: () => Promise<void>
  cart: Record<string, CartSelection>
  addToCart: (id: string, quantity?: number, cartonCount?: number) => void
  setQuantity: (id: string, quantity: number) => void
  setCartonCount: (id: string, cartonCount: number) => void
  removeFromCart: (id: string) => void
  clearCart: () => void
  cartCount: number
  cartSubtotal: number
  cartLines: Array<{
    product: Product
    quantity: number
    cartonCount: number
  }>
  user: StaffUser | null
  authLoading: boolean
  login: (email: string, password: string) => Promise<StaffUser>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  toast: Toast | null
  notify: (message: string, tone?: ToastTone) => void
  dismissToast: () => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

const CART_KEY = "allo.cart.v2"
const LEGACY_CART_KEY = "allo.cart.v1"

const readCart = (): Record<string, CartSelection> => {
  try {
    const raw =
      window.localStorage.getItem(CART_KEY) ??
      window.localStorage.getItem(LEGACY_CART_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const result: Record<string, CartSelection> = {}
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const selection =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : null
      const quantity = Number(
        typeof value === "number" ? value : selection?.quantity,
      )
      const cartonCount = Number(selection?.cartonCount ?? 0)
      if (
        key &&
        Number.isInteger(quantity) &&
        quantity >= 0 &&
        Number.isInteger(cartonCount) &&
        cartonCount >= 0 &&
        quantity + cartonCount > 0
      ) {
        const normalizedQuantity = Math.min(quantity, 99)
        result[key] = {
          quantity: normalizedQuantity,
          cartonCount: Math.min(cartonCount, 99 - normalizedQuantity),
        }
      }
    }
    return result
  } catch {
    return {}
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [services, setServices] = useState<Product[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [cart, setCart] = useState<Record<string, CartSelection>>(readCart)
  const [user, setUser] = useState<StaffUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [toast, setToast] = useState<Toast | null>(null)

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ message, tone })
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(
      () => setToast(null),
      toast.tone === "error" ? 6500 : 4500,
    )
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    if (user) identifyAnalytics(user)
    else resetAnalytics()
  }, [user])

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null)
      notify("Votre session a expiré. Merci de vous reconnecter.", "error")
    })
    return () => setSessionExpiredHandler(null)
  }, [notify])

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      if (!hasSessionMarker()) {
        if (!cancelled) setAuthLoading(false)
        return
      }
      try {
        const session = await api.auth.refresh()
        if (cancelled) return
        setAccessToken(session.accessToken)
        setUser(session.user)
      } catch {
        if (!cancelled) {
          clearSessionMarker()
          setUser(null)
        }
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  const reloadCatalog = useCallback(async () => {
    setLoadingCatalog(true)
    setCatalogError(null)
    try {
      const [catalog, serviceCatalog] = await Promise.all([
        api.catalog.products(),
        api.catalog.services(),
      ])
      setProducts(catalog)
      setServices(serviceCatalog)
    } catch (error) {
      setCatalogError(errorMessage(error))
    } finally {
      setLoadingCatalog(false)
    }
  }, [])

  useEffect(() => {
    void reloadCatalog()
  }, [reloadCatalog])

  const addToCart = useCallback(
    (id: string, quantity = 1, cartonCount = 0) => {
      setCart((current) => {
        const previous = current[id] ?? { quantity: 0, cartonCount: 0 }
        const remaining = Math.max(
          0,
          99 - previous.quantity - previous.cartonCount,
        )
        const nextQuantity = Math.min(
          remaining,
          Math.max(0, Math.trunc(quantity)),
        )
        const nextCartonCount = Math.min(
          remaining - nextQuantity,
          Math.max(0, Math.trunc(cartonCount)),
        )
        return {
          ...current,
          [id]: {
            quantity: previous.quantity + nextQuantity,
            cartonCount: previous.cartonCount + nextCartonCount,
          },
        }
      })
      trackEvent("cart_item_added", { productId: id, quantity, cartonCount })
    },
    [],
  )

  const setQuantity = useCallback((id: string, quantity: number) => {
    setCart((current) => {
      const previous = current[id] ?? { quantity: 0, cartonCount: 0 }
      const nextQuantity = Math.max(
        0,
        Math.min(
          99 - previous.cartonCount,
          Math.trunc(quantity),
        ),
      )
      if (nextQuantity === 0 && previous.cartonCount === 0) {
        const copy = { ...current }
        delete copy[id]
        return copy
      }
      return {
        ...current,
        [id]: { ...previous, quantity: nextQuantity },
      }
    })
  }, [])

  const setCartonCount = useCallback((id: string, cartonCount: number) => {
    setCart((current) => {
      const previous = current[id] ?? { quantity: 0, cartonCount: 0 }
      const nextCartonCount = Math.max(
        0,
        Math.min(99 - previous.quantity, Math.trunc(cartonCount)),
      )
      if (nextCartonCount === 0 && previous.quantity === 0) {
        const copy = { ...current }
        delete copy[id]
        return copy
      }
      return {
        ...current,
        [id]: { ...previous, cartonCount: nextCartonCount },
      }
    })
  }, [])

  const removeFromCart = useCallback((id: string) => {
    setCart((current) => {
      const copy = { ...current }
      delete copy[id]
      return copy
    })
  }, [])

  const clearCart = useCallback(() => setCart({}), [])

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.auth.login(email, password)
    setAccessToken(session.accessToken)
    setUser(session.user)
    return session.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch {
      // La session locale doit être vidée même si le serveur est injoignable.
    }
    setAccessToken(null)
    clearSessionMarker()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const current = await api.auth.me()
    setUser(current)
  }, [])

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, selection]) => {
          const product = products.find((item) => item.id === id)
          return product ? { product, ...selection } : null
        })
        .filter(
          (
            line,
          ): line is {
            product: Product
            quantity: number
            cartonCount: number
          } => Boolean(line),
        ),
    [cart, products],
  )

  const cartCount = useMemo(
    () =>
      cartLines.reduce(
        (sum, line) =>
          sum + line.quantity + line.cartonCount,
        0,
      ),
    [cartLines],
  )
  const cartSubtotal = useMemo(
    () =>
      cartLines.reduce(
        (sum, line) =>
          sum +
          productSelectionTotal(
            line.product,
            line.quantity,
            line.cartonCount,
          ),
        0,
      ),
    [cartLines],
  )

  const value = useMemo<StoreContextValue>(
    () => ({
      products,
      services,
      loadingCatalog,
      catalogError,
      reloadCatalog,
      cart,
      addToCart,
      setQuantity,
      setCartonCount,
      removeFromCart,
      clearCart,
      cartCount,
      cartSubtotal,
      cartLines,
      user,
      authLoading,
      login,
      logout,
      refreshUser,
      toast,
      notify,
      dismissToast,
    }),
    [
      products,
      services,
      loadingCatalog,
      catalogError,
      reloadCatalog,
      cart,
      addToCart,
      setQuantity,
      setCartonCount,
      removeFromCart,
      clearCart,
      cartCount,
      cartSubtotal,
      cartLines,
      user,
      authLoading,
      login,
      logout,
      refreshUser,
      toast,
      notify,
      dismissToast,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => {
  const context = useContext(StoreContext)
  if (!context)
    throw new Error("useStore doit être utilisé dans StoreProvider.")
  return context
}
