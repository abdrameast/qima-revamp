// Formatters pour l'affichage — gèrent systématiquement les valeurs manquantes
// Règle Honeylang : valeur manquante → "—" (jamais NaN, jamais 0 trompeur)

export const MISSING = '—'

type Maybe = number | null | undefined

function isMissing(value: Maybe): value is null | undefined {
  return value === null || value === undefined || (typeof value === 'number' && isNaN(value))
}

// Montant en euros — ex: 16 548 € (ou 16 548,50 €)
export function formatEuro(value: Maybe, decimals = 0): string {
  if (isMissing(value)) return MISSING
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value) + ' €'
  )
}

// Montant compact — ex: 16,5 k€, 1,2 M€
export function formatEuroCompact(value: Maybe): string {
  if (isMissing(value)) return MISSING
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return (value / 1_000_000).toFixed(1).replace('.', ',') + ' M€'
  if (abs >= 1_000) return (value / 1_000).toFixed(1).replace('.', ',') + ' k€'
  return formatEuro(value)
}

// Pourcentage — la valeur peut être un ratio (0.54) ou déjà en % (54)
export function formatPercent(value: Maybe, opts?: { isRatio?: boolean; decimals?: number }): string {
  if (isMissing(value)) return MISSING
  const decimals = opts?.decimals ?? 1
  const pct = opts?.isRatio ? value * 100 : value
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(pct) + ' %'
  )
}

// Nombre simple — ex: 3 890
export function formatNumber(value: Maybe, decimals = 0): string {
  if (isMissing(value)) return MISSING
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

// Nombre de jours — ex: 32 j
export function formatJours(value: Maybe, decimals = 0): string {
  if (isMissing(value)) return MISSING
  return formatNumber(value, decimals) + ' j'
}

// Multiplicateur — ex: ×3,5
export function formatMultiple(value: Maybe, decimals = 1): string {
  if (isMissing(value)) return MISSING
  return '×' + new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

// Delta signé — ex: +12,3 % ou −4,1 %
export function formatDelta(value: Maybe, opts?: { isRatio?: boolean; suffix?: string }): string {
  if (isMissing(value)) return MISSING
  const pct = opts?.isRatio ? value * 100 : value
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  const abs = Math.abs(pct)
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(abs)
  return `${sign}${formatted}${opts?.suffix ?? ' %'}`
}

// Libellé de mois « juin-26 » → « Juin 2026 »
//
// ⚠️ Les abréviations françaises de juin et juillet partagent leurs trois
// premières lettres (« jui »). Découper à trois caractères — ce que faisait
// l'implémentation précédente — faisait afficher « Juil. » pour juin, soit un
// mois entier de décalage sur tous les axes de graphique. Les préfixes longs
// sont donc testés en premier.
const MONTH_PREFIXES: { prefix: string; label: string }[] = [
  // 4 caractères — lèvent l'ambiguïté juin / juillet
  { prefix: 'juil', label: 'Juil.' },
  { prefix: 'juin', label: 'Juin' },
  { prefix: 'sept', label: 'Sept.' },
  { prefix: 'janv', label: 'Janv.' },
  { prefix: 'fevr', label: 'Févr.' },
  { prefix: 'mars', label: 'Mars' },
  { prefix: 'aout', label: 'Août' },
  { prefix: 'octo', label: 'Oct.' },
  { prefix: 'nove', label: 'Nov.' },
  { prefix: 'dece', label: 'Déc.' },
  { prefix: 'avri', label: 'Avr.' },
  // 3 caractères — formes courtes et variantes anglaises
  { prefix: 'jan', label: 'Janv.' },
  { prefix: 'fev', label: 'Févr.' },
  { prefix: 'mar', label: 'Mars' },
  { prefix: 'apr', label: 'Avr.' },
  { prefix: 'avr', label: 'Avr.' },
  { prefix: 'may', label: 'Mai' },
  { prefix: 'mai', label: 'Mai' },
  { prefix: 'jun', label: 'Juin' },
  { prefix: 'jul', label: 'Juil.' },
  { prefix: 'aug', label: 'Août' },
  { prefix: 'aou', label: 'Août' },
  { prefix: 'sep', label: 'Sept.' },
  { prefix: 'oct', label: 'Oct.' },
  { prefix: 'nov', label: 'Nov.' },
  { prefix: 'dec', label: 'Déc.' }
]

// Normalise pour comparaison : minuscules, sans accents ni ponctuation.
function normalizeMonthToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

export function formatMonth(label: string): string {
  if (!label) return MISSING

  const [rawMonth, rawYear] = label.split('-')
  const token = normalizeMonthToken(rawMonth ?? '')

  const match = MONTH_PREFIXES.find((entry) => token.startsWith(entry.prefix))
  const month = match ? match.label : (rawMonth ?? label)

  if (!rawYear) return month

  // Année sur 2 chiffres dans les classeurs sources ; sur 4, on la garde telle quelle.
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear
  return `${month} ${year}`
}

// Détermine le type de signal selon une marge (en ratio) et les seuils Honeylang
export type Signal = 'green' | 'amber' | 'red'

export function margeSignal(ratioOrPct: Maybe, isRatio = true): Signal | null {
  if (isMissing(ratioOrPct)) return null
  const pct = isRatio ? ratioOrPct * 100 : ratioOrPct
  if (pct >= 60) return 'green'
  if (pct >= 45) return 'amber'
  return 'red'
}

// ---------------------------------------------------------------------------
// Dates et fraîcheur
// ---------------------------------------------------------------------------

// Date + heure en conventions fr-FR — ex. « 18 août 2026 à 14:32 »
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return MISSING
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return MISSING
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short'
  }).format(date)
}

// Date seule — ex. « 18 août 2026 »
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return MISSING
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return MISSING
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date)
}

// Ancienneté relative — ex. « il y a 3 minutes ».
// Utilise Intl.RelativeTimeFormat : la déclinaison singulier/pluriel et les
// formulations sont prises en charge par la plateforme, pas réinventées ici.
export function formatRelative(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return MISSING

  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
  const abs = Math.abs(seconds)

  if (abs < 45) return "à l'instant"
  if (abs < 3600) return rtf.format(-Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return rtf.format(-Math.round(seconds / 3600), 'hour')
  return rtf.format(-Math.round(seconds / 86_400), 'day')
}

// Taille de fichier lisible — ex. « 45,0 Kio »
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return MISSING
  if (bytes < 1024) return `${bytes} o`
  const kib = bytes / 1024
  if (kib < 1024) return `${formatNumber(kib, 1)} Kio`
  return `${formatNumber(kib / 1024, 1)} Mio`
}

// Durée en mois — ex. « 3,2 mois »
// `toFixed()` produit un point décimal, illisible en français : il ne doit
// jamais atteindre l'interface directement.
export function formatMois(value: Maybe, decimals = 1): string {
  if (isMissing(value)) return MISSING
  return `${formatNumber(value, decimals)} mois`
}

// ROAS — ex. « ×3,1 »
export function formatRoas(value: Maybe, decimals = 1): string {
  if (isMissing(value)) return MISSING
  return `×${formatNumber(value, decimals)}`
}
