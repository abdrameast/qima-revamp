'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Brand } from '@/components/layout/Brand'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * Page de connexion.
 *
 * `useSearchParams` impose une frontière `Suspense` : sans elle, la page
 * entière bascule en rendu dynamique.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  )
}

/**
 * Assainit la destination post-connexion.
 *
 * Reprend la logique de `safeRedirectPath` côté serveur : seuls les chemins
 * internes sont acceptés. Sans ce filtre, `?next=https://evil.tld` ferait de
 * la page de connexion un tremplin de redirection ouverte.
 */
function safeNext(candidate: string | null): string {
  const fallback = '/dashboard/overview'
  if (!candidate) return fallback
  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//')) return fallback
  if (candidate.includes('\\') || candidate.includes('://')) return fallback
  return candidate
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (response.ok) {
        const destination = safeNext(searchParams.get('next'))
        // `replace` plutôt que `push` : le retour arrière ne doit pas ramener
        // sur un formulaire de connexion déjà validé.
        router.replace(destination)
        router.refresh()
        return
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? 'Email ou mot de passe incorrect.')
    } catch {
      setError('Connexion au serveur impossible. Vérifiez votre réseau, puis réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <LoginShell>
      <form onSubmit={handleSubmit} className="mt-9 space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-cream-muted">
            Adresse email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="prenom.nom@exemple.fr"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-cream-muted">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
            className={FIELD_CLASS}
          />
        </div>

        {/* Région live : le message est annoncé à son apparition, sans qu'il
            faille re-parcourir le formulaire pour le découvrir. */}
        <div id="login-error" role="alert" aria-live="polite" className="min-h-[1.25rem]">
          {error && <p className="text-xs font-medium text-critical">{error}</p>}
        </div>

        <Button type="submit" variant="primary" size="lg" loading={loading} fullWidth>
          {loading ? 'Connexion en cours…' : 'Accéder au tableau de bord'}
        </Button>
      </form>
    </LoginShell>
  )
}

const FIELD_CLASS = cn(
  'h-11 w-full rounded-md border border-line-strong bg-surface px-3.5 text-sm text-cream',
  'transition-colors duration-[--duration-quick]',
  'placeholder:text-cream-faint/60',
  'hover:border-mauve',
  'focus-visible:border-gold focus-visible:outline-2 focus-visible:outline-offset-1',
  'focus-visible:outline-gold',
)

/** Habillage partagé — rendu aussi pendant le fallback Suspense. */
function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-canvas">
      {/* Motif décoratif : deux cercles en trait fin, retirés de l'arbre
          d'accessibilité et masqués sous 640 px où l'espace manque. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-48 top-1/2 hidden -translate-y-1/2 sm:block"
      >
        <div className="size-[620px] rounded-full border border-line" />
        <div className="absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line" />
      </div>

      <header className="relative z-10 px-6 pt-8 sm:px-10 sm:pt-10">
        <Brand />
        <div aria-hidden="true" className="mt-6 h-px w-full max-w-[420px] bg-gold/50" />
      </header>

      <main className="relative z-10 flex flex-1 items-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <p className="section-label text-gold">Accès sécurisé</p>

          <h1 className="mt-3 text-4xl leading-[1.12] text-cream sm:text-5xl">
            <span className="font-light">Tableau de bord</span>
            <br />
            <span className="font-semibold">Honeylang</span>
          </h1>

          <p className="mt-4 max-w-[380px] text-sm leading-relaxed text-cream-muted">
            Espace privé réservé au pilotage financier. L&apos;accès est nominatif et journalisé.
          </p>

          {children}
        </div>
      </main>

      <footer className="relative z-10 px-6 pb-8 sm:px-10">
        <p className="text-[11px] text-cream-faint">
          Qima × Honeylang · CFO fractionné · Document confidentiel
        </p>
      </footer>
    </div>
  )
}
