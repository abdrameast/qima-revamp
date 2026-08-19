/**
 * Bandeau d'avertissement — authentification contournée.
 *
 * Rendu côté serveur, en tête de page, non masquable. Un contournement
 * d'authentification silencieux est exactement le genre de réglage que l'on
 * oublie d'avoir activé ; celui-ci se voit sur chaque écran.
 */
export function DevBanner() {
  return (
    <div
      role="alert"
      className="no-print sticky top-0 z-50 border-b border-critical/40 bg-critical-ink px-4 py-2 text-center"
    >
      <p className="text-[11px] font-semibold leading-snug text-white">
        <span aria-hidden="true" className="mr-1.5">
          ▲
        </span>
        Authentification désactivée —{' '}
        <code className="rounded-xs bg-white/15 px-1 py-px font-mono">AUTH_DISABLED=true</code>{' '}
        · mode développement local uniquement, impossible en production
      </p>
    </div>
  )
}
