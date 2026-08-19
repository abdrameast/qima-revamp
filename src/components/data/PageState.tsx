'use client'

import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { LoadingRegion, SkeletonCard, SkeletonMetric } from '@/components/ui/Skeleton'
import type { DataError } from './DataProvider'
import type { AppErrorKind } from '@/lib/errors'

/**
 * États de page partagés : chargement et échec.
 *
 * Centralisés pour que les sept vues réagissent de façon identique — un
 * utilisateur ne devrait pas avoir à réapprendre ce que signifie une erreur
 * en changeant d'onglet.
 */

/** Conseil actionnable propre à chaque nature d'échec. */
const GUIDANCE: Partial<Record<AppErrorKind | 'network', string>> = {
  config:
    "La configuration serveur est incomplète. Cette anomalie relève de l'administrateur : les variables d'environnement de l'hébergeur doivent être renseignées.",
  drive_auth:
    "L'autorisation Google Drive doit être renouvelée. Cette opération relève du propriétaire du compte Google.",
  drive_permission:
    "L'un des classeurs n'est plus partagé avec le compte de synchronisation. Vérifier les partages dans Google Drive.",
  drive_not_found:
    "L'un des classeurs est introuvable : il a pu être renommé, déplacé ou mis à la corbeille.",
  drive_quota: 'Le quota Google Drive est momentanément atteint. Réessayer dans quelques minutes.',
  drive_unavailable: 'Google Drive est temporairement injoignable.',
  workbook_invalid:
    "La structure d'un classeur a changé. Les calculs sont suspendus volontairement : afficher des chiffres issus d'un fichier mal interprété serait plus dangereux qu'afficher une erreur.",
  auth: 'Votre session a expiré.',
  network: 'La connexion au serveur a échoué.',
}

export function DataErrorState({
  error,
  onRetry,
}: {
  error: DataError
  onRetry: () => void
}) {
  const guidance = GUIDANCE[error.kind]
  const expired = error.kind === 'auth'

  return (
    <Card tone="glass" className="mx-auto max-w-2xl">
      <Alert tone="critical" title="Les données ne peuvent pas être affichées">
        <p>{error.message}</p>
        {error.detail && <p className="mt-1.5">{error.detail}</p>}
        {guidance && <p className="mt-1.5">{guidance}</p>}
      </Alert>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {expired ? (
          <Button variant="primary" size="sm" onClick={() => window.location.assign('/login')}>
            Se reconnecter
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={onRetry} disabled={!error.retryable}>
            Réessayer
          </Button>
        )}

        {!error.retryable && !expired && (
          <span className="text-[11px] text-ink-faint">
            Une nouvelle tentative ne résoudra pas ce problème sans intervention.
          </span>
        )}
      </div>

      {error.correlationId && (
        <p className="mt-4 border-t border-rule pt-3 text-[10px] text-ink-faint">
          Référence à communiquer au support :{' '}
          <code className="tabular font-medium text-ink-muted">{error.correlationId}</code>
        </p>
      )}
    </Card>
  )
}

/** Squelette de page — grille d'indicateurs puis blocs de contenu. */
export function PageLoading({
  metrics = 4,
  cards = 2,
}: {
  metrics?: number
  cards?: number
}) {
  return (
    <LoadingRegion label="Chargement des données financières">
      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: metrics }, (_, index) => (
          <SkeletonMetric key={index} />
        ))}
      </div>
      <div className="stagger mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: cards }, (_, index) => (
          <SkeletonCard key={index} className="h-56" />
        ))}
      </div>
    </LoadingRegion>
  )
}
