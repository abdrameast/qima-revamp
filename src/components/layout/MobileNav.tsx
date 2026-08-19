'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Brand } from './Brand'
import { NAV_SECTIONS, activeSection } from './navigation'
import { NavIcon } from './Sidebar'

/**
 * Navigation mobile et tablette — écrans < 1024 px.
 *
 * Tiroir plein écran plutôt qu'une rangée d'onglets défilante : sept sections
 * en défilement horizontal masquent en permanence une partie des choix, et
 * obligent à un geste pour découvrir ce qui existe. Le tiroir montre les sept,
 * avec une phrase de description chacune.
 */
export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const current = activeSection(pathname)

  // Échap ferme, et le focus revient au déclencheur — sinon il repartirait au
  // début du document.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Empêche le défilement de l'arrière-plan pendant l'ouverture.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Place le focus dans le panneau à l'ouverture.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        className={cn(
          'press no-print inline-flex items-center gap-2 rounded-md border border-line-strong',
          'px-3 py-2 text-xs font-medium text-cream lg:hidden',
          'transition-colors duration-[--duration-quick]',
          'hover:border-gold hover:bg-surface-raised/50 hover:text-gold',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          className="size-4"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        <span className="max-[380px]:sr-only">{current?.shortLabel ?? 'Menu'}</span>
      </button>

      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="animate-fade absolute inset-0 h-full w-full cursor-default bg-canvas/75 backdrop-blur-sm"
          />

          <div
            id="mobile-nav-panel"
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={cn(
              'animate-slide-left absolute inset-y-0 left-0 flex w-[min(330px,88vw)] flex-col',
              'glass-dark rounded-none border-y-0 border-l-0 shadow-[--shadow-overlay]',
              'focus-visible:outline-none',
            )}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-glass-edge-dark px-4">
              <Brand size="sm" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
                aria-label="Fermer le menu"
                className={cn(
                  'rounded-md p-2 text-cream-muted transition-colors',
                  'hover:bg-surface-raised hover:text-cream',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
                )}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  className="size-4"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <nav aria-label="Sections du tableau de bord" className="flex-1 overflow-y-auto p-3">
              <ul className="stagger space-y-1">
                {NAV_SECTIONS.map((section) => {
                  const active =
                    pathname === section.href || pathname.startsWith(section.href + '/')
                  return (
                    <li key={section.href}>
                      <Link
                        href={section.href}
                        // Le tiroir se referme sur le clic qui déclenche la
                        // navigation, plutôt qu'en réaction au changement de
                        // route : c'est l'événement qui porte l'intention.
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'press flex items-start gap-3 rounded-md px-3 py-3',
                          'transition-colors duration-[--duration-quick]',
                          'focus-visible:outline-2 focus-visible:outline-offset-2',
                          'focus-visible:outline-gold',
                          active
                            ? 'bg-surface-raised/80 text-gold ring-1 ring-inset ring-gold/20'
                            : 'text-cream-muted hover:bg-surface-raised/50 hover:text-cream',
                        )}
                      >
                        <NavIcon path={section.icon} className="mt-0.5" />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium">{section.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-cream-faint">
                            {section.description}
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
