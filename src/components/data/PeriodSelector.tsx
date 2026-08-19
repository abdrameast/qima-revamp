'use client'

import { useAnalysis } from './AnalysisProvider'
import { periodOptions, type ComparisonBasis, type PeriodMode } from '@/lib/period'
import { cn } from '@/lib/cn'

/**
 * Sélecteur de période et de base de comparaison.
 *
 * Rendu comme deux `<select>` natifs : sur mobile ils ouvrent le sélecteur
 * système, qui est plus rapide et plus accessible qu'un menu recréé en HTML.
 * La sélection est globale et persiste d'une page à l'autre.
 */

const MODE_LABELS: Record<PeriodMode, string> = {
  year: 'Exercice complet',
  ytd: 'Cumul à date',
  quarter: 'Trimestre',
  month: 'Mois',
}

const COMPARISON_LABELS: Record<ComparisonBasis, string> = {
  previous: 'Période précédente',
  budget: 'Budget',
  none: 'Aucune',
}

const CONTROL_CLASS = cn(
  'h-8 cursor-pointer appearance-none rounded-md border border-line-strong bg-surface',
  'py-0 pl-2.5 pr-7 text-xs font-medium text-cream',
  'transition-colors hover:border-gold',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold',
  'bg-[length:12px] bg-[right_0.5rem_center] bg-no-repeat',
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23C6AEB8' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")]",
)

export function PeriodSelector({ className }: { className?: string }) {
  const { selection, setSelection, comparison, setComparison, monthLabels, comparisonAvailable } =
    useAnalysis()

  const options = periodOptions(monthLabels)
  const disabled = monthLabels.length === 0

  return (
    <div className={cn('no-print flex flex-wrap items-center gap-2', className)}>
      {/* Mode de période */}
      <label className="sr-only" htmlFor="period-mode">
        Type de période analysée
      </label>
      <select
        id="period-mode"
        value={selection.mode}
        disabled={disabled}
        onChange={(event) =>
          setSelection({ mode: event.target.value as PeriodMode, index: 0 })
        }
        className={cn(CONTROL_CLASS, 'disabled:cursor-not-allowed disabled:opacity-50')}
      >
        {(Object.keys(MODE_LABELS) as PeriodMode[]).map((mode) => (
          <option key={mode} value={mode} className="bg-surface text-cream">
            {MODE_LABELS[mode]}
          </option>
        ))}
      </select>

      {/* Index — trimestre ou mois, selon le mode */}
      {selection.mode === 'quarter' && (
        <>
          <label className="sr-only" htmlFor="period-quarter">
            Trimestre
          </label>
          <select
            id="period-quarter"
            value={selection.index}
            onChange={(event) =>
              setSelection({ mode: 'quarter', index: Number(event.target.value) })
            }
            className={CONTROL_CLASS}
          >
            {options.quarters
              .filter((quarter) => quarter.available)
              .map((quarter) => (
                <option key={quarter.index} value={quarter.index} className="bg-surface text-cream">
                  {quarter.label}
                </option>
              ))}
          </select>
        </>
      )}

      {selection.mode === 'month' && (
        <>
          <label className="sr-only" htmlFor="period-month">
            Mois
          </label>
          <select
            id="period-month"
            value={selection.index}
            onChange={(event) =>
              setSelection({ mode: 'month', index: Number(event.target.value) })
            }
            className={CONTROL_CLASS}
          >
            {options.months.map((month) => (
              <option key={month.index} value={month.index} className="bg-surface text-cream">
                {month.label}
              </option>
            ))}
          </select>
        </>
      )}

      <span aria-hidden="true" className="hidden text-cream-faint sm:inline">
        ·
      </span>

      {/* Base de comparaison */}
      <label className="sr-only" htmlFor="period-comparison">
        Base de comparaison
      </label>
      <select
        id="period-comparison"
        value={comparison}
        disabled={disabled}
        onChange={(event) => setComparison(event.target.value as ComparisonBasis)}
        className={cn(CONTROL_CLASS, 'disabled:cursor-not-allowed disabled:opacity-50')}
      >
        {(Object.keys(COMPARISON_LABELS) as ComparisonBasis[]).map((basis) => (
          <option key={basis} value={basis} className="bg-surface text-cream">
            Comparer à : {COMPARISON_LABELS[basis]}
          </option>
        ))}
      </select>

      {/* Signale une comparaison demandée mais non calculable, au lieu de
          l'omettre silencieusement des indicateurs. */}
      {comparison !== 'none' && !comparisonAvailable && (
        <span className="text-[11px] text-caution" role="status">
          Comparaison indisponible sur cette période
        </span>
      )}
    </div>
  )
}
