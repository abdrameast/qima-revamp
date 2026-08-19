'use client'

import { useMemo } from 'react'
import { useData } from '@/components/data/DataProvider'
import { useAnalysis } from '@/components/data/AnalysisProvider'
import { SyncStatus } from '@/components/data/SyncStatus'
import { DataErrorState, PageLoading } from '@/components/data/PageState'
import { ExportButton, PrintButton } from '@/components/data/ExportButton'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Metric } from '@/components/ui/Metric'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { TBody, TD, TEmpty, TH, THead, TR, TableFrame } from '@/components/ui/Table'
import { RevenueChart } from '@/components/charts/RevenueChart'
import {
  caBudgetOverPeriod,
  caOverPeriod,
  chargesOverPeriod,
  isChargeCategory,
  monthlySeries,
} from '@/lib/compute'
import { variation } from '@/lib/period'
import {
  MISSING,
  formatDateTime,
  formatEuro,
  formatEuroCompact,
  formatMonth,
  formatPercent,
} from '@/lib/format'
import type { BudgetLine } from '@/lib/data-types'
import { cn } from '@/lib/cn'

/**
 * Budget contre réalisé.
 *
 * Convention de signe retenue, reprise de l'existant : un écart **positif** sur
 * le chiffre d'affaires est favorable, un écart positif sur les charges est
 * défavorable. Le libellé l'indique explicitement à chaque fois, plutôt que de
 * laisser une couleur porter seule cette nuance.
 */

// ─── Regroupements de charges ───────────────────────────────────────────────

interface ChargeGroup {
  label: string
  matches: (category: string) => boolean
}

const CHARGE_GROUPS: ChargeGroup[] = [
  { label: 'Achats et coûts de production', matches: (k) => k.startsWith('COGS_') },
  {
    label: 'Marketing et acquisition',
    matches: (k) => k.startsWith('Pub_') || k.startsWith('Marketing_') || k.startsWith('Ads_'),
  },
  {
    label: 'Logistique et expédition',
    matches: (k) => k.startsWith('Logistique') || k === 'Transport_ventes',
  },
  {
    label: 'Frais fixes et structure',
    matches: (k) => k.startsWith('CF_') || k.startsWith('Frais_Fixes_'),
  },
  {
    label: 'Personnel et honoraires',
    matches: (k) => k.startsWith('RH_') || k.startsWith('Salaires_') || k.startsWith('Personnel_'),
  },
  {
    label: 'Recherche et développement',
    matches: (k) => k.startsWith('RD_') || k.startsWith('Innovation_') || k.startsWith('RnD_'),
  },
]

interface ChargeRow {
  label: string
  budget: number | null
  reel: number | null
  ecartEur: number | null
  ecartPct: number | null
}

/** Zéro traité comme « non renseigné » : un poste réellement à zéro n'existe pas ici. */
function zeroToNull(value: number): number | null {
  return value === 0 ? null : value
}

function sumOver(
  lines: Record<string, BudgetLine>,
  matches: (category: string) => boolean,
  months: readonly number[],
): number {
  return Object.entries(lines)
    .filter(([category]) => matches(category))
    .reduce(
      (total, [, line]) => total + months.reduce((sum, i) => sum + (line.monthly[i] ?? 0), 0),
      0,
    )
}

export default function BudgetPage() {
  const { data, loading, error, retry, syncedAt } = useData()
  const { period } = useAnalysis()

  const computed = useMemo(() => {
    if (!data) return null

    const months = period.months
    const hasBudget = Object.keys(data.budget.lines).length > 0

    const caReel = caOverPeriod(data, months)
    const caBudget = caBudgetOverPeriod(data, months)
    const chargesReel = chargesOverPeriod(data, months)

    // Même définition de « charge » que pour le réalisé : sans quoi le budget
    // et le réalisé porteraient sur des périmètres différents, et l'écart
    // n'aurait aucun sens.
    const chargesBudget = hasBudget
      ? zeroToNull(sumOver(data.budget.lines, isChargeCategory, months))
      : null

    const chargeRows: ChargeRow[] = CHARGE_GROUPS.map((group) => {
      const reel = zeroToNull(sumOver(data.dataMensuelle.lines, group.matches, months))
      const budget = hasBudget ? zeroToNull(sumOver(data.budget.lines, group.matches, months)) : null

      const ecartEur = reel !== null && budget !== null ? reel - budget : null
      const ecartPct = ecartEur !== null && budget !== null && budget !== 0 ? ecartEur / budget : null

      return { label: group.label, budget, reel, ecartEur, ecartPct }
    }).filter((row) => row.reel !== null || row.budget !== null)

    const resultatReel =
      caReel !== null && chargesReel !== null ? caReel - chargesReel : null
    const resultatBudget =
      caBudget !== null && chargesBudget !== null ? caBudget - chargesBudget : null

    return {
      hasBudget,
      caReel,
      caBudget,
      caEcart: caReel !== null && caBudget !== null ? caReel - caBudget : null,
      caEcartPct: variation(caReel, caBudget),
      chargesReel,
      chargesBudget,
      chargesEcart: chargesReel !== null && chargesBudget !== null ? chargesReel - chargesBudget : null,
      chargesEcartPct: variation(chargesReel, chargesBudget),
      resultatReel,
      resultatBudget,
      chargeRows,
      series: monthlySeries(data, months),
      realisedUntil: data.budget.realisedUntil,
    }
  }, [data, period])

  if (loading) return <PageLoading metrics={4} cards={2} />
  if (error) return <DataErrorState error={error} onRetry={retry} />
  if (!data || !computed) return null

  const {
    hasBudget,
    caReel,
    caBudget,
    caEcart,
    caEcartPct,
    chargesReel,
    chargesBudget,
    chargesEcart,
    chargesEcartPct,
    resultatReel,
    resultatBudget,
    chargeRows,
    series,
    realisedUntil,
  } = computed

  const arrete = realisedUntil ? formatMonth(realisedUntil) : null
  const hasSeries = series.some((point) => point.reel !== null)

  return (
    <>
      <PageHeader
        label="Pilotage budgétaire"
        title="Budget vs Réel"
        description={`Écarts entre prévisionnel et réalisé sur ${period.longLabel}.`}
        actions={
          <>
            <ExportButton
              rows={chargeRows}
              columns={[
                { header: 'Poste de charges', value: (r) => r.label },
                { header: 'Budget (€)', value: (r) => r.budget },
                { header: 'Réalisé (€)', value: (r) => r.reel },
                { header: 'Écart (€)', value: (r) => r.ecartEur },
                { header: 'Écart (%)', value: (r) => (r.ecartPct !== null ? r.ecartPct * 100 : null) },
              ]}
              metadata={{
                title: 'Budget vs réel — charges',
                period: period.longLabel,
                filters: arrete ? `Dernier arrêté comptable : ${arrete}` : 'Aucun arrêté déclaré',
                syncedAt: formatDateTime(syncedAt),
              }}
            />
            <PrintButton />
          </>
        }
        meta={<SyncStatus />}
      />

      {!hasBudget && (
        <Card className="mb-4">
          <EmptyState
            variant="pending"
            title="Aucune ligne budgétaire renseignée"
            description="L'onglet BUDGET_12M du classeur de pilotage est vide. Les écarts ne peuvent pas être calculés ; seul le réalisé est affiché."
          />
        </Card>
      )}

      {/* ── Synthèse ─────────────────────────────────────────────────────── */}
      <section aria-label="Synthèse budgétaire" className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="CA réalisé"
          value={formatEuro(caReel)}
          tone="gold"
          unavailable={caReel === null}
          unavailableReason="Aucune écriture sur la période"
          trend={caEcartPct !== null ? formatPercent(caEcartPct, { isRatio: true }) : undefined}
          trendDirection={caEcartPct === null ? 'flat' : caEcartPct >= 0 ? 'up' : 'down'}
          trendCaption={caEcartPct !== null ? 'vs budget' : undefined}
          source={arrete ? `Dernier arrêté : ${arrete}` : 'Aucun arrêté déclaré'}
        />

        <Metric
          label="Écart de CA"
          value={caEcart !== null ? `${caEcart >= 0 ? '+' : ''}${formatEuroCompact(caEcart)}` : MISSING}
          tone={caEcart === null ? 'neutral' : caEcart >= 0 ? 'positive' : 'critical'}
          unavailable={caEcart === null}
          unavailableReason={hasBudget ? 'Budget non renseigné sur la période' : 'Aucun budget saisi'}
          hint={caEcart !== null ? (caEcart >= 0 ? 'Favorable' : 'Défavorable') : undefined}
          source={caBudget !== null ? `Budget : ${formatEuro(caBudget)}` : undefined}
        />

        <Metric
          label="Charges réalisées"
          value={formatEuro(chargesReel)}
          tone={chargesEcart !== null && chargesEcart > 0 ? 'caution' : 'neutral'}
          unavailable={chargesReel === null}
          unavailableReason="Aucune charge enregistrée sur la période"
          trend={
            chargesEcartPct !== null ? formatPercent(chargesEcartPct, { isRatio: true }) : undefined
          }
          // Le glyphe suit le nombre, la couleur suit le sens : sur les charges,
          // une baisse (▼) est une bonne nouvelle.
          trendDirection={chargesEcartPct === null ? 'flat' : chargesEcartPct > 0 ? 'up' : 'down'}
          trendSentiment={chargesEcartPct === null ? 'neutral' : chargesEcartPct > 0 ? 'bad' : 'good'}
          trendCaption={chargesEcartPct !== null ? 'vs budget' : undefined}
          source={
            chargesBudget !== null ? `Budget : ${formatEuro(chargesBudget)}` : 'Toutes charges confondues'
          }
        />

        <Metric
          label="Résultat estimé"
          value={formatEuroCompact(resultatReel)}
          tone={resultatReel === null ? 'neutral' : resultatReel >= 0 ? 'positive' : 'critical'}
          unavailable={resultatReel === null}
          unavailableReason="Nécessite un CA et des charges renseignés"
          source={
            resultatBudget !== null ? `Budget : ${formatEuro(resultatBudget)}` : 'CA moins charges'
          }
        />
      </section>

      {/* ── Courbe ───────────────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionHeading
          label="Évolution"
          title="Chiffre d'affaires prévisionnel et réalisé"
          description="Le trait plein est le constaté, le pointillé le budgété."
        />
        <Card>
          {hasSeries ? (
            <RevenueChart points={series} showBudget={hasBudget} />
          ) : (
            <EmptyState
              variant="pending"
              title="Aucune écriture sur la période"
              description="La courbe du réalisé s'affichera après import du grand livre comptable pour ces mois."
            />
          )}
        </Card>
      </section>

      {/* ── Table des charges ────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionHeading
          label="Détail"
          title="Charges par poste"
          description={
            arrete
              ? `Cumul sur ${period.longLabel} · dernier arrêté comptable ${arrete}`
              : `Cumul sur ${period.longLabel}`
          }
          actions={
            arrete ? (
              <Badge tone="gold" surface="dark" srPrefix="Arrêté comptable : ">
                Arrêté {arrete}
              </Badge>
            ) : (
              <Badge tone="neutral" surface="dark">
                En attente du grand livre
              </Badge>
            )
          }
        />

        <Card flush>
          <div className="px-4 py-3">
            <TableFrame caption="Charges budgétées et réalisées par poste">
              <THead>
                <TR>
                  <TH sticky>Poste de charges</TH>
                  <TH numeric>Budget</TH>
                  <TH numeric>Réalisé</TH>
                  <TH numeric>Écart</TH>
                  <TH numeric>Écart %</TH>
                </TR>
              </THead>

              <TBody>
                {chargeRows.length === 0 ? (
                  <TEmpty colSpan={5}>
                    <EmptyState
                      variant="pending"
                      title="Aucun poste de charges"
                      description="Ni le budget ni le journal ne comportent de charges sur cette période."
                    />
                  </TEmpty>
                ) : (
                  <>
                    {chargeRows.map((row) => (
                      <TR key={row.label}>
                        <TD sticky className="font-medium">
                          {row.label}
                        </TD>
                        <TD numeric className="text-ink-muted">
                          {row.budget !== null ? formatEuro(row.budget) : MISSING}
                        </TD>
                        <TD numeric className="font-semibold">
                          {row.reel !== null ? formatEuro(row.reel) : MISSING}
                        </TD>
                        <TD numeric>
                          <EcartValue value={row.ecartEur} format={(v) => formatEuro(v)} />
                        </TD>
                        <TD numeric>
                          <EcartValue
                            value={row.ecartPct}
                            format={(v) => formatPercent(v, { isRatio: true, decimals: 0 })}
                          />
                        </TD>
                      </TR>
                    ))}

                    <TR emphasis>
                      <TD sticky>Total des charges</TD>
                      <TD numeric>{chargesBudget !== null ? formatEuro(chargesBudget) : MISSING}</TD>
                      <TD numeric>{chargesReel !== null ? formatEuro(chargesReel) : MISSING}</TD>
                      <TD numeric>
                        <EcartValue value={chargesEcart} format={(v) => formatEuro(v)} />
                      </TD>
                      <TD numeric>
                        <EcartValue
                          value={chargesEcartPct}
                          format={(v) => formatPercent(v, { isRatio: true, decimals: 0 })}
                        />
                      </TD>
                    </TR>
                  </>
                )}
              </TBody>
            </TableFrame>
          </div>

          <footer className="border-t border-rule bg-white/[0.05] px-5 py-3">
            <p className="text-[11px] text-ink-faint">
              Sur les charges, un écart positif signifie une dépense supérieure au budget, donc
              défavorable. La convention est inverse de celle du chiffre d&apos;affaires.
            </p>
          </footer>
        </Card>
      </section>
    </>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

/** Écart sur charges : positif = dépassement = défavorable. */
function EcartValue({
  value,
  format,
}: {
  value: number | null
  format: (value: number) => string
}) {
  if (value === null) return <span className="text-ink-faint">{MISSING}</span>

  const over = value > 0
  return (
    <span className={cn('font-semibold', over ? 'text-critical-ink' : 'text-positive-ink')}>
      <span className="sr-only">{over ? 'Dépassement de ' : 'Économie de '}</span>
      {over ? '+' : ''}
      {format(value)}
    </span>
  )
}
