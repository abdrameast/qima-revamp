import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * État vide.
 *
 * Distingue trois situations que l'on confond souvent, et qui appellent des
 * messages différents :
 *  - `pending`  — la donnée existera, elle n'est pas encore saisie ;
 *  - `filtered` — la donnée existe, le filtre courant l'exclut ;
 *  - `none`     — il n'y a rien à afficher, et c'est normal.
 *
 * Aucun de ces cas ne doit être rendu par un « 0 € », qui serait un mensonge.
 */
export function EmptyState({
  variant = 'pending',
  title,
  description,
  action,
  className,
}: {
  variant?: 'pending' | 'filtered' | 'none'
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-md px-6 py-10 text-center',
        variant === 'filtered'
          ? 'bg-white/[0.05]'
          : 'border border-dashed border-rule-strong bg-white/[0.03]',
        className,
      )}
    >
      <p className="text-xs font-semibold text-ink">{title}</p>
      {description && (
        <p className="max-w-sm text-[11px] leading-relaxed text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
