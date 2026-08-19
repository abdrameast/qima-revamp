import type { NextRequest } from 'next/server'
import { createSessionToken, sessionCookie, verifyCredentials } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { assertSameOrigin, errorResponse, ipKey, jsonNoStore } from '@/lib/http'
import { createRequestLogger, fingerprint } from '@/lib/logger'
import { consume, LOGIN_POLICY, reset } from '@/lib/rate-limit'
import { normalizeEmail } from '@/lib/env'

export const dynamic = 'force-dynamic'

/** Message unique pour tout échec — ne révèle jamais quelle moitié est fausse. */
const GENERIC_FAILURE = 'Email ou mot de passe incorrect.'

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request.headers, { route: 'api/auth/login' })

  try {
    assertSameOrigin(request)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      throw new AppError('auth', 'corps de requête illisible', {
        userMessage: GENERIC_FAILURE,
      })
    }

    const { email, password } =
      typeof payload === 'object' && payload !== null
        ? (payload as { email?: unknown; password?: unknown })
        : { email: undefined, password: undefined }

    const emailNormalized = typeof email === 'string' ? normalizeEmail(email) : ''

    // Deux dimensions de limitation : changer d'IP ne remet pas à zéro le
    // compteur de l'email visé, et inversement.
    const byIp = consume(ipKey(request, 'login'), LOGIN_POLICY)
    const byEmail = emailNormalized
      ? consume(`login:email:${fingerprint(emailNormalized)}`, LOGIN_POLICY)
      : { allowed: true, remaining: 0, retryAfterSeconds: 0 }

    if (!byIp.allowed || !byEmail.allowed) {
      const retryAfter = Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds)
      log.warn('auth.login.rate_limited', {
        dimension: !byIp.allowed ? 'ip' : 'email',
        retryAfterSeconds: retryAfter,
      })
      return jsonNoStore(
        {
          kind: 'rate_limited',
          error: `Trop de tentatives. Réessayez dans ${Math.ceil(retryAfter / 60)} minute(s).`,
          retryable: true,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }

    const check = verifyCredentials(email, password)

    if (!check.ok) {
      log.warn('auth.login.failed', {
        ...(emailNormalized ? { attemptedUser: fingerprint(emailNormalized) } : {}),
      })
      return jsonNoStore({ kind: 'auth', error: GENERIC_FAILURE, retryable: false }, { status: 401 })
    }

    // Succès : on libère les compteurs pour ne pas pénaliser un utilisateur
    // légitime ayant fait quelques fautes de frappe.
    reset(ipKey(request, 'login'))
    reset(`login:email:${fingerprint(check.email!)}`)

    const token = await createSessionToken(check.email!)
    const cookie = sessionCookie(token)

    log.info('auth.login.success', { user: fingerprint(check.email!) })

    const response = jsonNoStore({ success: true })
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      path: cookie.path,
      maxAge: cookie.maxAge,
    })
    return response
  } catch (error) {
    return errorResponse(error, log)
  }
}
