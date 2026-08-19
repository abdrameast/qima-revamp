import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SectionLabel } from './SectionLabel'

/**
 * En-tête de page — identique sur les sept vues.
 *
 * Rôle : situer (libellé de section), nommer (titre), qualifier (description),
 * puis offrir les actions de la page. La provenance des données est rendue
 * juste en dessous par `SyncStatus`, de sorte que chaque page indique
 * explicitement d'où viennent ses chiffres.
 */
export function PageHeader({
  label,
  title,
  description,
  actions,
  meta,
  className,
}: {
  label: string
  title: string
  description?: ReactNode
  /** Commandes de la page (export, impression, filtres…). */
  actions?: ReactNode
  /** Bandeau de provenance / fraîcheur, rendu sous le titre. */
  meta?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <SectionLabel tone="gold">{label}</SectionLabel>
          <h1 className="display animate-rise mt-1.5 text-[26px] font-semibold text-cream sm:text-[32px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-cream-muted">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {meta && <div className="mt-4">{meta}</div>}
    </header>
  )
}

/** Titre de sous-section à l'intérieur d'une page. */
export function SectionHeading({
  label,
  title,
  description,
  actions,
  className,
}: {
  label?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        {label && <SectionLabel tone="cream">{label}</SectionLabel>}
        <h2 className="display mt-0.5 text-base font-semibold text-cream">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-cream-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
    </div>
  )
}
