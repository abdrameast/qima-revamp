import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { Tooltip } from './Tooltip'

/**
 * Carte d'indicateur — la brique de lecture principale du tableau de bord.
 *
 * Hiérarchie visuelle assumée, du plus fort au plus faible :
 *   valeur → libellé → variation → repère/contexte → provenance.
 *
 * Deux règles héritées de l'existant et préservées :
 *  - une valeur absente s'affiche « — », jamais 0 ;
 *  - un indicateur indisponible dit **pourquoi**, il ne disparaît pas.
 */

export type MetricTone = 'neutral' | 'gold' | 'positive' | 'caution' | 'critical'

/**
 * Sens de la variation — pilote **le glyphe** uniquement.
 * Une valeur qui baisse affiche ▼, qu'elle soit favorable ou non.
 */
export type TrendDirection = 'up' | 'down' | 'flat'

/**
 * Appréciation de la variation — pilote **la couleur** et l'annonce vocale.
 *
 * Séparée de la direction à dessein : sur les charges, une baisse est
 * favorable, alors que sur le chiffre d'affaires elle ne l'est pas. Confondre
 * les deux produisait « ▲ en hausse : −4,9 % », où le glyphe contredit le
 * nombre affiché juste à côté.
 */
export type TrendSentiment = 'good' | 'bad' | 'neutral' | 'warn'

const ACCENT: Record<MetricTone, string> = {
  neutral: 'before:bg-rule-strong',
  gold: 'before:bg-gold',
  positive: 'before:bg-positive',
  caution: 'before:bg-caution',
  critical: 'before:bg-critical',
}

const GLYPH: Record<TrendDirection, { symbol: string; label: string }> = {
  up: { symbol: '▲', label: 'en hausse' },
  down: { symbol: '▼', label: 'en baisse' },
  flat: { symbol: '→', label: 'stable' },
}

const SENTIMENT: Record<TrendSentiment, { className: string; label: string }> = {
  good: { className: 'text-positive-ink', label: 'favorable' },
  bad: { className: 'text-critical-ink', label: 'défavorable' },
  warn: { className: 'text-caution-ink', label: 'point de vigilance' },
  neutral: { className: 'text-ink-muted', label: '' },
}

/** Par défaut : une hausse est favorable, une baisse ne l'est pas. */
const DEFAULT_SENTIMENT: Record<TrendDirection, TrendSentiment> = {
  up: 'good',
  down: 'bad',
  flat: 'neutral',
}

export interface MetricProps {
  label: string
  /** Valeur **déjà formatée**. Le composant ne met jamais en forme un nombre. */
  value: ReactNode
  tone?: MetricTone
  tooltip?: ReactNode

  /** Variation formatée, ex. « +12,3 % ». */
  trend?: ReactNode
  trendDirection?: TrendDirection
  /** Appréciation. À préciser dès que « baisse » ne signifie pas « mauvais ». */
  trendSentiment?: TrendSentiment
  /** Ce à quoi la variation se compare, ex. « vs mois précédent ». */
  trendCaption?: ReactNode

  /** Repère ou complément, ex. « Benchmark 60–72 % ». */
  hint?: ReactNode
  /** Provenance, affichée en pied de carte. */
  source?: ReactNode

  /** Indicateur non calculable : la carte explique pourquoi. */
  unavailable?: boolean
  unavailableReason?: ReactNode

  /** Rend la carte cliquable vers un détail. */
  href?: string
  className?: string
}

export function Metric({
  label,
  value,
  tone = 'neutral',
  tooltip,
  trend,
  trendDirection = 'flat',
  trendSentiment,
  trendCaption,
  hint,
  source,
  unavailable = false,
  unavailableReason = 'Donnée non disponible pour cette période',
  href,
  className,
}: MetricProps) {
  const glyph = GLYPH[trendDirection]
  const sentiment = SENTIMENT[trendSentiment ?? DEFAULT_SENTIMENT[trendDirection]]

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="section-label text-ink-muted">{label}</p>
        {tooltip && <Tooltip content={tooltip} tone="glass" label={`À propos de ${label}`} />}
      </div>

      {unavailable ? (
        <p className="mt-3 text-xs leading-snug text-ink-faint">{unavailableReason}</p>
      ) : (
        <>
          <p className="tabular display animate-rise mt-2.5 text-[28px] font-semibold leading-none text-ink [animation-delay:60ms]">
            {value}
          </p>

          {(trend || hint) && (
            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {trend != null && (
                <span className={cn('tabular text-xs font-semibold', sentiment.className)}>
                  <span aria-hidden="true" className="mr-0.5">
                    {glyph.symbol}
                  </span>
                  {/* Le glyphe seul n'est pas annoncé : c'est ce texte qui
                      porte le sens à l'oral. */}
                  <span className="sr-only">
                    {glyph.label}
                    {sentiment.label ? `, ${sentiment.label}` : ''} :{' '}
                  </span>
                  {trend}
                </span>
              )}
              {trendCaption && (
                <span className="text-[11px] text-ink-faint">{trendCaption}</span>
              )}
              {hint && <span className="text-[11px] text-ink-muted">{hint}</span>}
            </div>
          )}
        </>
      )}

      {source && (
        <p className="mt-3 border-t border-rule pt-2 text-[10px] leading-snug text-ink-faint">
          {source}
        </p>
      )}
    </>
  )

  const shell = cn(
    'glass relative block h-full overflow-hidden rounded-lg p-5',
    // Filet d'accent porté par un pseudo-élément : pas de bordure asymétrique
    // qui décalerait le contenu selon la tonalité.
    'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
    ACCENT[tone],
    // Un indicateur indisponible s'efface légèrement, sans devenir illisible.
    unavailable && 'opacity-80',
    className,
  )

  if (href && !unavailable) {
    return (
      <Link
        href={href}
        data-print-block
        className={cn(
          shell,
          'lift glass-sheen group',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
        )}
      >
        {body}
        <span className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-gold">
          Voir le détail
          {/* La flèche avance au survol : le mouvement annonce la direction. */}
          <span
            aria-hidden="true"
            className="transition-transform duration-[--duration-quick] ease-[--ease-glass] group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </Link>
    )
  }

  return (
    <div data-print-block className={shell}>
      {body}
    </div>
  )
}
