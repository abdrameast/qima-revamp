import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SectionLabel } from './SectionLabel'
import { Tooltip } from './Tooltip'

/**
 * Conteneur de contenu — panneau de verre dépoli.
 *
 * Deux tonalités :
 *  - `glass` (défaut) — verre clair, pour toute zone contenant des chiffres.
 *    Teinté clair et non sombre : c'est ce qui maintient le texte à 12,6:1
 *    une fois composé sur le fond.
 *  - `dark` — verre sombre, pour les blocs de contexte qui accompagnent les
 *    données sans en contenir.
 *
 * `interactive` ajoute l'élévation au survol. Réservé aux cartes qui mènent
 * réellement quelque part : une carte qui se soulève sans être cliquable
 * promet une action qui n'existe pas.
 */

export type CardTone = 'glass' | 'dark'

const TONES: Record<CardTone, string> = {
  glass: 'glass text-ink',
  dark: 'glass-dark text-cream',
}

export interface CardProps {
  tone?: CardTone
  /** Libellé de section, au-dessus du titre. */
  label?: string
  title?: ReactNode
  /** Bulle explicative à côté du titre. */
  tooltip?: ReactNode
  /** Contenu placé à droite de l'en-tête (bouton, sélecteur…). */
  action?: ReactNode
  /** Texte discret sous le titre — provenance, période, unité. */
  caption?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Retire le rembourrage du corps, pour un tableau pleine largeur. */
  flush?: boolean
  /** Élévation au survol. À réserver aux cartes réellement cliquables. */
  interactive?: boolean
  as?: 'section' | 'article' | 'div'
}

export function Card({
  tone = 'glass',
  label,
  title,
  tooltip,
  action,
  caption,
  children,
  className,
  bodyClassName,
  flush = false,
  interactive = false,
  as: Tag = 'section',
}: CardProps) {
  const hasHeader = Boolean(label || title || action || caption)

  return (
    <Tag
      data-print-block
      className={cn(
        'relative overflow-hidden rounded-lg',
        TONES[tone],
        interactive && 'lift glass-sheen',
        className,
      )}
    >
      {hasHeader && (
        <header
          className={cn(
            'flex items-start justify-between gap-3 px-5 pt-5',
            flush ? 'pb-4' : 'pb-1',
          )}
        >
          <div className="min-w-0">
            {label && (
              <SectionLabel tone={tone === 'glass' ? 'ink' : 'gold'}>{label}</SectionLabel>
            )}
            {title && (
              <h3
                className={cn(
                  'display mt-1 flex items-center gap-1.5 text-[15px] font-semibold',
                  tone === 'glass' ? 'text-ink' : 'text-cream',
                )}
              >
                <span className="truncate">{title}</span>
                {tooltip && <Tooltip content={tooltip} tone={tone} />}
              </h3>
            )}
            {caption && (
              <p
                className={cn(
                  'mt-1.5 text-[11px] leading-snug',
                  tone === 'glass' ? 'text-ink-muted' : 'text-cream-muted',
                )}
              >
                {caption}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}

      <div className={cn(!flush && 'p-5', hasHeader && !flush && 'pt-4', bodyClassName)}>
        {children}
      </div>
    </Tag>
  )
}
