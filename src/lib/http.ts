import 'server-only'
import { NextResponse } from 'next/server'
import { getAppOrigin } from './env'
import { AppError, toAppError, type PublicError } from './errors'
import { fingerprint, type Logger } from './logger'

/**
 * Helpers de réponse pour les routes API.
 *
 * Centralise trois invariants que chaque route doit respecter :
 *  1. aucune réponse authentifiée n'est mise en cache par un intermédiaire ;
 *  2. aucune erreur ne fuit de détail technique vers le client ;
 *  3. toute requête mutative est protégée contre le CSRF.
 */

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * En-têtes interdisant toute mise en cache partagée.
 *
 * `private` exclut les caches partagés, `no-store` interdit l'écriture sur
 * disque, `no-cache` force la revalidation. Les trois sont posés ensemble pour
 * couvrir les intermédiaires qui n'en respectent qu'une partie.
 *
 * `Vary: Cookie` est la ceinture de sécurité : si un cache ignorait malgré tout
 * `private`, il ne pourrait au moins pas servir la réponse d'un utilisateur à
 * un autre porteur de cookie.
 */
export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  Vary: 'Cookie',
}

/** Réponse JSON non cacheable. */
export function jsonNoStore<T>(
  body: T,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...NO_STORE_HEADERS, ...init.headers },
  })
}

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

/**
 * Convertit une erreur en réponse HTTP.
 *
 * Le détail technique part dans le log serveur avec l'identifiant de
 * corrélation ; le client ne reçoit que le message destiné à l'utilisateur et
 * ce même identifiant, qu'il peut citer au support.
 */
export function errorResponse(error: unknown, log: Logger): NextResponse {
  const appError = toAppError(error)

  const level = appError.status >= 500 || appError.kind === 'config' ? 'error' : 'warn'
  log[level]('api.error', {
    kind: appError.kind,
    status: appError.status,
    reason: appError.message,
    ...(appError.cause ? { cause: appError.cause } : {}),
  })

  const body: PublicError = appError.toPublicJSON(log.correlationId)

  return jsonNoStore(body, {
    status: appError.status,
    ...(appError.retryable ? { headers: { 'Retry-After': '30' } } : {}),
  })
}

// ---------------------------------------------------------------------------
// Identification de l'appelant
// ---------------------------------------------------------------------------

/**
 * Adresse IP de l'appelant, telle que rapportée par l'hébergeur.
 *
 * Les en-têtes sont essayés du plus spécifique au plus générique : un en-tête
 * propre à la plateforme est réécrit par son proxy, donc digne de confiance,
 * là où `x-forwarded-for` peut être fourni par le client lui-même.
 *
 * Ces valeurs ne servent **qu'à** la limitation d'abus, jamais à une décision
 * d'autorisation — c'est ce qui rend acceptable de s'appuyer dessus.
 */
const IP_HEADERS = [
  'x-vercel-forwarded-for', // Vercel — réécrit par le proxy
  'x-nf-client-connection-ip', // Netlify
  'cf-connecting-ip', // Cloudflare
  'x-real-ip',
] as const

export function clientIp(request: Request): string {
  const headers = request.headers

  for (const name of IP_HEADERS) {
    const value = headers.get(name)?.trim()
    if (value) return value
  }

  // Repli générique : on ne garde que la première adresse de la chaîne.
  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first || 'unknown'
}

/** Clé de limitation par IP — l'IP est réduite à une empreinte. */
export function ipKey(request: Request, scope: string): string {
  return `${scope}:ip:${fingerprint(clientIp(request))}`
}

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

/**
 * Vérifie qu'une requête mutative provient bien de l'application.
 *
 * Stratégie en deux temps :
 *  1. `Sec-Fetch-Site: same-origin` — envoyé par tous les navigateurs
 *     modernes et non falsifiable par du script de page ;
 *  2. repli sur `Origin`, comparé à l'origine attendue.
 *
 * L'origine attendue est `APP_ORIGIN` si elle est configurée, sinon l'origine
 * de la requête elle-même — ce qui reste sûr, car un formulaire hébergé sur un
 * autre domaine enverrait son propre `Origin`, différent de celui de l'hôte.
 *
 * `SameSite=Lax` sur le cookie constitue une troisième barrière, mais ne suffit
 * pas seul : il n'empêche pas les requêtes issues d'un sous-domaine.
 */
export function assertSameOrigin(request: Request): void {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'same-origin') return

  // `none` = navigation directe (barre d'adresse) : impossible en POST fetch.
  if (fetchSite && fetchSite !== 'none') {
    throw new AppError('forbidden', `requête rejetée : Sec-Fetch-Site=${fetchSite}`, {
      userMessage: "Requête refusée : origine non autorisée.",
    })
  }

  const origin = request.headers.get('origin')
  if (!origin) {
    // Sans `Origin` ni `Sec-Fetch-Site`, on ne peut rien affirmer : on refuse.
    if (!fetchSite) {
      throw new AppError('forbidden', 'requête mutative sans Origin ni Sec-Fetch-Site', {
        userMessage: "Requête refusée : origine non vérifiable.",
      })
    }
    return
  }

  const expected = getAppOrigin() ?? new URL(request.url).origin

  if (origin !== expected) {
    throw new AppError('forbidden', 'origine non concordante', {
      userMessage: "Requête refusée : origine non autorisée.",
    })
  }
}

// ---------------------------------------------------------------------------
// Redirections
// ---------------------------------------------------------------------------

/**
 * Assainit une cible de redirection fournie par l'utilisateur.
 *
 * N'accepte qu'un chemin absolu interne. Rejette les URL absolues
 * (`https://evil.tld`), les URL protocol-relative (`//evil.tld`, qu'un
 * `startsWith('/')` naïf laisserait passer) et les antislashs, que certains
 * navigateurs normalisent en `/`.
 */
export function safeRedirectPath(candidate: string | null, fallback = '/dashboard'): string {
  if (!candidate) return fallback
  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//')) return fallback
  if (candidate.includes('\\')) return fallback
  if (candidate.includes('://')) return fallback
  return candidate
}
