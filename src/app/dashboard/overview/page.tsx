'use client'

import { useMemo } from 'react'
import { useData } from '@/components/data/DataProvider'
import { useAnalysis } from '@/components/data/AnalysisProvider'
import { SyncStatus } from '@/components/data/SyncStatus'
import { AlertCenter } from '@/components/data/AlertCenter'
import { DataErrorState, PageLoading } from '@/components/data/PageState'
import { PrintButton } from '@/components/data/ExportButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Metric } from '@/components/ui/Metric'
import { EmptyState } from '@/components/ui/EmptyState'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { evaluateAlerts } from '@/lib/alerts'
import {
  bfrSnapshot,
  caBudgetOverPeriod,
  caOverPeriod,
  margeBruteOverPeriod,
  monthlySeries,
  tresorerieFinDePeriode,
} from '@/lib/compute'
import { variation } from '@/lib/period'
import { formatDelta, formatEuro, formatJours, formatPercent } from '@/lib/format'

const TT_CA =
  "Chiffre d'affaires encaissé sur la période sélectionnée, tous canaux confondus, net des remises accordées."
const TT_MARGE =
  "Ce qui reste après paiement des coûts de production. La cosmétique premium se situe généralement entre 60 et 72 %. En dessous, ce sont les prix ou les coûts de fabrication qui méritent un réexamen."
const TT_TRESO =
  'Solde disponible à la fin de la période. Le seuil de sécurité correspond à la réserve minimale pour absorber un mois de charges fixes.'
const TT_BFR =
  "Argent avancé avant d'encaisser les ventes : stock et créances clients, diminués des dettes fournisseurs. Plus il est élevé, plus il faut de trésorerie pour fonctionner."

export default function OverviewPage() {
  const { data, loading, error, retry } = useData()
  const { period, comparison, comparisonAvailable } = useAnalysis()

  const computed = useMemo(() => {
    if (!data) return null

    const ca = caOverPeriod(data, period.months)
    const marge = margeBruteOverPeriod(data, period.months)
    const treso = tresorerieFinDePeriode(data, period.months)
    const bfr = bfrSnapshot(data)

    // Base de comparaison : période précédente de même longueur, ou budget.
    const caPrevious =
      comparison === 'previous' && period.previousMonths
        ? caOverPeriod(data, period.previousMonths)
        : comparison === 'budget'
          ? caBudgetOverPeriod(data, period.months)
          : null

    const margePrevious =
      comparison === 'previous' && period.previousMonths
        ? margeBruteOverPeriod(data, period.previousMonths).pct
        : null

    return {
      ca,
      marge,
      treso,
      bfr,
      caDelta: variation(ca, caPrevious),
      margeDelta: variation(marge.pct, margePrevious),
      series: monthlySeries(data, period.months),
      alerts: evaluateAlerts(data),
      seuil: data.canauxParams.seuilSecuriteTreso,
      stock: data.stockRotation.at(-1) ?? null,
    }
  }, [data, period, comparison])

  if (loading) return <PageLoading metrics={4} cards={2} />
  if (error) return <DataErrorState error={error} onRetry={retry} />
  if (!data || !computed) return null

  const { ca, marge, treso, bfr, caDelta, margeDelta, series, alerts, seuil, stock } = computed

  const comparisonLabel =
    comparison === 'budget'
      ? 'vs budget'
      : period.previousLabel
        ? `vs ${period.previousLabel}`
        : null

  const margeUnderBenchmark = marge.pct !== null && marge.pct < 0.6
  const tresoUnderSeuil = treso !== null && treso < seuil
  const hasSeries = series.some((point) => point.reel !== null)

  return (
    <>
      <PageHeader
        label="Synthèse"
        title="Vue d'ensemble"
        description={`Chiffres consolidés sur ${period.longLabel}.`}
        actions={<PrintButton label="Synthèse PDF" />}
        meta={<SyncStatus />}
      />

      {/* ── Indicateurs principaux ───────────────────────────────────────── */}
      <section aria-label="Indicateurs clés" className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Chiffre d'affaires"
          value={formatEuro(ca)}
          tone="gold"
          tooltip={TT_CA}
          unavailable={ca === null}
          unavailableReason="Aucune écriture comptable sur cette période"
          trend={caDelta !== null ? formatDelta(caDelta, { isRatio: true }) : undefined}
          trendDirection={caDelta === null ? 'flat' : caDelta >= 0 ? 'up' : 'down'}
          trendCaption={caDelta !== null ? comparisonLabel : undefined}
          hint={
            caDelta === null && comparison !== 'none' && !comparisonAvailable
              ? 'Comparaison indisponible'
              : undefined
          }
          source={`Source : ${period.label} · journal mensuel`}
          href="/dashboard/canaux"
        />

        <Metric
          label="Marge brute"
          value={formatPercent(marge.pct, { isRatio: true })}
          tone={margeUnderBenchmark ? 'caution' : 'positive'}
          tooltip={TT_MARGE}
          unavailable={marge.pct === null}
          unavailableReason="Marge non calculable sans chiffre d'affaires"
          trend={margeDelta !== null ? formatDelta(margeDelta, { isRatio: true }) : undefined}
          trendDirection={
            margeDelta === null ? 'flat' : margeDelta >= 0 ? 'up' : 'down'
          }
          trendCaption={margeDelta !== null ? comparisonLabel : undefined}
          hint="Repère 60–72 %"
          source={marge.eur !== null ? `Soit ${formatEuro(marge.eur)} de marge` : undefined}
          href="/dashboard/produits"
        />

        <Metric
          label="Trésorerie"
          value={formatEuro(treso)}
          tone={tresoUnderSeuil ? 'critical' : 'gold'}
          tooltip={TT_TRESO}
          unavailable={treso === null}
          unavailableReason="Aucun solde de trésorerie sur cette période"
          trend={tresoUnderSeuil ? 'Sous le seuil' : undefined}
          trendDirection="flat"
          trendSentiment="warn"
          hint={`Seuil de sécurité ${formatEuro(seuil)}`}
          source="Source : poste de bilan Trésorerie"
          href="/dashboard/tresorerie"
        />

        <Metric
          label="Besoin en fonds de roulement"
          value={formatEuro(bfr.total)}
          tone="neutral"
          tooltip={TT_BFR}
          unavailable={bfr.total === null}
          unavailableReason="Onglet BFR non renseigné"
          hint={bfr.bfrJoursCA !== null ? `${formatJours(bfr.bfrJoursCA)} de CA` : undefined}
          source="Source : onglet BFR · mois courant"
          href="/dashboard/tresorerie"
        />
      </section>

      {/* ── Évolution ────────────────────────────────────────────────────── */}
      <section className="mt-4">
        <Card
          tone="glass"
          label="Évolution"
          title="Chiffre d'affaires mensuel"
          caption={`${period.longLabel} · réalisé et prévisionnel budgété`}
        >
          {hasSeries ? (
            <RevenueChart points={series} />
          ) : (
            <EmptyState
              variant="pending"
              title="Aucune écriture sur la période"
              description="La courbe s'affichera dès les premières écritures du journal comptable pour ces mois. Aucune valeur n'est extrapolée."
            />
          )}
        </Card>
      </section>

      {/* ── Aide à la décision et détail du BFR ──────────────────────────── */}
      <section className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <AlertCenter alerts={alerts} limit={4} className="lg:col-span-2" />

        <div className="space-y-3">
          <Card label="Structure" title="Détail du BFR" tooltip={TT_BFR}>
            <dl className="space-y-2 text-[13px]">
              <Row label="Stock valorisé" value={formatEuro(bfr.stock)} />
              <Row label="+ Créances clients" value={formatEuro(bfr.creances)} />
              <Row label="− Dettes fournisseurs" value={formatEuro(bfr.dettes)} />
              <div className="flex items-baseline justify-between border-t border-rule pt-2">
                <dt className="text-xs font-semibold text-ink">= BFR total</dt>
                <dd className="tabular text-sm font-semibold text-ink">{formatEuro(bfr.total)}</dd>
              </div>
            </dl>
            {bfr.bfrJoursCA !== null && (
              <p className="mt-3 text-[11px] text-ink-faint">
                {`Soit ${formatJours(bfr.bfrJoursCA)} de chiffre d'affaires immobilisés.`}
              </p>
            )}
          </Card>

          <Card
            tone="glass"
            label="Stocks"
            title="Rotation"
            caption={stock ? `Dernier arrêté : ${stock.trimestre}` : undefined}
          >
            {stock ? (
              <dl className="space-y-2 text-[13px]">
                <Row label="Stock actif" value={formatEuro(stock.stockActif)} />
                <Row label="Stock lent" value={formatEuro(stock.stockLent)} />
                <Row label="Stock dormant" value={formatEuro(stock.stockDormant)} />
                <div className="flex items-baseline justify-between border-t border-rule pt-2">
                  <dt className="text-xs font-semibold text-ink">Total</dt>
                  <dd className="tabular text-sm font-semibold text-ink">
                    {formatEuro(stock.totalStock)}
                  </dd>
                </div>
              </dl>
            ) : (
              <EmptyState
                variant="pending"
                title="Aucune cohorte saisie"
                description="À renseigner au prochain arrêté trimestriel, onglet STOCK_ROTATION."
              />
            )}
          </Card>
        </div>
      </section>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular font-medium text-ink">{value}</dd>
    </div>
  )
}
