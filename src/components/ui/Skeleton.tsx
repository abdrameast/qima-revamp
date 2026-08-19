import { cn } from '@/lib/cn'

/**
 * Substitut de chargement.
 *
 * Marqué `aria-hidden` : la forme visuelle n'a aucun sens à l'oral. C'est le
 * conteneur qui porte `aria-busy` et annonce « chargement » une seule fois,
 * plutôt que chaque rectangle.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-shimmer rounded-sm', className)}
    />
  )
}

/** Gabarit d'une carte d'indicateur pendant le chargement. */
export function SkeletonMetric({ className }: { className?: string }) {
  return (
    <div className={cn('glass animate-glass-in rounded-lg p-5', className)}>
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="mt-3.5 h-7 w-32" />
      <Skeleton className="mt-3 h-2.5 w-20" />
    </div>
  )
}

/** Gabarit d'une carte de contenu. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('glass animate-glass-in rounded-lg p-5', className)}>
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="mt-2 h-4 w-40" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-9/12" />
      </div>
    </div>
  )
}

/**
 * Région de chargement.
 * Porte l'état occupé et le message unique destiné aux lecteurs d'écran.
 */
export function LoadingRegion({
  label = 'Chargement des données',
  children,
  className,
}: {
  label?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}
