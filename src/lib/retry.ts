/**
 * Réessais bornés avec repli exponentiel et gigue.
 *
 * Extrait du client Drive pour être testable sans dépendance réseau : la
 * politique de réessai est une décision métier (que réessaie-t-on, combien de
 * fois, à quel rythme) et mérite ses propres tests.
 */

export interface RetryPolicy {
  /** Nombre total de tentatives, première comprise. */
  maxAttempts: number
  /** Délai de base, en millisecondes. */
  baseDelayMs: number
  /** Plafond du délai, en millisecondes. */
  maxDelayMs: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 5_000,
}

/**
 * Délai avant la tentative suivante.
 *
 * « Full jitter » : le délai est tiré uniformément dans `[0, plafond]` plutôt
 * que fixé au plafond. Sans gigue, plusieurs requêtes ayant échoué au même
 * instant réessaieraient toutes ensemble et reproduiraient la surcharge qui a
 * causé l'échec.
 *
 * @param attempt Numéro de la tentative qui vient d'échouer, à partir de 1.
 * @param random Source d'aléa injectable, pour rendre les tests déterministes.
 */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs)
  return Math.round(random() * ceiling)
}

export interface RetryHooks {
  /** Décide si l'échec justifie une nouvelle tentative. */
  isRetryable: (error: unknown) => boolean
  /** Notifié avant chaque attente. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void
  /** Attente injectable, pour des tests instantanés. */
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  policy?: RetryPolicy
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Exécute `operation`, en réessayant uniquement les échecs jugés récupérables.
 *
 * Une erreur non récupérable (403, 404, jeton révoqué) est relancée
 * immédiatement : réessayer ne ferait que retarder un diagnostic certain.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  hooks: RetryHooks,
): Promise<T> {
  const policy = hooks.policy ?? DEFAULT_RETRY_POLICY
  const sleep = hooks.sleep ?? defaultSleep

  let lastError: unknown

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error

      const canRetry = hooks.isRetryable(error) && attempt < policy.maxAttempts
      if (!canRetry) throw error

      const delayMs = backoffDelay(attempt, policy, hooks.random)
      hooks.onRetry?.({ attempt, delayMs, error })
      await sleep(delayMs)
    }
  }

  throw lastError
}
