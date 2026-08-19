import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type SectionLabelTone = 'gold' | 'ink' | 'cream' | 'muted'

const TONES: Record<SectionLabelTone, string> = {
  gold: 'text-gold',
  ink: 'text-ink-muted',
  cream: 'text-cream-muted',
  muted: 'text-cream-faint',
}

/** Petite capitale espacée, posée au-dessus d'un titre pour situer la section. */
export function SectionLabel({
  children,
  tone = 'gold',
  className,
  as: Tag = 'p',
}: {
  children: ReactNode
  tone?: SectionLabelTone
  className?: string
  as?: 'p' | 'h2' | 'span'
}) {
  return <Tag className={cn('section-label', TONES[tone], className)}>{children}</Tag>
}
