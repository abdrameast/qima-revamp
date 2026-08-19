'use client'

import { useMemo, useState } from 'react'
import { useData } from '@/components/data/DataProvider'
import { useAnalysis } from '@/components/data/AnalysisProvider'
import { SyncStatus } from '@/components/data/SyncStatus'
import { DataErrorState, PageLoading } from '@/components/data/PageState'
import { ExportButton } from '@/components/data/ExportButton'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Metric } from '@/components/ui/Metric'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { TBody, TD, TEmpty, TH, THead, TR, TableFrame } from '@/components/ui/Table'
import { produitsKpis } from '@/lib/compute'
import { formatDateTime, formatEuro, formatEuroCompact, formatPercent, margeSignal } from '@/lib/format'
import type { FicheCRC } from '@/lib/data-types'
import { cn } from '@/lib/cn'

// ─── Modèle ─────────────────────────────────────────────────────────────────

type FilterKey = 'tous' | 'ok' | 'limite' | 'fragile' | 'incomplet'
type SortKey = 'produit' | 'volume' | 'ca' | 'crc' | 'margeVar' | 'margeNette'
type ViewMode = 'catalogue' | 'pareto'

/** Correspondance des libellés de benchmark portés par le classeur CRC. */
const BENCHMARK_MAP: Record<string, { label: string; filter: FilterKey }> = {
  '✅ OK': { label: 'OK', filter: 'ok' },
  '⚠️ Limite': { label: 'Limite', filter: 'limite' },
  '🔴 Fragile': { label: 'Fragile', filter: 'fragile' },
}

interface SkuRow extends FicheCRC {
  caHT: number
}

interface ParetoRow extends SkuRow {
  partCA: number
  cumulPct: number
  barWidth: number
}

const VIEW_OPTIONS = [
  { value: 'catalogue' as const, label: 'Catalogue' },
  { value: 'pareto' as const, label: 'Concentration 80/20' },
]

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ProduitsPage() {
  const { data, loading, error, retry, syncedAt } = useData()
  const { period } = useAnalysis()

  const [view, setView] = useState<ViewMode>('catalogue')
  const [filter, setFilter] = useState<FilterKey>('tous')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'margeVar',
    direction: 'desc',
  })

  const skus = useMemo<SkuRow[]>(
    () =>
      (data?.fichesCRC ?? []).map((sku) => ({
        ...sku,
        caHT: sku.pvHt * sku.volumeVendu,
      })),
    [data],
  )

  // Filtrage : benchmark + recherche textuelle
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return skus.filter((sku) => {
      if (needle && !sku.produit.toLowerCase().includes(needle)) return false
      if (filter === 'tous') return true
      if (filter === 'incomplet') return sku.coutsIncomplets
      return BENCHMARK_MAP[sku.benchmark]?.filter === filter && !sku.coutsIncomplets
    })
  }, [skus, filter, search])

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1

    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'produit':
          return a.produit.localeCompare(b.produit, 'fr') * factor
        case 'volume':
          return (a.volumeVendu - b.volumeVendu) * factor
        case 'ca':
          return (a.caHT - b.caHT) * factor
        case 'crc':
          return (a.crcTotal - b.crcTotal) * factor
        case 'margeNette':
          return (a.margeNettePct - b.margeNettePct) * factor
        case 'margeVar':
        default:
          return (a.margeVariablePct - b.margeVariablePct) * factor
      }
    })
  }, [filtered, sort])

  // Pareto : toujours calculé sur le catalogue complet, indépendamment des filtres.
  const pareto = useMemo(() => {
    const ranked = [...skus].sort((a, b) => b.caHT - a.caHT)
    const totalCA = ranked.reduce((sum, sku) => sum + sku.caHT, 0)
    const maxCA = ranked[0]?.caHT ?? 1

    const rows: ParetoRow[] = []
    let cumul = 0
    let thresholdIndex = -1

    // Boucle explicite plutôt qu'un `map` avec accumulateur : le cumul est un
    // état séquentiel, et le muter depuis un callback de rendu est fragile.
    for (let i = 0; i < ranked.length; i++) {
      const sku = ranked[i]
      const partCA = totalCA > 0 ? sku.caHT / totalCA : 0
      cumul += partCA
      if (thresholdIndex === -1 && cumul >= 0.8) thresholdIndex = i

      rows.push({
        ...sku,
        partCA,
        cumulPct: cumul,
        barWidth: maxCA > 0 ? (sku.caHT / maxCA) * 100 : 0,
      })
    }

    return {
      rows,
      totalCA,
      thresholdIndex,
      countTo80: thresholdIndex >= 0 ? thresholdIndex + 1 : rows.length,
      leaders: rows.slice(0, 2).map((row) => row.produit),
    }
  }, [skus])

  if (loading) return <PageLoading metrics={4} cards={2} />
  if (error) return <DataErrorState error={error} onRetry={retry} />
  if (!data) return null

  const kpis = produitsKpis(data)
  const filtersActive = filter !== 'tous' || search.trim() !== ''

  const filterOptions = [
    { value: 'tous' as const, label: 'Tous', count: skus.length },
    {
      value: 'ok' as const,
      label: 'OK',
      count: skus.filter((s) => !s.coutsIncomplets && BENCHMARK_MAP[s.benchmark]?.filter === 'ok').length,
    },
    {
      value: 'limite' as const,
      label: 'Limite',
      count: skus.filter((s) => !s.coutsIncomplets && BENCHMARK_MAP[s.benchmark]?.filter === 'limite').length,
    },
    {
      value: 'fragile' as const,
      label: 'Fragile',
      count: skus.filter((s) => !s.coutsIncomplets && BENCHMARK_MAP[s.benchmark]?.filter === 'fragile').length,
    },
    { value: 'incomplet' as const, label: 'Coûts incomplets', count: kpis.nbIncomplets },
  ]

  function toggleSort(key: SortKey): void {
    setSort((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: key === 'produit' ? 'asc' : 'desc' },
    )
  }

  function resetFilters(): void {
    setFilter('tous')
    setSearch('')
  }

  return (
    <>
      <PageHeader
        label="Fiches CRC"
        title="Produits & Marges"
        description="Coût de revient complet, marge variable et marge nette par référence."
        actions={
          <ExportButton
            rows={sorted}
            columns={[
              { header: 'Produit', value: (s) => s.produit },
              { header: 'Volume vendu', value: (s) => s.volumeVendu },
              { header: 'PV HT (€)', value: (s) => s.pvHt },
              { header: 'CA HT (€)', value: (s) => s.caHT },
              { header: 'CRC total (€)', value: (s) => (s.coutsIncomplets ? null : s.crcTotal) },
              { header: 'Marge variable (%)', value: (s) => (s.coutsIncomplets ? null : s.margeVariablePct * 100) },
              { header: 'Marge nette (%)', value: (s) => (s.coutsIncomplets ? null : s.margeNettePct * 100) },
              { header: 'Benchmark', value: (s) => (s.coutsIncomplets ? 'Coûts incomplets' : s.benchmark) },
            ]}
            metadata={{
              title: 'Produits et marges',
              period: period.longLabel,
              filters: filtersActive
                ? `Filtre : ${filterOptions.find((o) => o.value === filter)?.label}${search ? ` · recherche « ${search} »` : ''}`
                : 'Aucun filtre',
              syncedAt: formatDateTime(syncedAt),
            }}
          />
        }
        meta={<SyncStatus />}
      />

      {/* ── Synthèse catalogue ───────────────────────────────────────────── */}
      <section aria-label="Synthèse du catalogue" className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Références actives"
          value={kpis.nbSkus}
          tone="gold"
          hint={`${kpis.nbComplets} complètes · ${kpis.nbIncomplets} à compléter`}
          source="Source : onglet FICHES CRC"
        />
        <Metric
          label="Marge variable médiane"
          value={formatPercent(kpis.margeVariableMediane, { isRatio: true })}
          tone={
            kpis.margeVariableMediane === null
              ? 'neutral'
              : kpis.margeVariableMediane >= 0.6
                ? 'positive'
                : kpis.margeVariableMediane >= 0.45
                  ? 'caution'
                  : 'critical'
          }
          unavailable={kpis.margeVariableMediane === null}
          unavailableReason="Aucune référence avec coûts complets"
          hint="Références à coûts complets uniquement"
          source="Repères : ≥ 60 % sain · 45–60 % limite"
        />
        <Metric
          label="Charges fixes mensuelles"
          value={formatEuroCompact(kpis.chargesFixesMensuelles)}
          tone="neutral"
          hint={`${formatEuroCompact(kpis.chargesFixesAnnuelles)} par an`}
          source="Source : onglet PARAMÈTRES"
        />
        <Metric
          label="Concentration du CA"
          value={`${pareto.countTo80} réf.`}
          tone={pareto.countTo80 <= 2 ? 'caution' : 'neutral'}
          hint="génèrent 80 % du CA catalogue"
          source={`CA catalogue : ${formatEuro(pareto.totalCA)}`}
        />
      </section>

      {/* ── Vue ──────────────────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionHeading
          label="Analyse détaillée"
          title={view === 'catalogue' ? 'Catalogue complet' : 'Concentration du chiffre d’affaires'}
          description={
            view === 'catalogue'
              ? 'Trier et filtrer les références par marge, volume ou statut de coût.'
              : `Les ${pareto.countTo80} premières références représentent 80 % du chiffre d’affaires du catalogue.`
          }
          actions={
            <SegmentedControl
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              label="Mode d’affichage du catalogue"
              surface="dark"
              size="sm"
            />
          }
        />

        {view === 'catalogue' ? (
          <Card flush>
            {/* Barre de filtres */}
            <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 pb-3">
              <div className="relative">
                <label htmlFor="sku-search" className="sr-only">
                  Rechercher une référence
                </label>
                <input
                  id="sku-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher…"
                  className={cn(
                    'h-8 w-48 rounded-md border border-rule-strong bg-white/[0.06] pl-8 pr-2 text-xs text-ink',
                    'placeholder:text-ink-faint/65',
                    'transition-[background-color,border-color] duration-[--duration-quick] ease-[--ease-glass]',
                    'hover:border-gold/45 hover:bg-white/[0.1] focus:bg-white/[0.13]',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold',
                  )}
                />
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16 16 4 4" strokeLinecap="round" />
                </svg>
              </div>

              <SegmentedControl
                options={filterOptions}
                value={filter}
                onChange={setFilter}
                label="Filtrer par statut de marge"
                surface="paper"
                size="sm"
              />

              {filtersActive && (
                <Button variant="quiet" size="sm" onClick={resetFilters}>
                  Réinitialiser
                </Button>
              )}

              <p className="ml-auto text-[11px] text-ink-faint" role="status">
                {sorted.length} référence{sorted.length > 1 ? 's' : ''} affichée
                {sorted.length > 1 ? 's' : ''}
                {filtersActive && ` sur ${skus.length}`}
              </p>
            </div>

            <div className="px-4 pb-2">
              <TableFrame caption="Catalogue produits — coût de revient et marges">
                <THead>
                  <TR>
                    <TH sortable sorted={sort.key === 'produit' ? sort.direction : null} onSort={() => toggleSort('produit')} sticky>
                      Produit
                    </TH>
                    <TH numeric sortable sorted={sort.key === 'volume' ? sort.direction : null} onSort={() => toggleSort('volume')}>
                      Volume
                    </TH>
                    <TH numeric sortable sorted={sort.key === 'ca' ? sort.direction : null} onSort={() => toggleSort('ca')}>
                      CA HT
                    </TH>
                    <TH numeric sortable sorted={sort.key === 'crc' ? sort.direction : null} onSort={() => toggleSort('crc')}>
                      CRC total
                    </TH>
                    <TH numeric sortable sorted={sort.key === 'margeVar' ? sort.direction : null} onSort={() => toggleSort('margeVar')}>
                      Marge var.
                    </TH>
                    <TH numeric sortable sorted={sort.key === 'margeNette' ? sort.direction : null} onSort={() => toggleSort('margeNette')}>
                      Marge nette
                    </TH>
                    <TH>Statut</TH>
                  </TR>
                </THead>

                <TBody>
                  {sorted.length === 0 ? (
                    <TEmpty colSpan={7}>
                      <EmptyState
                        variant="filtered"
                        title="Aucune référence ne correspond"
                        description="Aucun produit ne satisfait la recherche et le filtre actifs."
                        action={
                          <Button variant="quiet" size="sm" onClick={resetFilters}>
                            Réinitialiser les filtres
                          </Button>
                        }
                      />
                    </TEmpty>
                  ) : (
                    sorted.map((sku) => (
                      <TR key={sku.produit} dimmed={sku.coutsIncomplets}>
                        <TD sticky className="max-w-[220px] font-medium">
                          <span className="block truncate" title={sku.produit}>
                            {sku.produit}
                          </span>
                        </TD>
                        <TD numeric className="text-ink-muted">
                          {sku.volumeVendu.toLocaleString('fr-FR')}
                        </TD>
                        <TD numeric className="font-semibold">
                          {formatEuro(sku.caHT)}
                        </TD>
                        <TD numeric className="text-ink-muted">
                          {sku.coutsIncomplets ? '—' : formatEuro(sku.crcTotal, 2)}
                        </TD>
                        <TD numeric>
                          <MargeValue value={sku.margeVariablePct} incomplete={sku.coutsIncomplets} />
                        </TD>
                        <TD numeric>
                          <MargeValue value={sku.margeNettePct} incomplete={sku.coutsIncomplets} />
                        </TD>
                        <TD>
                          <BenchmarkBadge sku={sku} />
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </TableFrame>
            </div>
          </Card>
        ) : (
          <ParetoView pareto={pareto} />
        )}
      </section>

      {/* ── Charges fixes ────────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionHeading label="Structure de coûts" title="Répartition des charges fixes" />
        <Card>
          <dl className="divide-y divide-rule">
            {Object.entries(kpis.chargesFixesDetail).map(([poste, montant]) => (
              <div key={poste} className="flex items-baseline justify-between gap-3 py-2.5 text-[13px]">
                <dt className="text-ink-muted">{poste}</dt>
                <dd className="tabular font-medium text-ink">{formatEuro(montant)} / mois</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 pt-3 text-[13px]">
              <dt className="font-semibold text-ink">Total mensuel</dt>
              <dd className="text-right">
                <span className="tabular text-sm font-semibold text-ink">
                  {formatEuro(kpis.chargesFixesMensuelles)}
                </span>
                <span className="mt-0.5 block text-[10px] text-ink-faint">
                  {`${formatEuroCompact(kpis.chargesFixesAnnuelles)} par an`}
                </span>
              </dd>
            </div>
          </dl>
        </Card>
      </section>
    </>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function MargeValue({ value, incomplete }: { value: number; incomplete: boolean }) {
  if (incomplete) {
    return <span className="text-ink-faint">—</span>
  }

  const signal = margeSignal(value, true)
  const className =
    signal === 'green' ? 'text-positive-ink' : signal === 'amber' ? 'text-caution-ink' : 'text-critical-ink'

  return (
    <span className={cn('font-semibold', className)}>
      {formatPercent(value, { isRatio: true })}
    </span>
  )
}

function BenchmarkBadge({ sku }: { sku: FicheCRC }) {
  if (sku.coutsIncomplets) {
    return (
      <Badge tone="caution" srPrefix="Statut : ">
        Coûts incomplets
      </Badge>
    )
  }

  const benchmark = BENCHMARK_MAP[sku.benchmark]
  if (!benchmark) return <span className="text-ink-faint">—</span>

  const tone =
    benchmark.filter === 'ok' ? 'positive' : benchmark.filter === 'limite' ? 'caution' : 'critical'

  return (
    <Badge tone={tone} srPrefix="Statut : ">
      {benchmark.label}
    </Badge>
  )
}

function ParetoView({
  pareto,
}: {
  pareto: {
    rows: ParetoRow[]
    totalCA: number
    thresholdIndex: number
    countTo80: number
    leaders: string[]
  }
}) {
  return (
    <Card
      tone="glass"
      flush
      caption={
        pareto.leaders.length >= 2
          ? `Le chiffre d'affaires repose principalement sur « ${pareto.leaders[0]} » et « ${pareto.leaders[1]} ».`
          : undefined
      }
    >
      <div className="px-4 pb-2 pt-3">
        <TableFrame caption="Concentration du chiffre d'affaires par référence">
          <THead>
            <TR>
              <TH sticky>Produit</TH>
              <TH numeric>Volume</TH>
              <TH numeric>CA HT</TH>
              <TH numeric>% du CA</TH>
              <TH numeric>% cumulé</TH>
              <TH width="120px">Poids</TH>
            </TR>
          </THead>

          <TBody>
            {pareto.rows.length === 0 ? (
              <TEmpty colSpan={6}>
                <EmptyState
                  variant="pending"
                  title="Aucune référence"
                  description="Le classeur CRC ne contient pas encore de fiche produit."
                />
              </TEmpty>
            ) : (
              pareto.rows.map((row, index) => {
                const isThreshold = index === pareto.thresholdIndex
                const beyond80 = pareto.thresholdIndex >= 0 && index > pareto.thresholdIndex

                return (
                  <TR key={row.produit} dimmed={beyond80} emphasis={isThreshold}>
                    <TD sticky className="max-w-[220px]">
                      <span className="block truncate font-medium" title={row.produit}>
                        {row.produit}
                      </span>
                      {isThreshold && (
                        <Badge tone="gold" className="mt-1">
                          Seuil 80 %
                        </Badge>
                      )}
                    </TD>
                    <TD numeric className="text-ink-muted">
                      {row.volumeVendu.toLocaleString('fr-FR')}
                    </TD>
                    <TD numeric className="font-semibold">
                      {formatEuro(row.caHT)}
                    </TD>
                    <TD numeric className="text-ink-muted">
                      {formatPercent(row.partCA, { isRatio: true })}
                    </TD>
                    <TD numeric className={cn(row.cumulPct <= 0.805 ? 'font-semibold text-gold' : 'text-ink-faint')}>
                      {formatPercent(row.cumulPct, { isRatio: true })}
                    </TD>
                    <TD>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.12]">
                        <div
                          className={cn('h-full rounded-full', beyond80 ? 'bg-rule-strong' : 'bg-gold-deep')}
                          style={{ width: `${row.barWidth}%` }}
                        />
                      </div>
                    </TD>
                  </TR>
                )
              })
            )}
          </TBody>
        </TableFrame>
      </div>

      <footer className="border-t border-rule bg-white/[0.05] px-5 py-3">
        <p className="text-[11px] text-ink-muted">
          <span className="font-semibold text-ink">
            Les {pareto.countTo80} premières références
          </span>{' '}
          représentent 80 % du chiffre d&apos;affaires catalogue, soit{' '}
          <span className="tabular">{formatEuro(pareto.totalCA)}</span> au total.
        </p>
      </footer>
    </Card>
  )
}
