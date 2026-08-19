'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Brand } from './Brand'
import { NAV_SECTIONS } from './navigation'

/**
 * Barre latérale — écrans ≥ 1024 px.
 *
 * Sept sections tiennent mal en onglets horizontaux : à cette largeur la
 * verticale est la ressource abondante, et le rail permanent libère la barre
 * supérieure pour le sélecteur de période et l'état de synchronisation.
 *
 * ## Indicateur coulissant
 *
 * La pastille active n'est pas rendue dans chaque lien : c'est **un seul
 * élément** positionné par `transform`, qui glisse d'une section à l'autre.
 * Le mouvement relie visuellement la section quittée à celle atteinte, là où
 * un simple changement de couleur ferait « sauter » l'attention.
 *
 * Le positionnement est calculé arithmétiquement (index × pas) plutôt que
 * mesuré au DOM : pas de `ResizeObserver`, pas de lecture de layout, donc
 * aucun décalage au premier rendu. Le prix est un couplage aux constantes de
 * hauteur ci-dessous, gardées à côté de leur usage.
 */

/** Hauteur d'un élément de navigation, en pixels — doit suivre `py`/`text` ci-dessous. */
const ITEM_HEIGHT = 44
/** Espace vertical entre deux éléments. */
const ITEM_GAP = 4

export function Sidebar() {
  const pathname = usePathname()

  const activeIndex = NAV_SECTIONS.findIndex(
    (section) => pathname === section.href || pathname.startsWith(section.href + '/'),
  )

  return (
    <nav
      data-app-nav
      aria-label="Sections du tableau de bord"
      className={cn(
        'no-print fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col',
        'glass-dark rounded-none border-y-0 border-l-0 lg:flex',
      )}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-glass-edge-dark px-5">
        <Link
          href="/dashboard/overview"
          className="press rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <Brand />
          <span className="sr-only">Accueil du tableau de bord</span>
        </Link>
      </div>

      <div className="relative flex-1 overflow-y-auto p-3">
        {/* Pastille active — un seul élément qui glisse.
            `aria-hidden` : l'état courant est déjà porté par `aria-current`
            sur le lien ; l'annoncer deux fois serait redondant. */}
        {activeIndex >= 0 && (
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-3 z-0 rounded-md',
              // Verre plutôt qu'aplat : la pastille laisse voir les halos.
              'border border-gold/25 bg-white/[0.07] backdrop-blur-sm',
              'shadow-[0_2px_12px_rgb(197_167_106_/_0.14)]',
              // 420 ms avec une décélération longue : le déplacement a du
              // poids, il ne « saute » pas d'un élément à l'autre.
              'transition-transform duration-[420ms] ease-[--ease-glass]',
              'will-change-transform motion-reduce:transition-none',
            )}
            style={{
              height: ITEM_HEIGHT,
              transform: `translateY(${activeIndex * (ITEM_HEIGHT + ITEM_GAP)}px)`,
            }}
          />
        )}

        <ul className="relative z-10" style={{ display: 'grid', rowGap: ITEM_GAP }}>
          {NAV_SECTIONS.map((section, index) => {
            const active = index === activeIndex
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  aria-current={active ? 'page' : undefined}
                  style={{ height: ITEM_HEIGHT }}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-md px-3 text-[13px] font-medium',
                    'transition-colors duration-[--duration-quick] ease-[--ease-glass]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
                    active
                      ? 'text-gold'
                      : 'text-cream-muted hover:bg-surface-raised/45 hover:text-cream',
                  )}
                >
                  {/* Filet vertical à gauche, qui se déploie sur la section active. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-y-2 left-0 w-[3px] rounded-full bg-gold',
                      'origin-center transition-transform duration-[--duration-calm] ease-[--ease-glass]',
                      active ? 'scale-y-100' : 'scale-y-0',
                    )}
                  />
                  <NavIcon
                    path={section.icon}
                    className={cn(
                      'transition-transform duration-[--duration-quick] ease-[--ease-spring]',
                      !active && 'group-hover:scale-110',
                    )}
                  />
                  <span className="truncate">{section.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="shrink-0 border-t border-glass-edge-dark px-5 py-4">
        <p className="text-[10px] leading-relaxed text-cream-faint">
          Honeylang × Qima
          <br />
          Accès privé · lecture seule
        </p>
      </div>
    </nav>
  )
}

export function NavIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-[18px] shrink-0', className)}
    >
      <path d={path} />
    </svg>
  )
}
