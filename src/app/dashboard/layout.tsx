import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getSession } from '@/lib/session'
import { DataProvider } from '@/components/data/DataProvider'
import { AnalysisProvider } from '@/components/data/AnalysisProvider'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { ViewTransition } from '@/components/layout/ViewTransition'
import { DevBanner } from '@/components/layout/DevBanner'
import { isAuthBypassEnabled } from '@/lib/env'

export const metadata: Metadata = {
  // Renforce le `noindex` global : ces pages ne doivent apparaître dans aucun
  // index, y compris via un lien partagé par inadvertance.
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Coque du tableau de bord.
 *
 * ⚠️ C'est **ici** que se fait le contrôle d'accès qui fait autorité : le
 * proxy ne vérifie que la présence d'un cookie, ce qui est un contrôle
 * optimiste. `getSession()` vérifie la signature du jeton, son expiration, son
 * émetteur, et que l'adresse figure toujours dans la liste blanche.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const authBypassed = isAuthBypassEnabled()

  return (
    <DataProvider>
      <AnalysisProvider>
        {authBypassed && <DevBanner />}

        {/* Lien d'évitement : première tabulation de la page, il permet
            d'atteindre le contenu sans traverser la navigation. */}
        <a
          href="#contenu"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-gold px-4 py-2 text-xs font-semibold text-bordeaux"
        >
          Aller au contenu
        </a>

        <ViewTransition />
        <Sidebar />

        <div className="min-h-screen lg:pl-[248px]">
          <Topbar email={session.email} />

          <main
            id="contenu"
            data-print-full
            className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          >
            {children}
          </main>

          <footer className="no-print border-t border-line px-4 py-5 text-center sm:px-6 lg:px-8">
            <p className="text-[10px] leading-relaxed text-cream-faint">
              Document confidentiel · Qima × Honeylang · Accès strictement privé, lecture seule
            </p>
          </footer>
        </div>
      </AnalysisProvider>
    </DataProvider>
  )
}
