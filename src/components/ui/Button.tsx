import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'glass-sheen press relative inline-flex items-center justify-center gap-2 rounded-md ' +
  'font-semibold whitespace-nowrap ' +
  'transition-[background-color,border-color,color,box-shadow,transform] ' +
  'duration-[--duration-quick] ease-[--ease-glass] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ' +
  'disabled:cursor-not-allowed disabled:opacity-45 disabled:pointer-events-none'

const VARIANTS: Record<ButtonVariant, string> = {
  // Action principale : aplat or, texte bordeaux. Contraste 7,56:1.
  primary:
    'bg-gold text-bordeaux shadow-[--shadow-card] ' +
    'hover:bg-gold-bright hover:shadow-[--shadow-glow-gold] ' +
    'active:bg-gold-deep active:text-cream',
  // Action secondaire sur coque sombre — verre sombre.
  secondary:
    'glass-dark text-cream hover:border-gold/50 hover:text-gold ' +
    'hover:shadow-[--shadow-raised]',
  // Action tertiaire sur coque sombre, sans surface.
  ghost:
    'text-cream-muted hover:bg-surface-raised/70 hover:text-cream active:bg-surface-strong/70',
  // Action tertiaire sur verre clair.
  quiet:
    'border border-rule bg-white/[0.06] text-ink-muted ' +
    'hover:border-rule-strong hover:bg-white/[0.12] hover:text-ink',
  danger:
    'border border-critical/35 bg-critical-soft text-critical ' +
    'hover:border-critical/60 hover:bg-critical/20',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-[13px]',
  lg: 'h-11 px-6 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Affiche un indicateur et neutralise le bouton. */
  loading?: boolean
  /** Texte annoncé aux lecteurs d'écran pendant le chargement. */
  loadingLabel?: string
  iconLeft?: ReactNode
  iconRight?: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingLabel = 'Chargement en cours',
  iconLeft,
  iconRight,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      // `aria-busy` informe les technologies d'assistance sans changer le libellé,
      // ce qui évite de faire « sauter » le nom accessible pendant l'action.
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          <span className="sr-only">{loadingLabel}</span>
        </>
      ) : (
        iconLeft
      )}
      {children}
      {!loading && iconRight}
    </button>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
    />
  )
}
