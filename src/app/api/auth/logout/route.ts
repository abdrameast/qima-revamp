import { NextResponse, type NextRequest } from 'next/server'
import { clearedSessionCookie } from '@/lib/auth'
import { assertSameOrigin, errorResponse, NO_STORE_HEADERS } from '@/lib/http'
import { createRequestLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Déconnexion.
 *
 * Redirige plutôt que de renvoyer du JSON, afin que le bouton fonctionne comme
 * un `<form method="post">` sans JavaScript.
 *
 * La session étant un JWT sans état, effacer le cookie est le seul levier
 * disponible côté serveur : un jeton déjà exfiltré resterait valide jusqu'à son
 * expiration. C'est la raison pour laquelle la durée de vie a été ramenée de
 * 30 jours à 12 heures.
 */
export async function POST(request: NextRequest) {
  const log = createRequestLogger(request.headers, { route: 'api/auth/logout' })

  try {
    assertSameOrigin(request)

    const cookie = clearedSessionCookie()
    const response = NextResponse.redirect(new URL('/login', request.url), {
      status: 303,
      headers: NO_STORE_HEADERS,
    })

    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      path: cookie.path,
      maxAge: 0,
    })

    log.info('auth.logout')
    return response
  } catch (error) {
    return errorResponse(error, log)
  }
}
