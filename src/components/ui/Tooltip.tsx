'use client'

import { useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Bulle explicative pédagogique.
 *
 * Accessibilité :
 *  - déclencheur `<button>` réel, donc atteignable au clavier ;
 *  - s'ouvre au survol **et** au focus, se ferme à Échap ;
 *  - liée par `aria-describedby`, si bien que le contenu est annoncé comme
 *    description du contrôle et non comme un bloc de texte isolé ;
 *  - la bulle reste dans le flux DOM (jamais `display:none`) pour que la
 *    description soit lisible même lorsqu'elle est masquée visuellement.
 */
export function Tooltip({
  content,
  label = "Plus d'informations",
  tone = 'glass',
  className,
}: {
  content: ReactNode
  /** Nom accessible du déclencheur. */
  label?: string
  tone?: 'glass' | 'dark'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <button
        type="button"
        aria-describedby={id}
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            setOpen(false)
          }
        }}
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-full border',
          'text-[9px] font-semibold leading-none transition-colors duration-[--duration-quick]',
          tone === 'glass'
            ? 'border-rule-strong text-ink-faint hover:border-gold-deep hover:text-gold'
            : 'border-line-strong text-cream-faint hover:border-gold hover:text-gold',
        )}
      >
        <span aria-hidden="true">i</span>
      </button>

      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-[clamp(200px,60vw,280px)]',
          '-translate-x-1/2 rounded-md bg-surface-strong px-3 py-2.5',
          'text-[11px] font-normal leading-snug text-cream shadow-[--shadow-overlay]',
          'transition-opacity duration-[--duration-quick] ease-[--ease-out-soft]',
          open ? 'opacity-100' : 'invisible opacity-0',
        )}
      >
        {content}
      </span>
    </span>
  )
}
