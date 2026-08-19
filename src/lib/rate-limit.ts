import 'server-only'

/**
 * Limitation d'abus en mémoire — fenêtre glissante.
 *
 * ⚠️ Portée : l'état vit dans le processus. Sur un hébergeur multi-instances
 * (Netlify), la limite s'applique **par instance**, pas globalement. Elle
 * décourage le bourrage d'identifiants naïf ; elle ne remplace pas un WAF ni
 * une limitation au niveau de la plateforme. Voir SECURITY.md §5 pour les
 * options d'infrastructure et pourquoi elles n'ont pas été retenues ici.
 */

interface Bucket {
  /** Horodatages des tentatives, en millisecondes epoch. */
  hits: number[]
  /** Fin du blocage, en millisecondes epoch. */
  blockedUntil: number
}

const buckets = new Map<string, Bucket>()

/** Plafond de sécurité : évite une croissance mémoire non bornée. */
const MAX_TRACKED_KEYS = 10_000

export interface RateLimitPolicy {
  /** Nombre de tentatives autorisées dans la fenêtre. */
  limit: number
  /** Largeur de la fenêtre glissante, en millisecondes. */
  windowMs: number
  /** Durée du blocage une fois la limite atteinte, en millisecondes. */
  blockMs: number
}

export const LOGIN_POLICY: RateLimitPolicy = {
  limit: 8,
  windowMs: 10 * 60_000,
  blockMs: 15 * 60_000,
}

export const REFRESH_POLICY: RateLimitPolicy = {
  limit: 6,
  windowMs: 5 * 60_000,
  blockMs: 5 * 60_000,
}

export interface RateLimitResult {
  allowed: boolean
  /** Tentatives restantes avant blocage. */
  remaining: number
  /** Secondes à attendre avant nouvelle tentative — seulement si bloqué. */
  retryAfterSeconds: number
}

/** Purge paresseuse : ne s'exécute qu'en cas de pression mémoire. */
function evictIfNeeded(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return

  for (const [key, bucket] of buckets) {
    const idle = bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 3_600_000
    if (idle && bucket.blockedUntil < now) buckets.delete(key)
  }

  // Si la purge ne suffit pas, on repart de zéro plutôt que de croître.
  if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear()
}

/**
 * Enregistre une tentative et indique si elle est autorisée.
 *
 * @param key Identifiant de compartiment. Utiliser un préfixe pour séparer les
 *   dimensions (`ip:1.2.3.4`, `email:<empreinte>`) afin qu'un attaquant
 *   changeant d'IP reste limité sur l'email, et réciproquement.
 */
export function consume(key: string, policy: RateLimitPolicy): RateLimitResult {
  const now = Date.now()
  evictIfNeeded(now)

  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { hits: [], blockedUntil: 0 }
    buckets.set(key, bucket)
  }

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    }
  }

  const windowStart = now - policy.windowMs
  bucket.hits = bucket.hits.filter((t) => t > windowStart)
  bucket.hits.push(now)

  if (bucket.hits.length > policy.limit) {
    bucket.blockedUntil = now + policy.blockMs
    bucket.hits = []
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(policy.blockMs / 1000),
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, policy.limit - bucket.hits.length),
    retryAfterSeconds: 0,
  }
}

/** Efface le compteur après une authentification réussie. */
export function reset(key: string): void {
  buckets.delete(key)
}

/** Réinitialise tout l'état — réservé aux tests. */
export function __resetAllForTests(): void {
  buckets.clear()
}
