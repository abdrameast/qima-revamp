'use client'

import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Sélecteur segmenté — bascule entre vues mutuellement exclusives.
 *
 * Implémente le motif ARIA « tablist » : une seule tabulation entre dans le
 * groupe, puis les flèches naviguent entre les options. C'est le comportement
 * attendu d'un groupe de boutons radio ; une suite de `<button>` indépendants
 * forcerait l'utilisateur à tabuler à travers chaque option.
 */

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  /** Compteur discret, ex. « (12) ». */
  count?: number
  /** Nom accessible si `label` est une icône ou trop laconique. */
  srLabel?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  surface = 'paper',
  size = 'md',
  className,
}: {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Nom du groupe, annoncé aux lecteurs d'écran. */
  label: string
  surface?: 'paper' | 'dark'
  size?: 'sm' | 'md'
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: React.KeyboardEvent, index: number): void {
    const last = options.length - 1
    let next: number | null = null

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last

    if (next === null) return
    event.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  const onPaper = surface === 'paper'

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'inline-flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-lg border p-1',
        onPaper ? 'border-rule-strong bg-white/[0.05]' : 'glass-dark',
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            // Un seul élément du groupe est tabulable : c'est ce qui permet de
            // traverser le groupe d'une seule tabulation.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'press whitespace-nowrap rounded-md font-semibold',
              'transition-[background-color,color,box-shadow] duration-[--duration-quick] ease-[--ease-glass]',
              'focus-visible:outline-2 focus-visible:outline-offset-1',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs',
              selected
                ? onPaper
                  ? 'bg-gold text-bordeaux shadow-[--shadow-card] focus-visible:outline-gold'
                  : 'bg-gold text-bordeaux focus-visible:outline-gold'
                : onPaper
                  ? 'text-ink-muted hover:bg-white/[0.09] hover:text-ink focus-visible:outline-gold'
                  : 'text-cream-muted hover:bg-surface-raised hover:text-cream focus-visible:outline-gold',
            )}
          >
            {option.srLabel && <span className="sr-only">{option.srLabel}</span>}
            {option.label}
            {option.count !== undefined && (
              <span className={cn('ml-1 tabular', selected ? 'opacity-70' : 'opacity-55')}>
                ({option.count})
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
