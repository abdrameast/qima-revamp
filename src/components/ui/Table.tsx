'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Tableau de données.
 *
 * Comportement responsive : le tableau défile horizontalement **dans son
 * conteneur**, jamais la page. La première colonne reste collée à gauche, si
 * bien qu'un produit reste identifiable quand on fait défiler ses colonnes de
 * chiffres — c'est la comparaison qu'il faut préserver sur petit écran, pas la
 * largeur.
 */

export function TableFrame({
  children,
  className,
  /** Description annoncée aux lecteurs d'écran et affichée à l'impression. */
  caption,
}: {
  children: ReactNode
  className?: string
  caption?: string
}) {
  return (
    <div
      className={cn('-mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0', className)}
      // Rend le conteneur focalisable au clavier lorsqu'il défile : sans cela,
      // un utilisateur au clavier ne peut pas atteindre les colonnes masquées.
      tabIndex={0}
      role="region"
      aria-label={caption ?? 'Tableau de données défilant'}
    >
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-rule-strong">{children}</thead>
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>
}

export type SortDirection = 'asc' | 'desc'

export function TH({
  children,
  numeric = false,
  sortable = false,
  sorted,
  onSort,
  className,
  sticky = false,
  width,
}: {
  children: ReactNode
  numeric?: boolean
  sortable?: boolean
  /** Direction active, ou `null` si cette colonne n'est pas la colonne de tri. */
  sorted?: SortDirection | null
  onSort?: () => void
  className?: string
  sticky?: boolean
  width?: string
}) {
  const content = (
    <span className={cn('inline-flex items-center gap-1', numeric && 'flex-row-reverse')}>
      {children}
      {sortable && (
        <span
          aria-hidden="true"
          className={cn('text-[9px]', sorted ? 'text-gold' : 'text-ink-faint/75')}
        >
          {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕'}
        </span>
      )}
    </span>
  )

  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      // `aria-sort` fait annoncer l'état de tri de la colonne, ce qu'un simple
      // chevron visuel ne transmet pas.
      aria-sort={sortable ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
      data-numeric={numeric || undefined}
      className={cn(
        'section-label whitespace-nowrap pb-2 pt-1 align-bottom text-ink-faint',
        numeric ? 'text-right' : 'text-left',
        // Doit masquer ce qui défile dessous : opaque, accordé au verre.
        sticky && 'sticky left-0 z-10 bg-[#332830]',
        className,
      )}
    >
      {sortable && onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'section-label -mx-1 rounded-xs px-1 py-0.5 transition-colors',
            'hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1',
            'focus-visible:outline-gold',
            sorted && 'text-ink',
          )}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  )
}

export function TR({
  children,
  className,
  /** Grise la ligne — donnée incomplète, hors périmètre. */
  dimmed = false,
  /** Souligne la ligne — seuil, total. */
  emphasis = false,
}: {
  children: ReactNode
  className?: string
  dimmed?: boolean
  emphasis?: boolean
}) {
  return (
    <tr
      className={cn(
        'border-b border-rule last:border-b-0',
        'transition-colors duration-[--duration-quick] ease-[--ease-glass]',
        !dimmed && 'hover:bg-white/[0.055]',
        dimmed && 'opacity-55',
        emphasis && 'bg-gold/[0.11] font-semibold',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function TD({
  children,
  numeric = false,
  className,
  sticky = false,
  colSpan,
}: {
  children: ReactNode
  numeric?: boolean
  className?: string
  sticky?: boolean
  colSpan?: number
}) {
  return (
    <td
      colSpan={colSpan}
      data-numeric={numeric || undefined}
      className={cn(
        'py-2.5 align-middle text-ink',
        numeric ? 'text-right tabular' : 'text-left',
        // Doit masquer ce qui défile dessous : opaque, accordé au verre.
        sticky && 'sticky left-0 z-10 bg-[#332830]',
        className,
      )}
    >
      {children}
    </td>
  )
}

/** Ligne « aucun résultat », occupant toute la largeur du tableau. */
export function TEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-xs text-ink-faint">
        {children}
      </td>
    </tr>
  )
}
