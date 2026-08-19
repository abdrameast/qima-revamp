import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'positive' | 'caution' | 'critical' | 'gold' | 'neutral' | 'info'

/**
 * Deux jeux de styles selon le support : un vert lisible sur bordeaux est
 * illisible sur papier, et réciproquement. Le composant ne devine pas — la
 * tonalité du support est explicite.
 */
const ON_PAPER: Record<BadgeTone, string> = {
  positive: 'bg-positive/14 text-positive-ink',
  caution: 'bg-caution/14 text-caution-ink',
  critical: 'bg-critical/13 text-critical-ink',
  gold: 'bg-gold/28 text-gold',
  neutral: 'bg-white/[0.08] text-ink-muted',
  info: 'bg-mauve/25 text-ink-muted',
}

const ON_DARK: Record<BadgeTone, string> = {
  positive: 'bg-positive/15 text-positive',
  caution: 'bg-caution/15 text-caution',
  critical: 'bg-critical/15 text-critical',
  gold: 'bg-gold/15 text-gold',
  neutral: 'bg-surface-raised text-cream-muted',
  info: 'bg-mauve/20 text-cream-muted',
}

export function Badge({
  tone = 'neutral',
  surface = 'paper',
  children,
  className,
  /** Préfixe annoncé aux lecteurs d'écran (ex. « Statut : »). */
  srPrefix,
}: {
  tone?: BadgeTone
  surface?: 'paper' | 'dark'
  children: ReactNode
  className?: string
  srPrefix?: string
}) {
  const styles = surface === 'paper' ? ON_PAPER : ON_DARK

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-[10px] font-semibold leading-none',
        styles[tone],
        className,
      )}
    >
      {srPrefix && <span className="sr-only">{srPrefix}</span>}
      {children}
    </span>
  )
}
