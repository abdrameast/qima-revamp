'use client'

import { useMemo } from 'react'
import { useData } from '@/components/data/DataProvider'
import { useAnalysis } from '@/components/data/AnalysisProvider'
import { SyncStatus } from '@/components/data/SyncStatus'
import { DataErrorState, PageLoading } from '@/components/data/PageState'
import { ExportButton } from '@/components/data/ExportButton'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Metric } from '@/components/ui/Metric'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Alert } from '@/components/ui/Alert'
import { TBody, TD, TEmpty, TH, THead, TR, TableFrame } from '@/components/ui/Table'
import { shopifyKpis, topSkusByCA } from '@/lib/compute'
import { formatDateTime, formatEuro, formatMultiple, formatNumber, formatPercent, margeSignal } from '@/lib/format'
import { cn } from '@/lib/cn'

const TT_REACHAT =
  'Part des commandes passées par des clients ayant déjà acheté. Un e-commerce sain se situe généralement entre 25 et 35 %. En dessous, la croissance repose entièrement sur l’acquisition payante.'
const TT_LTV_CAC =
  'Valeur générée par un client sur 90 jours rapportée à son coût d’acquisition complet. Le repère e-commerce est de ×3. En dessous de ×1, chaque acquisition détruit de la valeur.'
const TT_AOV = 'Panier moyen constaté sur la période de saisie du classeur KPI.'

export default function ShopifyPage() {
  const { data, loading, error, retry, syncedAt } = useData()
  const { period } = useAnalysis()

  const computed = useMemo(() => {
    if (!data) return null
    return {
      kpis: shopifyKpis(data),
      topSkus: topSkusByCA(data, 8),
      panier: data.canauxParams.panierMoyen,
      params: data.paramsManuels,
      calculs: data.calculsAuto,
    }
  }, [data])

  if (loading) return <PageLoading metrics={4} cards={2} />
  if (error) return <DataErrorState error={error} onRetry={retry} />
  if (!data || !computed) return null

  const { kpis, topSkus, panier, params, calculs } = computed

  // Le classeur KPI porte sa propre période de saisie, distincte du sélecteur
  // global : la confondre ferait lire des chiffres mensuels comme annuels.
  const kpiPeriode =
    params.periode.mois > 0 && params.periode.annee > 0
      ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
          new Date(params.periode.annee, params.periode.mois - 1, 1),
        )
      : null

  const hasKpi = data.meta.hasKpiData

  return (
    <>
      <PageHeader
        label="DTC Shopify"
        title="Performance client"
        description="Rétention, valeur client et contribution des références au chiffre d'affaires."
        actions={
          <ExportButton
            rows={topSkus}
            columns={[
              { header: 'Produit', value: (s) => s.produit },
              { header: 'CA HT (€)', value: (s) => s.caHT },
              { header: 'Marge variable (%)', value: (s) => (s.margePct !== null ? s.margePct * 100 : null) },
              { header: 'Statut', value: (s) => (s.coutsIncomplets ? 'Coûts incomplets' : 'Coûts complets') },
            ]}
            metadata={{
              title: 'Top références Shopify',
              period: period.longLabel,
              syncedAt: formatDateTime(syncedAt),
            }}
          />
        }
        meta={<SyncStatus />}
      />

      {!hasKpi && (
        <Alert tone="caution" title="Saisie KPI DTC non renseignée" className="mb-4">
          Le classeur <strong>Honeylang_KPI_DTC_v1.xlsx</strong> ne contient pas encore de valeurs
          pour la période analysée. Les indicateurs clients restent vides plutôt que d&apos;afficher
          des zéros, qui se liraient comme des résultats réels.
        </Alert>
      )}

      {/* ── Indicateurs clients ──────────────────────────────────────────── */}
      <section aria-label="Indicateurs clients" className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Taux de réachat"
          value={formatPercent(kpis.tauxReachat, { isRatio: true })}
          tone={
            kpis.tauxReachat === null ? 'neutral' : kpis.tauxReachat >= 0.25 ? 'positive' : 'caution'
          }
          tooltip={TT_REACHAT}
          unavailable={kpis.tauxReachat === null}
          unavailableReason="Nécessite le nombre de commandes et de nouveaux clients"
          hint="Repère 25–35 %"
          source={kpiPeriode ? `Saisie ${kpiPeriode}` : 'Source : PARAMS_MANUELS'}
        />

        <Metric
          label="Panier moyen (AOV)"
          value={formatEuro(calculs.aov > 0 ? calculs.aov : null, 2)}
          tone="gold"
          tooltip={TT_AOV}
          unavailable={calculs.aov === 0}
          unavailableReason="Non calculé dans le classeur KPI"
          source="Source : CALCULS_AUTO"
        />

        <Metric
          label="Coût d'acquisition"
          value={formatEuro(kpis.cac, 2)}
          tone="neutral"
          unavailable={kpis.cac === null}
          unavailableReason="CAC non renseigné dans le classeur KPI"
          hint="Fully loaded"
          source="Source : CALCULS_AUTO"
        />

        <Metric
          label="LTV / CAC"
          value={formatMultiple(kpis.ltvCacRatio)}
          tone={
            kpis.ltvCacRatio === null
              ? 'neutral'
              : kpis.ltvCacRatio >= 3
                ? 'positive'
                : kpis.ltvCacRatio >= 1
                  ? 'caution'
                  : 'critical'
          }
          tooltip={TT_LTV_CAC}
          unavailable={kpis.ltvCacRatio === null}
          unavailableReason="Nécessite un CAC et une LTV renseignés"
          hint="Repère ×3–5"
          source="Day 90 Contribution Profit LTV"
        />
      </section>

      {/* ── Répartition clients ──────────────────────────────────────────── */}
      <section className="stagger mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          tone="glass"
          label="Acquisition"
          title="Nouveaux clients et clients fidèles"
          caption={kpiPeriode ? `Commandes Shopify · ${kpiPeriode}` : 'Commandes Shopify'}
        >
          {kpis.nbNouveaux !== null && kpis.nbFideles !== null ? (
            <>
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="section-label text-ink-faint">Nouveaux</p>
                  <p className="tabular mt-1 text-3xl font-medium text-ink">
                    {formatNumber(kpis.nbNouveaux)}
                  </p>
                </div>
                <div>
                  <p className="section-label text-ink-faint">Fidèles</p>
                  <p className="tabular mt-1 text-3xl font-medium text-gold">
                    {formatNumber(kpis.nbFideles)}
                  </p>
                </div>
              </div>

              <ClientSplitBar
                nouveaux={kpis.nbNouveaux}
                fideles={kpis.nbFideles}
                className="mt-5"
              />
            </>
          ) : (
            <EmptyState
              variant="pending"
              title="Répartition non disponible"
              description="Renseigner « Nb commandes Shopify » et « Nb nouveaux clients » dans l’onglet PARAMS_MANUELS."
            />
          )}
        </Card>

        <Card
          tone="glass"
          label="Valeur client"
          title="Valeur générée à 90 jours"
          caption="Brute et après coûts variables"
        >
          <dl className="space-y-3 text-[13px]">
            <ValueRow
              label="LTV brute à 90 jours"
              value={formatEuro(kpis.ltvJour90, 2)}
              hint="Revenu généré par client, hors coûts"
            />
            <ValueRow
              label="LTV de contribution à 90 jours"
              value={formatEuro(
                calculs.day90ContributionLtv > 0 ? calculs.day90ContributionLtv : null,
                2,
              )}
              hint="Après coûts variables — c'est cette valeur qui se compare au CAC"
            />
            <ValueRow
              label="Coût d'acquisition"
              value={formatEuro(kpis.cac, 2)}
              hint="Dépense média et frais rapportés au nouveau client"
            />
            <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-3">
              <dt className="text-xs font-semibold text-ink">Ratio LTV / CAC</dt>
              <dd className="tabular text-sm font-semibold text-ink">
                {formatMultiple(kpis.ltvCacRatio)}
              </dd>
            </div>
          </dl>

          {kpis.ltvCacRatio !== null && kpis.ltvCacRatio < 3 && (
            <p className="mt-3 rounded-md bg-caution-soft px-3 py-2 text-[11px] leading-relaxed text-caution-ink">
              Le ratio est sous le repère de ×3. Signal calculé, pas un avis financier : la règle et
              sa source sont détaillées dans les points d&apos;attention de la vue d&apos;ensemble.
            </p>
          )}
        </Card>
      </section>

      {/* ── Top références ───────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionHeading
          label="Catalogue"
          title="Références les plus contributives"
          description="Classement par chiffre d'affaires HT, issu des fiches de coût de revient complet."
        />

        <Card flush>
          <div className="px-4 py-3">
            <TableFrame caption="Références classées par chiffre d'affaires">
              <THead>
                <TR>
                  <TH width="36px">#</TH>
                  <TH sticky>Produit</TH>
                  <TH numeric>CA HT</TH>
                  <TH numeric>Marge variable</TH>
                </TR>
              </THead>
              <TBody>
                {topSkus.length === 0 ? (
                  <TEmpty colSpan={4}>
                    <EmptyState
                      variant="pending"
                      title="Aucune fiche produit"
                      description="Le classeur CRC ne contient pas encore de référence exploitable."
                    />
                  </TEmpty>
                ) : (
                  topSkus.map((sku, index) => (
                    <TR key={sku.produit} dimmed={sku.coutsIncomplets}>
                      <TD className="text-ink-faint">{index + 1}</TD>
                      <TD sticky className="max-w-[260px] font-medium">
                        <span className="block truncate" title={sku.produit}>
                          {sku.produit}
                        </span>
                      </TD>
                      <TD numeric className="font-semibold">
                        {formatEuro(sku.caHT)}
                      </TD>
                      <TD numeric>
                        {sku.coutsIncomplets || sku.margePct === null ? (
                          <Badge tone="caution" srPrefix="Statut : ">
                            Coûts incomplets
                          </Badge>
                        ) : (
                          <MargeBadge value={sku.margePct} />
                        )}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </TableFrame>
          </div>
        </Card>
      </section>

      {/* ── Panier moyen par canal ───────────────────────────────────────── */}
      <section className="mt-6">
        <SectionHeading
          label="Comparaison"
          title="Panier moyen par canal"
          description="Valeurs de référence paramétrées dans l'onglet CANAUX_PARAMS."
        />
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label="DTC Shopify" value={formatEuro(panier.dtc, 2)} tone="gold" unavailable={panier.dtc === null} />
          <Metric label="TikTok Shop" value={formatEuro(panier.tiktok, 2)} tone="neutral" unavailable={panier.tiktok === null} />
          <Metric label="Pharmacie" value={formatEuro(panier.pharmacie, 2)} tone="neutral" unavailable={panier.pharmacie === null} />
        </div>
      </section>
    </>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function MargeBadge({ value }: { value: number }) {
  const signal = margeSignal(value, true)
  const tone = signal === 'green' ? 'positive' : signal === 'amber' ? 'caution' : 'critical'
  return (
    <Badge tone={tone} srPrefix="Marge : ">
      {formatPercent(value, { isRatio: true, decimals: 0 })}
    </Badge>
  )
}

function ClientSplitBar({
  nouveaux,
  fideles,
  className,
}: {
  nouveaux: number
  fideles: number
  className?: string
}) {
  const total = nouveaux + fideles
  if (total === 0) return null

  const newShare = (nouveaux / total) * 100

  return (
    <div className={className}>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-white/[0.12]"
        role="img"
        aria-label={`${formatNumber(nouveaux)} nouveaux clients et ${formatNumber(fideles)} clients fidèles`}
      >
        <div className="h-full bg-ink-muted" style={{ width: `${newShare}%` }} />
        <div className="h-full bg-gold-deep" style={{ width: `${100 - newShare}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2 rounded-full bg-ink-muted" />
          Nouveaux · {formatPercent(newShare, { decimals: 0 })}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2 rounded-full bg-gold-deep" />
          Fidèles · {formatPercent(100 - newShare, { decimals: 0 })}
        </span>
      </div>
    </div>
  )
}

function ValueRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="min-w-0">
        <span className="block text-ink-muted">{label}</span>
        <span className={cn('mt-0.5 block text-[10px] leading-snug text-ink-faint')}>{hint}</span>
      </dt>
      <dd className="tabular shrink-0 font-medium text-ink">{value}</dd>
    </div>
  )
}
