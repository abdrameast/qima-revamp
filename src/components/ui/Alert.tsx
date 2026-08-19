import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type AlertTone = 'critical' | 'caution' | 'positive' | 'info'

const TONES: Record<AlertTone, { box: string; title: string; icon: string }> = {
  critical: { box: 'border-critical/30 bg-critical-soft', title: 'text-critical-ink', icon: '▲' },
  caution: { box: 'border-caution/35 bg-caution-soft', title: 'text-caution-ink', icon: '▲' },
  positive: { box: 'border-positive/30 bg-positive-soft', title: 'text-positive-ink', icon: '●' },
  info: { box: 'border-rule-strong bg-white/[0.05]', title: 'text-ink', icon: '●' },
}

/**
 * Message contextuel.
 *
 * Les alertes porteuses d'un risque financier sont annoncées poliment
 * (`role="status"`) plutôt qu'en interrompant (`role="alert"`) : elles sont
 * présentes au chargement de la page, pas déclenchées par une action, et une
 * interruption serait ici du bruit.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
  live = false,
}: {
  tone?: AlertTone
  title?: ReactNode
  children?: ReactNode
  /** Action suggérée, alignée à droite. */
  action?: ReactNode
  className?: string
  /** Passe le bloc en région live — pour un message apparaissant après une action. */
  live?: boolean
}) {
  const styles = TONES[tone]

  return (
    <div
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
      data-print-block
      className={cn('animate-rise rounded-md border p-4 backdrop-blur-sm', styles.box, className)}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cn('mt-px text-[10px] leading-4', styles.title)}>
          {styles.icon}
        </span>

        <div className="min-w-0 flex-1">
          {title && <p className={cn('text-xs font-semibold', styles.title)}>{title}</p>}
          {children && (
            <div className={cn('text-[11px] leading-relaxed text-ink-muted', title && 'mt-1')}>
              {children}
            </div>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
