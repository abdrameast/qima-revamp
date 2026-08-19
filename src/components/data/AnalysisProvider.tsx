'use client'

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import {
  resolvePeriod,
  type ComparisonBasis,
  type PeriodSelection,
  type ResolvedPeriod,
} from '@/lib/period'
import {
  getServerSnapshot,
  getSnapshot,
  setComparison,
  setSelection,
  subscribe,
} from '@/lib/analysis-store'
import { caMensuel } from '@/lib/compute'
import { useData } from './DataProvider'

/**
 * Contexte d'analyse — période et base de comparaison, partagées par toutes
 * les pages.
 *
 * Monté dans le layout du tableau de bord : la sélection survit à la
 * navigation entre onglets, et se rejoue d'un rechargement à l'autre.
 *
 * L'état vit dans un magasin externe (`lib/analysis-store`) consommé par
 * `useSyncExternalStore`, ce qui évite à la fois l'écart d'hydratation et le
 * rendu en cascade qu'entraînerait une lecture différée par effet.
 */

export interface AnalysisContextValue {
  period: ResolvedPeriod
  selection: PeriodSelection
  setSelection: (selection: PeriodSelection) => void

  comparison: ComparisonBasis
  setComparison: (basis: ComparisonBasis) => void

  monthLabels: readonly string[]
  /** `true` si la comparaison demandée est effectivement calculable. */
  comparisonAvailable: boolean
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null)

export function useAnalysis(): AnalysisContextValue {
  const context = useContext(AnalysisContext)
  if (!context) {
    throw new Error("useAnalysis doit être utilisé à l'intérieur de <AnalysisProvider>")
  }
  return context
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const { data } = useData()
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const monthLabels = useMemo(() => data?.dataMensuelle.months ?? [], [data])

  const period = useMemo(
    () =>
      resolvePeriod(
        state.selection,
        monthLabels,
        data?.budget.realisedUntil ?? null,
        data ? caMensuel(data) : undefined,
      ),
    [state.selection, monthLabels, data],
  )

  const comparisonAvailable = useMemo(() => {
    if (state.comparison === 'none') return false
    if (state.comparison === 'previous') return period.previousMonths !== null
    return Object.keys(data?.budget.lines ?? {}).length > 0
  }, [state.comparison, period.previousMonths, data])

  const value = useMemo<AnalysisContextValue>(
    () => ({
      period,
      selection: state.selection,
      setSelection,
      comparison: state.comparison,
      setComparison,
      monthLabels,
      comparisonAvailable,
    }),
    [period, state.selection, state.comparison, monthLabels, comparisonAvailable],
  )

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>
}
