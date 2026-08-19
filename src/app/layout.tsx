import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'

/**
 * Police de repli — Outfit.
 *
 * Lufga est la police de la charte, mais c'est une fonte commerciale : elle
 * n'est pas distribuée ici. Les `@font-face` de `globals.css` la déclarent en
 * tête de pile et pointent vers `/fonts/Lufga-*.woff2` ; tant que ces fichiers
 * sont absents, le navigateur bascule silencieusement sur Outfit.
 *
 * Outfit est le sans-serif géométrique libre le plus proche de Lufga. Elle est
 * auto-hébergée au build par `next/font`, ce qui permet à la CSP de rester
 * `font-src 'self'` — aucune requête vers Google au moment de l'affichage.
 *
 * Voir `public/fonts/README.md` pour activer Lufga.
 */
const outfit = Outfit({
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Qima · Tableau de bord Honeylang',
  description:
    'Tableau de bord financier privé Honeylang — Mission Qima. Accès strictement réservé.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  // Teinte la barre d'interface du navigateur sur mobile, dans le bordeaux
  // de la marque : la coque de l'application se prolonge jusqu'au système.
  themeColor: '#1B1016',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
