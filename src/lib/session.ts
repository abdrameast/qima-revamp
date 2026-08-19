import 'server-only'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken, type Session } from './auth'
import { AUTH_BYPASS_EMAIL, isAuthBypassEnabled } from './env'

/**
 * Accès à la session depuis le contexte de requête Next.
 *
 * Isolé de `lib/auth` pour que la logique cryptographique reste testable hors
 * de Next : ce module est le seul à dépendre de `next/headers`.
 */

/**
 * Session courante côté serveur — layouts, composants serveur, routes API.
 *
 * ⚠️ C'est ce contrôle qui fait autorité. Le proxy ne vérifie que la présence
 * d'un cookie ; ici la signature, l'expiration, l'émetteur et l'appartenance à
 * la liste blanche sont réellement vérifiés.
 */
export async function getSession(): Promise<Session | null> {
  // Contournement de développement — voir `isAuthBypassEnabled()` pour les
  // trois verrous qui le rendent impossible en production.
  if (isAuthBypassEnabled()) {
    return {
      email: AUTH_BYPASS_EMAIL,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }
  }

  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export type { Session }
