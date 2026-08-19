import { formatMonth } from './format'

/**
 * Période d'analyse partagée par toutes les pages.
 *
 * Fonctions pures, sans état ni React : la sélection est un objet sérialisable
 * et tout le reste s'en déduit. C'est ce qui permet de tester les découpages
 * — notamment les bornes de trimestre et le cumul à date — sans monter un
 * composant.
 *
 * Le modèle de données est mensuel (douze colonnes dans DATA_MENSUELLE). Une
 * période est donc, au fond, un sous-ensemble d'indices de mois.
 */

export type PeriodMode = 'year' | 'ytd' | 'quarter' | 'month'

export interface PeriodSelection {
  mode: PeriodMode
  /** Trimestre 0–3 en mode `quarter`, mois 0–11 en mode `month`. Ignoré sinon. */
  index: number
}

export const DEFAULT_PERIOD: PeriodSelection = { mode: 'year', index: 0 }

/** Base de comparaison d'une période. */
export type ComparisonBasis = 'none' | 'previous' | 'budget'

export interface ResolvedPeriod {
  selection: PeriodSelection
  /** Indices de mois couverts, croissants. */
  months: number[]
  /** Libellé court, ex. « T2 2026 ». */
  label: string
  /** Libellé long, ex. « avril – juin 2026 ». */
  longLabel: string
  /**
   * Indices de la période précédente de même longueur, ou `null` si elle
   * sortirait de l'exercice — auquel cas aucune comparaison n'est proposée
   * plutôt qu'une comparaison tronquée, qui serait trompeuse.
   */
  previousMonths: number[] | null
  previousLabel: string | null
}

/** Nombre de mois disponibles, borné à l'exercice. */
function clampMonthCount(monthLabels: readonly string[]): number {
  return Math.max(0, monthLabels.length)
}

/**
 * Dernier mois porteur de données réelles.
 *
 * Utilisé par le cumul à date : sans lui, « depuis le début de l'exercice »
 * inclurait des mois futurs à zéro et écraserait toutes les moyennes.
 */
export function lastRealisedMonthIndex(
  monthLabels: readonly string[],
  realisedUntil: string | null,
  monthlyValues?: readonly number[],
): number {
  if (realisedUntil) {
    const index = monthLabels.indexOf(realisedUntil)
    if (index >= 0) return index
  }

  if (monthlyValues) {
    for (let i = monthlyValues.length - 1; i >= 0; i--) {
      if (monthlyValues[i] !== 0) return i
    }
  }

  return clampMonthCount(monthLabels) - 1
}

function rangeLabel(monthLabels: readonly string[], months: number[]): string {
  if (months.length === 0) return '—'
  if (months.length === 1) return formatMonth(monthLabels[months[0]])

  const first = formatMonth(monthLabels[months[0]])
  const last = formatMonth(monthLabels[months[months.length - 1]])
  return `${first} – ${last}`
}

/** Année à deux chiffres extraite d'un libellé « janv-26 ». */
function yearSuffix(label: string | undefined): string {
  const parts = (label ?? '').split('-')
  return parts.length > 1 ? `20${parts[1]}` : ''
}

/**
 * Développe une sélection en indices de mois et libellés.
 *
 * @param monthLabels Libellés de mois de l'exercice, ex. `['janv-26', …]`.
 * @param realisedUntil Dernier mois marqué « RÉALISÉ » dans le budget.
 * @param referenceSeries Série mensuelle servant à détecter le dernier mois
 *   renseigné lorsque le budget ne porte pas de statut.
 */
export function resolvePeriod(
  selection: PeriodSelection,
  monthLabels: readonly string[],
  realisedUntil: string | null = null,
  referenceSeries?: readonly number[],
): ResolvedPeriod {
  const total = clampMonthCount(monthLabels)

  if (total === 0) {
    return {
      selection,
      months: [],
      label: '—',
      longLabel: '—',
      previousMonths: null,
      previousLabel: null,
    }
  }

  const all = Array.from({ length: total }, (_, i) => i)
  const year = yearSuffix(monthLabels[0])

  let months: number[]
  let label: string

  switch (selection.mode) {
    case 'ytd': {
      const last = lastRealisedMonthIndex(monthLabels, realisedUntil, referenceSeries)
      months = all.slice(0, Math.max(1, last + 1))
      label = `Cumul ${year}`
      break
    }

    case 'quarter': {
      const quarter = Math.min(Math.max(selection.index, 0), 3)
      months = all.slice(quarter * 3, quarter * 3 + 3)
      label = `T${quarter + 1} ${year}`
      break
    }

    case 'month': {
      const month = Math.min(Math.max(selection.index, 0), total - 1)
      months = [month]
      label = formatMonth(monthLabels[month])
      break
    }

    case 'year':
    default:
      months = all
      label = `Exercice ${year}`
      break
  }

  // Période précédente : même longueur, immédiatement avant. Refusée si elle
  // ne tient pas entièrement dans l'exercice.
  const start = months[0] ?? 0
  const length = months.length
  const previousStart = start - length

  const previousMonths =
    length > 0 && previousStart >= 0
      ? Array.from({ length }, (_, i) => previousStart + i)
      : null

  return {
    selection,
    months,
    label,
    longLabel: rangeLabel(monthLabels, months),
    previousMonths,
    previousLabel: previousMonths ? rangeLabel(monthLabels, previousMonths) : null,
  }
}

/** Somme d'une série mensuelle sur les indices d'une période. */
export function sumOverPeriod(
  monthly: readonly number[] | undefined,
  months: readonly number[],
): number {
  if (!monthly) return 0
  return months.reduce((total, index) => total + (monthly[index] ?? 0), 0)
}

/**
 * Somme en distinguant l'absence du zéro.
 *
 * Renvoie `null` si **aucun** mois de la période ne porte de valeur : c'est la
 * différence entre « la période a réalisé 0 € » et « la période n'est pas
 * encore saisie », que le tableau de bord ne doit jamais confondre.
 */
export function sumOrNull(
  monthly: readonly (number | null)[] | undefined,
  months: readonly number[],
): number | null {
  if (!monthly) return null

  let total = 0
  let seen = false

  for (const index of months) {
    const value = monthly[index]
    if (value === null || value === undefined) continue
    seen = true
    total += value
  }

  return seen ? total : null
}

/** Variation relative entre deux valeurs, `null` si non calculable. */
export function variation(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null
  if (previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

/** Options du sélecteur, construites à partir des mois disponibles. */
export function periodOptions(monthLabels: readonly string[]): {
  quarters: { index: number; label: string; available: boolean }[]
  months: { index: number; label: string }[]
} {
  const total = clampMonthCount(monthLabels)

  return {
    quarters: [0, 1, 2, 3].map((quarter) => ({
      index: quarter,
      label: `T${quarter + 1}`,
      available: quarter * 3 < total,
    })),
    months: monthLabels.map((label, index) => ({ index, label: formatMonth(label) })),
  }
}
