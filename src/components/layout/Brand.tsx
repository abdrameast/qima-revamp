import { cn } from '@/lib/cn'

/**
 * Bloc de marque QIMA.
 *
 * Le monogramme est dessiné en SVG plutôt qu'importé : une seule forme, aucun
 * aller-retour réseau, et il hérite de la couleur du texte, ce qui le rend
 * correct à l'impression comme sur fond sombre.
 */
export function Brand({
  size = 'md',
  showWordmark = true,
  className,
}: {
  size?: 'sm' | 'md'
  showWordmark?: boolean
  className?: string
}) {
  const box = size === 'sm' ? 'size-7' : 'size-8'

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className={cn(
          box,
          'inline-flex shrink-0 items-center justify-center rounded-md',
          'bg-gold text-bordeaux',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className={size === 'sm' ? 'size-4' : 'size-[18px]'}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m15.5 15.5 4 4" strokeLinecap="round" />
        </svg>
      </span>

      {showWordmark && (
        <span
          className={cn(
            'font-semibold uppercase tracking-[0.18em] text-gold',
            size === 'sm' ? 'text-sm' : 'text-base',
          )}
        >
          Qima
        </span>
      )}
    </span>
  )
}
