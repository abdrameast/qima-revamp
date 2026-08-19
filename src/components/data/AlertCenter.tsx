'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import type { AlertSeverity, DecisionAlert } from '@/lib/alerts'

/**
 * Centre d'alertes.
 *
 * Chaque signal est dépliable pour montrer **la règle qui l'a déclenché** et
 * la source de la donnée. C'est ce qui distingue un tableau de bord d'un
 * oracle : le lecteur doit pouvoir vérifier, et contester, ce qu'on lui dit.
 */

const SEVERITY: Record<AlertSeverity, { tone: 'critical' | 'caution' | 'info'; label: string; bar: string }> = {
  critical: { tone: 'critical', label: 'Critique', bar: 'bg-critical' },
  caution: { tone: 'caution', label: 'Vigilance', bar: 'bg-caution' },
  info: { tone: 'info', label: 'Information', bar: 'bg-mauve' },
}

export function AlertCenter({
  alerts,
  limit,
  className,
}: {
  alerts: readonly DecisionAlert[]
  /** Nombre maximal affiché. Le reste est annoncé explicitement. */
  limit?: number
  className?: string
}) {
  const visible = limit ? alerts.slice(0, limit) : alerts
  const hidden = alerts.length - visible.length

  return (
    <Card
      tone="glass"
      label="Aide à la décision"
      title="Points d'attention"
      caption="Signaux calculés à partir des seuils paramétrés. Ce ne sont ni un avis comptable ni une recommandation financière : chaque règle est consultable."
      className={className}
      action={
        alerts.length > 0 ? (
          <Badge tone={alerts[0].severity === 'critical' ? 'critical' : 'caution'}>
            {alerts.length} {alerts.length > 1 ? 'signaux' : 'signal'}
          </Badge>
        ) : undefined
      }
    >
      {alerts.length === 0 ? (
        <EmptyState
          variant="none"
          title="Aucun seuil franchi"
          description="Aucune des règles paramétrées n'est déclenchée par les données de la dernière synchronisation."
        />
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>

          {hidden > 0 && (
            <p className="mt-3 text-[11px] text-ink-faint">
              {hidden > 1
                ? `${hidden} autres signaux non affichés ici.`
                : '1 autre signal non affiché ici.'}
            </p>
          )}
        </>
      )}
    </Card>
  )
}

function AlertRow({ alert }: { alert: DecisionAlert }) {
  const [open, setOpen] = useState(false)
  const severity = SEVERITY[alert.severity]

  return (
    <li className="lift relative overflow-hidden rounded-md border border-rule bg-white/[0.05]">
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px]', severity.bar)} />

      <div className="py-3 pl-4 pr-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={severity.tone} srPrefix="Gravité : ">
                {severity.label}
              </Badge>
              <h3 className="text-xs font-semibold text-ink">{alert.title}</h3>
            </div>

            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{alert.explanation}</p>
          </div>

          <div className="shrink-0 text-right">
            <p className="section-label text-ink-faint">{alert.metric.label}</p>
            <p className="tabular mt-0.5 text-sm font-semibold text-ink">{alert.metric.value}</p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className={cn(
              'rounded-xs text-[11px] font-medium text-ink-muted underline underline-offset-2',
              'transition-colors hover:text-ink',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
            )}
          >
            {open ? 'Masquer la règle' : 'Voir la règle appliquée'}
          </button>

          <Link
            href={alert.href}
            className={cn(
              'rounded-xs text-[11px] font-medium text-gold underline underline-offset-2',
              'transition-colors hover:text-ink',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
            )}
          >
            Examiner le détail →
          </Link>
        </div>

        {open && (
          <dl className="mt-2.5 space-y-1.5 border-t border-rule pt-2.5 text-[11px]">
            <div>
              <dt className="section-label text-ink-faint">Règle appliquée</dt>
              <dd className="mt-0.5 text-ink-muted">{alert.rule}</dd>
            </div>
            <div>
              <dt className="section-label text-ink-faint">Source de la donnée</dt>
              <dd className="mt-0.5 text-ink-muted">{alert.source}</dd>
            </div>
            <div>
              <dt className="section-label text-ink-faint">Piste à instruire</dt>
              <dd className="mt-0.5 text-ink-muted">{alert.lead}</dd>
            </div>
          </dl>
        )}
      </div>
    </li>
  )
}
