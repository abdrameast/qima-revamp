'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

/**
 * Boîte de dialogue modale.
 *
 * Bâtie sur l'élément natif `<dialog>` et `showModal()`, ce qui fournit
 * gratuitement et correctement : le piège de focus, l'inertie du contenu
 * derrière, la fermeture par Échap, et la sémantique de modale. Réimplémenter
 * cela à la main est la source habituelle de modales inaccessibles.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (open && !node.open) node.showModal()
    else if (!open && node.open) node.close()
  }, [open])

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // `close` couvre Échap comme le bouton de fermeture : on synchronise
    // l'état React quel que soit le chemin emprunté.
    const handleClose = () => onClose()
    node.addEventListener('close', handleClose)
    return () => node.removeEventListener('close', handleClose)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      // Le clic sur le fond ferme la modale ; le clic à l'intérieur ne remonte
      // pas jusqu'ici grâce au `stopPropagation` du panneau.
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={cn(
        'glass animate-glass-in m-auto w-[min(560px,calc(100vw-2rem))] rounded-lg p-0',
        'text-ink shadow-[--shadow-overlay] backdrop:bg-canvas/70 backdrop:backdrop-blur-sm',
        className,
      )}
    >
      <div onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
          <div className="min-w-0">
            <h2 id="dialog-title" className="text-sm font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-[11px] leading-snug text-ink-muted">{description}</p>
            )}
          </div>
          <Button
            variant="quiet"
            size="sm"
            onClick={onClose}
            aria-label="Fermer la boîte de dialogue"
            className="shrink-0"
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5 text-[13px]">{children}</div>

        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-rule bg-white/[0.04] px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
