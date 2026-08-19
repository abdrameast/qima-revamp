import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy (anciennement Middleware — renommé dans Next.js 16).
 *
 * Deux rôles :
 *  1. poser les en-têtes de sécurité sur **toutes** les réponses ;
 *  2. effectuer un contrôle d'accès **optimiste** sur les pages du tableau de bord.
 *
 * ⚠️ Le contrôle réalisé ici est délibérément superficiel : présence d'un
 * cookie, rien de plus. Conformément à la documentation Next.js, le proxy
 * s'exécute sur chaque requête, y compris les préchargements, et ne doit pas
 * porter la décision d'autorisation. La vérification cryptographique du jeton
 * a lieu côté serveur — dans `src/app/dashboard/layout.tsx` et dans chaque
 * route API — et c'est elle qui fait autorité.
 *
 * Le proxy ne peut d'ailleurs pas vérifier la signature ici : `getAuthEnv()`
 * importe `server-only` et n'est pas disponible dans le runtime du proxy.
 */

const SESSION_COOKIES = ['__Host-session', 'session_token']

/** Directives CSP. Aucune source externe n'est nécessaire : tout est auto-hébergé. */
function contentSecurityPolicy(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // Next.js injecte des scripts inline pour l'hydratation et le streaming RSC.
    // `unsafe-eval` n'est requis que par le rafraîchissement rapide en dev.
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    // Tailwind et les styles inline des graphiques Recharts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // Les polices sont auto-hébergées par next/font — aucune origine tierce.
    "font-src 'self'",
    isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ]
  return directives.join('; ')
}

function applySecurityHeaders(response: NextResponse, isDev: boolean): NextResponse {
  const headers = response.headers

  headers.set('Content-Security-Policy', contentSecurityPolicy(isDev))
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()',
  )

  // HSTS uniquement en production : l'imposer en développement casserait
  // http://localhost pour le navigateur pendant deux ans.
  if (!isDev) {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }

  return response
}

export function proxy(request: NextRequest): NextResponse {
  const isDev = process.env.NODE_ENV !== 'production'
  const { pathname, search } = request.nextUrl

  // Contournement de développement. Les mêmes verrous que `isAuthBypassEnabled()`
  // sont réappliqués ici : le proxy s'exécute dans un runtime distinct et ne peut
  // pas importer les modules marqués `server-only`.
  const authBypassed = isDev && process.env.AUTH_DISABLED === 'true'

  const hasSessionCookie =
    authBypassed || SESSION_COOKIES.some((name) => request.cookies.has(name))

  // Pages du tableau de bord : sans cookie, inutile de rendre la page.
  if (pathname.startsWith('/dashboard') && !hasSessionCookie) {
    const loginUrl = new URL('/login', request.url)
    // Mémorise la destination pour y revenir après authentification.
    // `safeRedirectPath` la revalidera côté serveur avant toute utilisation.
    if (pathname !== '/dashboard') {
      loginUrl.searchParams.set('next', pathname + search)
    }
    return applySecurityHeaders(NextResponse.redirect(loginUrl), isDev)
  }

  // Déjà connecté sur la page de login : aller directement au tableau de bord.
  if (pathname === '/login' && hasSessionCookie) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL('/dashboard/overview', request.url)),
      isDev,
    )
  }

  return applySecurityHeaders(NextResponse.next(), isDev)
}

export const config = {
  // Exclut les assets statiques : ils n'ont pas besoin des en-têtes applicatifs
  // et le coût du proxy sur chaque fichier serait inutile.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
}
