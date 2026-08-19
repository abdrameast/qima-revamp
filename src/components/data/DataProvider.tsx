'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AllData, DataEnvelope, DataOrigin } from '@/lib/data-types'
import type { AppErrorKind } from '@/lib/errors'

/**
 * Charge les données une fois pour toute la session de navigation.
 *
 * Le provider est monté dans le layout du tableau de bord : il survit aux
 * changements d'onglet, il n'y a donc pas de rechargement en naviguant.
 */

export interface DataError {
  kind: AppErrorKind | 'network'
  message: string
  detail?: string
  retryable: boolean
  correlationId?: string
}

export type RefreshState = 'idle' | 'refreshing' | 'error'

export interface DataContextValue {
  data: AllData | null
  loading: boolean
  error: DataError | null

  /** Instant de la dernière synchronisation réussie, ISO 8601. */
  syncedAt: string | null
  origin: DataOrigin | null
  /** Âge des données, en secondes, au moment de la réception. */
  ageSeconds: number | null
  /** `true` si les données servies ont dépassé leur durée de fraîcheur. */
  stale: boolean

  refreshState: RefreshState
  /** Échec du dernier rafraîchissement, sans effacer les données affichées. */
  refreshError: DataError | null
  refresh: () => void
  /** Relance un chargement complet après un échec initial. */
  retry: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function useData(): DataContextValue {
  const context = useContext(DataContext)
  if (!context) {
    throw new Error("useData doit être utilisé à l'intérieur de <DataProvider>")
  }
  return context
}

// ---------------------------------------------------------------------------

interface ApiErrorBody {
  kind?: AppErrorKind
  error?: string
  detail?: string
  retryable?: boolean
  correlationId?: string
}

const NETWORK_ERROR: DataError = {
  kind: 'network',
  message: 'Impossible de joindre le serveur.',
  detail: 'Vérifiez votre connexion réseau, puis réessayez.',
  retryable: true,
}

async function readError(response: Response): Promise<DataError> {
  let body: ApiErrorBody = {}
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    // Réponse non JSON : on conserve les valeurs par défaut ci-dessous.
  }
  return {
    kind: body.kind ?? 'internal',
    message: body.error ?? `Erreur ${response.status}`,
    detail: body.detail,
    retryable: body.retryable ?? response.status >= 500,
    correlationId: body.correlationId,
  }
}

/** Résultat d'un appel, sans effet de bord sur l'état React. */
type FetchOutcome =
  | { ok: true; envelope: DataEnvelope }
  | { ok: false; error: DataError }

async function fetchData(mode: 'initial' | 'refresh'): Promise<FetchOutcome> {
  try {
    const response = await fetch('/api/data', {
      method: mode === 'refresh' ? 'POST' : 'GET',
      // Le serveur répond déjà `no-store` ; on le confirme côté client pour
      // qu'aucune réponse mémorisée par le navigateur ne soit resservie.
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) return { ok: false, error: await readError(response) }
    return { ok: true, envelope: (await response.json()) as DataEnvelope }
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [envelope, setEnvelope] = useState<DataEnvelope | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<DataError | null>(null)

  const [refreshState, setRefreshState] = useState<RefreshState>('idle')
  const [refreshError, setRefreshError] = useState<DataError | null>(null)

  /** Empêche deux requêtes simultanées : un double-clic ne produit qu'un appel. */
  const inFlight = useRef(false)

  /**
   * Chargement initial.
   *
   * Aucun `setState` n'est appelé de façon synchrone dans le corps de l'effet :
   * tout se produit **après** l'attente réseau. C'est ce qui évite le rendu en
   * cascade que signale le compilateur React — et l'état de départ
   * (`loading: true`) est déjà celui qu'il faut afficher.
   */
  useEffect(() => {
    let cancelled = false
    inFlight.current = true

    void fetchData('initial').then((outcome) => {
      inFlight.current = false
      if (cancelled) return

      if (outcome.ok) {
        setEnvelope(outcome.envelope)
        setError(null)
      } else {
        setError(outcome.error)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const retry = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    setError(null)

    void fetchData('initial').then((outcome) => {
      inFlight.current = false
      if (outcome.ok) {
        setEnvelope(outcome.envelope)
        setError(null)
      } else {
        setError(outcome.error)
      }
      setLoading(false)
    })
  }, [])

  const refresh = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshState('refreshing')
    setRefreshError(null)

    void fetchData('refresh').then((outcome) => {
      inFlight.current = false

      if (outcome.ok) {
        setEnvelope(outcome.envelope)
        setError(null)
        setRefreshState('idle')
      } else {
        // Un rafraîchissement raté ne doit pas effacer ce qui est déjà affiché :
        // on signale l'échec et on conserve la dernière synchronisation réussie.
        setRefreshState('error')
        setRefreshError(outcome.error)
      }
    })
  }, [])

  const value = useMemo<DataContextValue>(
    () => ({
      data: envelope?.data ?? null,
      loading,
      error,
      syncedAt: envelope?.syncedAt ?? null,
      origin: envelope?.origin ?? null,
      ageSeconds: envelope?.ageSeconds ?? null,
      stale: envelope?.stale ?? false,
      refreshState,
      refreshError,
      refresh,
      retry,
    }),
    [envelope, loading, error, refreshState, refreshError, refresh, retry],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
