import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { getData, refreshData } from '@/lib/data-cache'
import { AppError } from '@/lib/errors'
import { assertSameOrigin, errorResponse, ipKey, jsonNoStore } from '@/lib/http'
import { createRequestLogger, fingerprint } from '@/lib/logger'
import { consume, REFRESH_POLICY } from '@/lib/rate-limit'

/**
 * `GET`  — données du tableau de bord, servies depuis le cache serveur.
 * `POST` — rafraîchissement manuel, forçant une synchronisation Drive.
 *
 * Les deux exigent une session valide et répondent en `no-store` : ces données
 * financières ne doivent jamais être stockées par un cache partagé.
 */

// Ces données dépendent du cookie de session : la route doit être évaluée à
// chaque requête, jamais prérendue ni mise en cache par le framework.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request.headers, { route: 'api/data', method: 'GET' })

  try {
    const session = await getSession()
    if (!session) throw new AppError('auth', 'session absente ou invalide')

    const scopedLog = log.child({ user: fingerprint(session.email) })
    const envelope = await getData(scopedLog)

    scopedLog.info('api.data.served', {
      fromCache: envelope.fromCache,
      ageSeconds: envelope.ageSeconds,
      stale: envelope.stale,
      origin: envelope.origin,
    })

    return jsonNoStore(envelope)
  } catch (error) {
    return errorResponse(error, log)
  }
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request.headers, { route: 'api/data', method: 'POST' })

  try {
    // Requête mutative (déclenche des appels réseau sortants) : on vérifie
    // l'origine avant même de regarder la session.
    assertSameOrigin(request)

    const session = await getSession()
    if (!session) throw new AppError('auth', 'session absente ou invalide')

    const scopedLog = log.child({ user: fingerprint(session.email) })

    // Un rafraîchissement coûte un aller-retour Drive et consomme du quota :
    // on le limite par IP, en plus de la déduplication du cache.
    const limit = consume(ipKey(request, 'refresh'), REFRESH_POLICY)
    if (!limit.allowed) {
      scopedLog.warn('api.data.refresh_rate_limited')
      throw new AppError('rate_limited', 'trop de rafraîchissements', {
        userMessage: `Trop de rafraîchissements. Réessayez dans ${Math.ceil(
          limit.retryAfterSeconds / 60,
        )} minute(s).`,
      })
    }

    const envelope = await refreshData(scopedLog)

    scopedLog.info('api.data.refreshed', {
      ageSeconds: envelope.ageSeconds,
      origin: envelope.origin,
    })

    return jsonNoStore(envelope)
  } catch (error) {
    return errorResponse(error, log)
  }
}
