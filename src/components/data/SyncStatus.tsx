'use client'

import { useEffect, useState } from 'react'
import { useData } from './DataProvider'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { WorkbookProvenance } from '@/lib/data-types'

/**
 * Provenance et fraîcheur des données.
 *
 * Sur un tableau de bord de direction, « d'où sort ce chiffre et de quand
 * date-t-il » est une question de premier ordre, pas une note de bas de page.
 * Ce bandeau y répond en permanence, et porte l'action de resynchronisation.
 */

const WORKBOOK_LABELS: Record<'pilotage' | 'crc' | 'kpi', string> = {
  pilotage: 'Pilotage financier',
  crc: 'Fiches CRC',
  kpi: 'KPI DTC',
}

export function SyncStatus({ className }: { className?: string }) {
  const { data, loading, error, syncedAt, ageSeconds, stale, origin, refreshState, refreshError, refresh } =
    useData()

  const [expanded, setExpanded] = useState(false)

  // L'ancienneté est recalculée localement chaque minute : sans cela, un
  // onglet resté ouvert afficherait indéfiniment « il y a 2 minutes ».
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-[11px] text-cream-faint', className)}>
        <span className="size-1.5 animate-pulse rounded-full bg-cream-faint" aria-hidden="true" />
        Synchronisation des classeurs sources…
      </div>
    )
  }

  // Échec initial : `ErrorState` prend le relais au niveau de la page. On ne
  // duplique pas le message ici.
  if (error || !data) return null

  const liveAgeSeconds =
    syncedAt !== null ? Math.max(0, Math.round((now - new Date(syncedAt).getTime()) / 1000)) : ageSeconds

  const refreshing = refreshState === 'refreshing'
  const sources = data.meta.sources

  return (
    <div
      className={cn(
        'glass-dark animate-fade rounded-md px-4 py-3',
        stale && 'border-caution/45',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              refreshing ? 'animate-pulse bg-gold' : stale ? 'bg-caution' : 'bg-positive',
            )}
          />

          <p className="text-[11px] text-cream-muted">
            <span className="font-medium text-cream">Données synchronisées</span>{' '}
            <time dateTime={syncedAt ?? undefined} title={formatDateTime(syncedAt)}>
              {formatRelative(liveAgeSeconds)}
            </time>
          </p>

          {stale && (
            <Badge tone="caution" surface="dark" srPrefix="État : ">
              Données périmées
            </Badge>
          )}

          {origin === 'local-fixtures' && (
            <Badge tone="critical" surface="dark" srPrefix="Attention : ">
              Fixtures synthétiques — pas des chiffres réels
            </Badge>
          )}

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls="sync-sources"
            className={cn(
              'rounded-xs text-[11px] font-medium text-cream-faint underline underline-offset-2',
              'transition-colors hover:text-gold',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
            )}
          >
            {expanded ? 'Masquer les sources' : `${Object.keys(sources).length} classeurs sources`}
          </button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={refresh}
          loading={refreshing}
          loadingLabel="Resynchronisation en cours"
          className="no-print"
        >
          {refreshing ? 'Synchronisation…' : 'Actualiser'}
        </Button>
      </div>

      {/* Échec d'un rafraîchissement : les données précédentes restent
          affichées, on signale seulement que la mise à jour n'a pas abouti. */}
      {refreshState === 'error' && refreshError && (
        <p role="status" className="mt-2 text-[11px] leading-snug text-caution">
          <span className="font-medium">Actualisation impossible.</span> {refreshError.message}{' '}
          Les données affichées restent celles de la dernière synchronisation réussie.
          {refreshError.correlationId && (
            <span className="ml-1 text-cream-faint">Réf. {refreshError.correlationId}</span>
          )}
        </p>
      )}

      {expanded && (
        <ul id="sync-sources" className="mt-3 space-y-1.5 border-t border-line pt-3">
          {(Object.keys(WORKBOOK_LABELS) as (keyof typeof WORKBOOK_LABELS)[]).map((key) => (
            <SourceRow key={key} label={WORKBOOK_LABELS[key]} provenance={sources[key]} />
          ))}
        </ul>
      )}
    </div>
  )
}

function SourceRow({ label, provenance }: { label: string; provenance: WorkbookProvenance }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px]">
      <span className="font-medium text-cream-muted">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-2 text-cream-faint">
        <span className="truncate">{provenance.fileName}</span>
        <span aria-hidden="true">·</span>
        <span>modifié le {formatDateTime(provenance.modifiedTime)}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular">{formatBytes(provenance.sizeBytes)}</span>
        {provenance.exported && (
          <Badge tone="info" surface="dark">
            exporté depuis Google Sheets
          </Badge>
        )}
      </span>
    </li>
  )
}
