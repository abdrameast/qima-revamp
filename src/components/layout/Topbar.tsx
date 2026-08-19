'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Brand } from './Brand'
import { MobileNav } from './MobileNav'
import { activeSection } from './navigation'
import { PeriodSelector } from '@/components/data/PeriodSelector'

/**
 * Barre supérieure.
 *
 * Contient ce qui vaut pour toutes les pages : navigation compacte sur petit
 * écran, section courante, sélecteur de période global, identité de la session.
 * Collante, car le sélecteur de période doit rester atteignable en défilant un
 * long tableau.
 */
export function Topbar({ email }: { email: string }) {
  const pathname = usePathname()
  const current = activeSection(pathname)

  return (
    <header
      className={cn(
        'no-print sticky top-0 z-20',
        // Verre sombre : le contenu défile visiblement dessous, ce qui situe
        // la barre au-dessus de la page plutôt que dans son flux.
        'glass-dark rounded-none border-x-0 border-t-0',
      )}
    >
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <MobileNav />

        {/* Marque visible seulement quand la barre latérale est masquée. */}
        <div className="lg:hidden">
          <Brand size="sm" showWordmark={false} />
        </div>

        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-sm font-semibold text-cream">
            {current?.label ?? 'Tableau de bord'}
          </p>
          <p className="truncate text-[11px] text-cream-faint">
            {current?.description ?? 'Honeylang'}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <PeriodSelector className="hidden md:flex" />

          <span aria-hidden="true" className="hidden h-6 w-px bg-glass-edge-dark lg:block" />

          <div className="hidden text-right lg:block">
            <p className="text-[11px] font-medium text-cream-muted">{email}</p>
            <p className="text-[10px] text-cream-faint">
              {email.endsWith('.invalid') ? 'Session factice' : 'Session privée'}
            </p>
          </div>

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className={cn(
                'press rounded-md border border-line-strong px-3 py-1.5 text-[11px] font-medium',
                'text-cream transition-colors duration-[--duration-quick]',
                'hover:border-gold hover:bg-surface-raised/50 hover:text-gold',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
              )}
            >
              <span className="max-sm:sr-only">Déconnexion</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 sm:hidden"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Sous 768 px, le sélecteur passe sur sa propre rangée plutôt que d'être
          comprimé à côté du reste. */}
      <div className="border-t border-glass-edge-dark px-4 py-2 md:hidden">
        <PeriodSelector />
      </div>
    </header>
  )
}
