import type { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { describeCache } from '@/lib/data-cache'
import { verifyReadOnlyScope, DRIVE_READONLY_SCOPE } from '@/lib/drive'
import { describeConfig, getDataSource } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { errorResponse, jsonNoStore } from '@/lib/http'
import { createRequestLogger, fingerprint } from '@/lib/logger'

/**
 * Diagnostic de synchronisation — **protégé par la session**.
 *
 * Volontairement non public : la liste des variables manquantes et l'état des
 * scopes OAuth renseigneraient un attaquant sur la configuration du serveur.
 *
 * Ne renvoie jamais de valeur de configuration, d'identifiant de fichier Drive
 * ni de donnée financière : uniquement des booléens, des noms de variables et
 * des compteurs.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request.headers, { route: 'api/health' })

  try {
    const session = await getSession()
    if (!session) throw new AppError('auth', 'session absente ou invalide')

    const scopedLog = log.child({ user: fingerprint(session.email) })
    const config = describeConfig()
    const cache = describeCache()

    // La vérification de scope consomme un appel réseau : on ne la tente que
    // si la configuration Drive est complète et la source réellement Drive.
    const usesDrive = getDataSource() === 'drive'

    type ScopeStatus =
      | { status: 'not_applicable' }
      | { status: 'unchecked' }
      | { status: 'ok' | 'over_privileged' | 'missing'; readOnlyOnly: boolean }
      | { status: 'error'; kind: string }

    let scope: ScopeStatus = usesDrive ? { status: 'unchecked' } : { status: 'not_applicable' }

    if (usesDrive && config.drive.ok) {
      try {
        const result = await verifyReadOnlyScope(scopedLog)
        const readOnlyOnly = result.scopes.every(
          (s) => !s.startsWith('https://www.googleapis.com/auth/drive') || s.endsWith('.readonly'),
        )
        scope = {
          status: result.ok ? 'ok' : readOnlyOnly ? 'missing' : 'over_privileged',
          readOnlyOnly,
        }
      } catch (error) {
        scope = { status: 'error', kind: error instanceof AppError ? error.kind : 'unknown' }
      }
    }

    // En mode fixtures locales, le scope Drive ne participe pas au diagnostic.
    const scopeHealthy = scope.status === 'not_applicable' || scope.status === 'ok'
    const healthy = config.auth.ok && config.drive.ok && scopeHealthy

    scopedLog.info('api.health.checked', { healthy, dataSource: config.dataSource })

    return jsonNoStore(
      {
        healthy,
        dataSource: config.dataSource,
        configuration: {
          auth: { ok: config.auth.ok, missingVariables: config.auth.missing },
          drive: { ok: config.drive.ok, missingVariables: config.drive.missing },
        },
        driveScope: {
          expected: DRIVE_READONLY_SCOPE,
          ...scope,
        },
        cache,
        checkedAt: new Date().toISOString(),
      },
      { status: healthy ? 200 : 503 },
    )
  } catch (error) {
    return errorResponse(error, log)
  }
}
