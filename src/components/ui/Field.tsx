'use client'

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Contrôles de saisie.
 *
 * Chaque champ a un `<label>` réellement associé — pas de placeholder tenant
 * lieu d'étiquette, qui disparaît dès la saisie et n'est pas annoncé de façon
 * fiable. Les messages d'erreur sont liés par `aria-describedby` et l'état
 * invalide est porté par `aria-invalid`, pas seulement par une couleur.
 */

const CONTROL_BASE =
  'w-full rounded-md border bg-white/[0.06] px-3 text-[13px] text-ink ' +
  'transition-[background-color,border-color] duration-[--duration-quick] ease-[--ease-glass] ' +
  'hover:bg-white/[0.1] focus:bg-white/[0.13] ' +
  'placeholder:text-ink-faint/70 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold ' +
  'disabled:cursor-not-allowed disabled:bg-white/[0.03] disabled:text-ink-faint'

const CONTROL_STATE = {
  normal: 'border-rule-strong hover:border-gold/45',
  invalid: 'border-critical bg-critical-soft',
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  htmlFor: string
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] leading-snug text-ink-faint">{hint}</p>}
      {error && (
        <p role="alert" className="text-[11px] font-medium leading-snug text-critical-ink">
          {error}
        </p>
      )}
    </div>
  )
}

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  containerClassName?: string
}

export function TextInput({
  label,
  hint,
  error,
  className,
  containerClassName,
  ...rest
}: TextInputProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={containerClassName}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(CONTROL_BASE, 'h-9', error ? CONTROL_STATE.invalid : CONTROL_STATE.normal, className)}
        {...rest}
      />
      {/* Ces nœuds portent les identifiants référencés ci-dessus ; le texte
          visible est rendu par `Field`. */}
      <span id={hintId} className="hidden">
        {hint}
      </span>
      <span id={errorId} className="hidden">
        {error}
      </span>
    </Field>
  )
}

export interface SelectInputProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  containerClassName?: string
  children: ReactNode
}

export function SelectInput({
  label,
  hint,
  error,
  className,
  containerClassName,
  children,
  ...rest
}: SelectInputProps) {
  const id = useId()

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={containerClassName}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          CONTROL_BASE,
          'h-9 cursor-pointer appearance-none pr-8',
          // Chevron dessiné en CSS : évite une requête réseau et reste net à
          // toutes les densités d'écran.
          'bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23CCB4BE' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")]",
          error ? CONTROL_STATE.invalid : CONTROL_STATE.normal,
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </Field>
  )
}

/**
 * Curseur de simulation.
 *
 * La valeur courante est affichée en permanence à côté du libellé : sur un
 * `input[type=range]`, elle est sinon invisible pour tout le monde.
 */
export function SliderInput({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
  className,
}: {
  label: string
  value: number
  /** Valeur formatée pour l'affichage, ex. « 12 % ». */
  display: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  hint?: ReactNode
  className?: string
}) {
  const id = useId()

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium text-ink-muted">
          {label}
        </label>
        <output htmlFor={id} className="tabular text-sm font-semibold text-gold">
          {display}
        </output>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        // `aria-valuetext` fait annoncer « 12 % » plutôt que « 12 » brut.
        aria-valuetext={display}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.12]',
          'accent-gold transition-colors duration-[--duration-quick] hover:bg-white/[0.18]',
          'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold',
        )}
      />

      {hint && <p className="text-[11px] leading-snug text-ink-faint">{hint}</p>}
    </div>
  )
}
