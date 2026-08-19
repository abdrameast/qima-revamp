import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { createHash, timingSafeEqual } from 'node:crypto'
import { getAuthEnv, isProduction, normalizeEmail } from './env'

/**
 * Session applicative — JWT signé HS256, transporté par cookie HttpOnly.
 *
 * Ce module est volontairement indépendant du contexte de requête Next : il ne
 * manipule que des chaînes. La lecture du cookie vit dans `lib/session`, ce qui
 * rend la cryptographie et la vérification d'identifiants testables sans
 * simuler de requête.
 *
 * Le modèle d'authentification (mot de passe partagé + liste blanche d'emails)
 * est celui de l'existant : il a été durci, pas remplacé. Ses limites
 * structurelles — pas d'imputabilité individuelle, pas de révocation par
 * utilisateur — sont documentées dans SECURITY.md §5.
 */

const ISSUER = 'qima-honeylang'
const AUDIENCE = 'qima-dashboard'

/**
 * Nom du cookie.
 *
 * Le préfixe `__Host-` impose au navigateur : `Secure`, `Path=/`, et aucun
 * attribut `Domain`. Un sous-domaine compromis ne peut donc pas écraser le
 * cookie de session. Le préfixe exige HTTPS, il n'est donc pas applicable en
 * développement local sur http://localhost.
 */
export const SESSION_COOKIE = isProduction ? '__Host-session' : 'session_token'

export interface Session {
  email: string
  /** Expiration, en secondes epoch. */
  exp: number
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getAuthEnv().sessionSecret)
}

// ---------------------------------------------------------------------------
// Émission et vérification
// ---------------------------------------------------------------------------

export async function createSessionToken(email: string): Promise<string> {
  const { sessionMaxAgeSeconds } = getAuthEnv()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ email: normalizeEmail(email) })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(now + sessionMaxAgeSeconds)
    .sign(secretKey())
}

/**
 * Vérifie un jeton.
 *
 * Renvoie `null` pour toute anomalie — signature, expiration, émetteur,
 * audience, ou email retiré de la liste blanche depuis l'émission. Ce dernier
 * point compte : retirer une adresse de `ALLOWED_EMAILS` doit couper l'accès
 * immédiatement, sans attendre l'expiration du jeton.
 */
export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      clockTolerance: 5,
    })

    const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : null
    if (!email) return null

    if (!getAuthEnv().allowedEmails.includes(email)) return null
    if (typeof payload.exp !== 'number') return null

    return { email, exp: payload.exp }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Vérification des identifiants
// ---------------------------------------------------------------------------

/**
 * Comparaison à temps constant.
 *
 * On compare les empreintes SHA-256 plutôt que les chaînes brutes : cela donne
 * des opérandes de longueur fixe, ce qui évite à la fois l'exception de
 * `timingSafeEqual` sur des longueurs différentes et la fuite de la longueur
 * du secret par le temps de réponse.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}

export interface CredentialCheck {
  ok: boolean
  /** Email normalisé — présent uniquement si `ok`. */
  email?: string
}

/**
 * Valide un couple (email, mot de passe).
 *
 * Les deux contrôles sont **toujours** exécutés, même si le premier échoue :
 * un court-circuit rendrait le temps de réponse différent selon que l'email
 * est connu ou non, ce qui permettrait d'énumérer les comptes autorisés.
 */
export function verifyCredentials(
  emailInput: unknown,
  passwordInput: unknown,
): CredentialCheck {
  const { allowedEmails, dashboardPassword } = getAuthEnv()

  const email = typeof emailInput === 'string' ? normalizeEmail(emailInput) : ''
  const password = typeof passwordInput === 'string' ? passwordInput : ''

  const emailAllowed = allowedEmails.includes(email)

  // Toujours comparer, y compris pour un email inconnu : le coût de calcul ne
  // doit pas dépendre du fait que l'email existe.
  const passwordMatches = constantTimeEquals(password, dashboardPassword)

  return emailAllowed && passwordMatches ? { ok: true, email } : { ok: false }
}

// ---------------------------------------------------------------------------
// Cookie
// ---------------------------------------------------------------------------

export interface CookieSpec {
  name: string
  value: string
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/'
  maxAge: number
}

export function sessionCookie(token: string): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: getAuthEnv().sessionMaxAgeSeconds,
  }
}

export function clearedSessionCookie(): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }
}
