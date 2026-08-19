'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Cadre commun des graphiques.
 *
 * Trois rôles :
 *  1. réserver une hauteur fixe, pour qu'aucun décalage de mise en page ne se
 *     produise entre le squelette de chargement et le graphique rendu ;
 *  2. porter une **légende lisible** et une **description textuelle**, seul
 *     canal disponible pour qui n'exploite pas le rendu visuel ;
 *  3. exposer les mêmes données sous forme de tableau au lecteur d'écran.
 *
 * Un `<svg>` Recharts n'est pas interprétable à l'oral : `summary` n'est donc
 * pas un ornement, c'est le contenu équivalent.
 */

export interface LegendEntry {
  label: string
  color: string
  /** Trait discontinu — utilisé pour distinguer prévisionnel et réalisé. */
  dashed?: boolean
}

export function ChartFrame({
  children,
  legend,
  summary,
  height = 260,
  className,
  footnote,
}: {
  children: ReactNode
  legend?: readonly LegendEntry[]
  /**
   * Description textuelle du contenu du graphique, annoncée aux lecteurs
   * d'écran. Doit citer les grandeurs, pas décrire la forme de la courbe.
   */
  summary: string
  height?: number
  className?: string
  footnote?: ReactNode
}) {
  return (
    <figure className={cn('m-0', className)}>
      {legend && legend.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-hidden="true">
          {legend.map((entry) => (
            <li key={entry.label} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span
                className={cn('inline-block h-0 w-5 shrink-0 rounded-full border-t-2')}
                style={{
                  borderColor: entry.color,
                  borderTopStyle: entry.dashed ? 'dashed' : 'solid',
                }}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}

      {/* Le graphique lui-même est retiré de l'arbre d'accessibilité : sa
          version textuelle le remplace intégralement. */}
      <div style={{ height }} role="img" aria-label={summary}>
        <div aria-hidden="true" className="h-full">
          {children}
        </div>
      </div>

      {footnote && (
        <figcaption className="mt-2.5 text-[11px] leading-snug text-ink-faint">
          {footnote}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * Infobulle de graphique.
 *
 * Recharts fournit un rendu par défaut non stylable de façon cohérente ; ce
 * composant garantit que les montants y sont formatés comme partout ailleurs
 * dans l'application.
 */
export function ChartTooltip({
  label,
  rows,
}: {
  label?: string
  rows: { name: string; value: string; color?: string }[]
}) {
  if (rows.length === 0) return null

  return (
    <div className="glass rounded-md px-3 py-2 shadow-[--shadow-raised]">
      {label && <p className="section-label mb-1 text-ink-faint">{label}</p>}
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.name} className="flex items-baseline justify-between gap-4 text-[11px]">
            <span className="flex items-center gap-1.5 text-ink-muted">
              {row.color && (
                <span
                  aria-hidden="true"
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              )}
              {row.name}
            </span>
            <span className="tabular font-semibold text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
