import 'server-only'
import { getDataCacheTtlSeconds } from './env'
import { synchronize, type SyncResult } from './data-source'
import type { DataEnvelope } from './data-types'
import type { Logger } from './logger'

/**
 * Cache serveur des données synchronisées.
 *
 * ## Pourquoi côté serveur et pas via `Cache-Control`
 *
 * L'implémentation d'origine mettait `Cache-Control: public, s-maxage=3600`
 * sur une réponse **authentifiée**. Un cache partagé (CDN Netlify, proxy
 * d'entreprise) pouvait donc stocker les données financières et les resservir
 * à un autre visiteur. Le cache est désormais entièrement ici : il ne franchit
 * jamais la frontière du serveur, et les réponses HTTP sont `no-store`.
 *
 * ## Déduplication des requêtes concurrentes
 *
 * Une synchronisation Drive prend plusieurs secondes. Sans protection, N
 * requêtes simultanées après expiration déclencheraient N synchronisations —
 * gaspillage de quota et risque de 429. Le `inFlight` ci-dessous garantit
 * qu'une seule synchronisation est active à un instant donné ; les autres
 * appelants attendent le même résultat.
 *
 * ## Portée
 *
 * Le cache vit dans la mémoire du processus. Sur un hébergeur multi-instances
 * comme Netlify, chaque instance a le sien. C'est sans conséquence de
 * sécurité — les données sont identiques pour tous les utilisateurs autorisés
 * — mais cela réduit le taux de succès. Voir SECURITY.md §5.
 */

interface CacheEntry {
  result: SyncResult
  /** Instant de stockage, en millisecondes epoch. */
  storedAt: number
}

let entry: CacheEntry | null = null
let inFlight: Promise<SyncResult> | null = null

function ageSeconds(storedAt: number): number {
  return Math.max(0, Math.round((Date.now() - storedAt) / 1000))
}

/** Construit l'enveloppe transmise au client. */
function toEnvelope(cached: CacheEntry, fromCache: boolean): DataEnvelope {
  const age = ageSeconds(cached.storedAt)
  return {
    data: cached.result.data,
    syncedAt: cached.result.syncedAt,
    origin: cached.result.origin,
    fromCache,
    ageSeconds: age,
    stale: age > getDataCacheTtlSeconds(),
  }
}

/**
 * Lance une synchronisation, en réutilisant celle déjà en cours s'il y en a une.
 */
function runSynchronization(log: Logger): Promise<SyncResult> {
  if (inFlight) {
    log.debug('data.cache.join_inflight')
    return inFlight
  }

  inFlight = synchronize(log)
    .then((result) => {
      entry = { result, storedAt: Date.now() }
      return result
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/**
 * Renvoie les données, depuis le cache si elles sont encore fraîches.
 *
 * En cas d'échec de synchronisation alors qu'une version périmée est en
 * cache, on **resert la version périmée** plutôt que d'afficher une page
 * d'erreur : pour un tableau de bord de direction, une donnée d'hier
 * clairement étiquetée « périmée » vaut mieux qu'un écran vide. L'échec reste
 * journalisé, et l'interface signale l'état.
 */
export async function getData(log: Logger): Promise<DataEnvelope> {
  const ttl = getDataCacheTtlSeconds()

  if (entry && ageSeconds(entry.storedAt) <= ttl) {
    log.debug('data.cache.hit', { ageSeconds: ageSeconds(entry.storedAt) })
    return toEnvelope(entry, true)
  }

  const stale = entry
  try {
    await runSynchronization(log)
    return toEnvelope(entry!, false)
  } catch (error) {
    if (stale) {
      log.warn('data.cache.serving_stale', {
        ageSeconds: ageSeconds(stale.storedAt),
        reason: error instanceof Error ? error.message : String(error),
      })
      return toEnvelope(stale, true)
    }
    throw error
  }
}

/**
 * Force une synchronisation en ignorant le cache.
 *
 * Utilisé par l'action « rafraîchir » de l'interface. Si une synchronisation
 * est déjà en cours, on s'y raccroche au lieu d'en démarrer une seconde : deux
 * clics rapprochés ne produisent qu'un seul appel à Drive.
 */
export async function refreshData(log: Logger): Promise<DataEnvelope> {
  log.info('data.cache.refresh_requested', { hadCache: entry !== null })
  await runSynchronization(log)
  return toEnvelope(entry!, false)
}

/** État du cache, pour l'endpoint de diagnostic. Ne contient aucune donnée. */
export function describeCache(): {
  populated: boolean
  ageSeconds: number | null
  syncedAt: string | null
  origin: string | null
  stale: boolean
  refreshInProgress: boolean
  ttlSeconds: number
} {
  const ttl = getDataCacheTtlSeconds()
  if (!entry) {
    return {
      populated: false,
      ageSeconds: null,
      syncedAt: null,
      origin: null,
      stale: false,
      refreshInProgress: inFlight !== null,
      ttlSeconds: ttl,
    }
  }
  const age = ageSeconds(entry.storedAt)
  return {
    populated: true,
    ageSeconds: age,
    syncedAt: entry.result.syncedAt,
    origin: entry.result.origin,
    stale: age > ttl,
    refreshInProgress: inFlight !== null,
    ttlSeconds: ttl,
  }
}

/** Vide le cache — utilisé par les tests et après un changement de configuration. */
export function invalidateCache(): void {
  entry = null
}
