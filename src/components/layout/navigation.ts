/**
 * Modèle de navigation — source unique pour la barre latérale, le tiroir
 * mobile et les fils d'Ariane.
 */

export interface NavSection {
  href: string
  label: string
  /** Nom court, utilisé quand la place manque. */
  shortLabel: string
  /** Sous-titre affiché dans le tiroir mobile. */
  description: string
  /** Chemin du tracé SVG de l'icône (grille 24×24, contour). */
  icon: string
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    href: '/dashboard/overview',
    label: "Vue d'ensemble",
    shortLabel: 'Synthèse',
    description: 'CA, marge, trésorerie et BFR',
    icon: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  },
  {
    href: '/dashboard/canaux',
    label: 'Canaux',
    shortLabel: 'Canaux',
    description: 'Performance DTC, TikTok et pharmacie',
    icon: 'M3 3v18h18M8 17V9m5 8V5m5 12v-6',
  },
  {
    href: '/dashboard/shopify',
    label: 'Shopify',
    shortLabel: 'Shopify',
    description: 'Rétention, cohortes et top produits',
    icon: 'M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9Z',
  },
  {
    href: '/dashboard/produits',
    label: 'Produits & Marges',
    shortLabel: 'Produits',
    description: 'Coût de revient complet par SKU',
    icon: 'M20 7 12 3 4 7v10l8 4 8-4V7ZM4 7l8 4m0 0 8-4m-8 4v10',
  },
  {
    href: '/dashboard/tresorerie',
    label: 'Trésorerie',
    shortLabel: 'Trésorerie',
    description: 'Runway, cycle de conversion et tensions',
    icon: 'M3 7h18v12H3V7Zm0 4h18M7 15h4',
  },
  {
    href: '/dashboard/simulations',
    label: 'Simulations',
    shortLabel: 'Simulations',
    description: 'Remise, campagne et nouveau produit',
    icon: 'M12 3v18M5 8h14M7 13a5 5 0 0 0 10 0',
  },
  {
    href: '/dashboard/budget',
    label: 'Budget vs Réel',
    shortLabel: 'Budget',
    description: 'Écarts budgétaires par poste et pôle',
    icon: 'M4 4h16v16H4V4Zm0 6h16M10 10v10',
  },
]

/** Section active pour un chemin donné. */
export function activeSection(pathname: string): NavSection | undefined {
  return NAV_SECTIONS.find(
    (section) => pathname === section.href || pathname.startsWith(section.href + '/'),
  )
}
