'use client'

import { useMemo } from 'react'
import { useData } from '@/components/data/DataProvider'
import { useAnalysis } from '@/components/data/AnalysisProvider'
import { SyncStatus } from '@/components/data/SyncStatus'
import { DataErrorState, PageLoading } from '@/components/data/PageState'
import { ExportButton } from '@/components/data/ExportButton'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Metric } from '@/components/ui/Metric'
import { Tooltip } from '@/components/ui/Tooltip'
import { Alert } from '@/components/ui/Alert'
import { channelMetrics, roiSignal, caOverPeriod, type ChannelMetric } from '@/lib/compute'
import { formatEuro, formatJours, formatMultiple, formatPercent } from '@/lib/format'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

const TT_ROI =
  "Marge brute de référence du canal rapportée à son coût complet. Un ROI de ×1 signifie que le canal ne dégage rien une fois ses frais payés."
const TT_COUT =
  "Ce que coûte un euro de chiffre d'affaires sur ce canal : commission de plateforme, logistique ramenée au panier moyen, et remise de fin d'année le cas échéant."
const TT_DSO_PHARMA =
  'Les pharmacies règlent en moyenne à 62 jours. La production est donc avancée deux mois avant encaissement : c\'est le canal le plus consommateur de trésorerie.'
const TT_DSO_GEN =
  "Délai moyen de règlement après livraison. Plus il s'allonge, plus il faut avancer de trésorerie."
const TT_MARGE =
  "Marge brute de référence paramétrée pour le canal. La marge constatée s'affichera dès les premières écritures du journal."

export default function CanauxPage() {
  const { data, loading, error, retry, syncedAt } = useData()
  const { period } = useAnalysis()

  const computed = useMemo(() => {
    if (!data) return null
    const channels = channelMetrics(data)
    return {
      channels,
      caPeriode: caOverPeriod(data, period.months),
      pharma: channels.find((channel) => channel.key === 'pharmacie') ?? null,
    }
  }, [data, period])

  if (loading) return <PageLoading metrics={3} cards={1} />
  if (error) return <DataErrorState error={error} onRetry={retry} />
  if (!data || !computed) return null

  const { channels, caPeriode, pharma } = computed
  const pharmaUnderperform = pharma?.roi !== null && pharma?.roi !== undefined && pharma.roi < 1.5

  return (
    <>
      <PageHeader
        label="Performance par canal"
        title="Canaux"
        description="Rentabilité comparée du DTC, de TikTok Shop et de la distribution en pharmacie."
        actions={
          <ExportButton
            rows={channels}
            columns={[
              { header: 'Canal', value: (c) => c.nom },
              { header: 'CA exercice (€)', value: (c) => c.caTrim },
              { header: 'Part du mix (%)', value: (c) => (c.partMix !== null ? c.partMix * 100 : null) },
              { header: 'Marge brute (%)', value: (c) => (c.margeBrute !== null ? c.margeBrute * 100 : null) },
              { header: 'Coût par € de CA', value: (c) => c.coutParEuroCA },
              { header: 'ROI', value: (c) => c.roi },
              { header: 'DSO (jours)', value: (c) => c.dso },
              { header: 'Taux de retour (%)', value: (c) => (c.tauxRetour !== null ? c.tauxRetour * 100 : null) },
              { header: 'CAC (€)', value: (c) => c.cac },
            ]}
            metadata={{
              title: 'Performance par canal',
              period: period.longLabel,
              syncedAt: formatDateTime(syncedAt),
            }}
          />
        }
        meta={<SyncStatus />}
      />

      <Alert tone="info" className="mb-4">
        Les coûts, délais et marges de référence proviennent de l&apos;onglet{' '}
        <strong>CANAUX_PARAMS</strong>{' '}
        du classeur de pilotage. Le chiffre d&apos;affaires affiché
        est celui de l&apos;exercice complet, indépendamment de la période sélectionnée : le journal
        ne ventile pas encore le CA par canal au mois.
      </Alert>

      {/* ── Cartes canal ─────────────────────────────────────────────────── */}
      <section aria-label="Canaux de vente" className="stagger grid grid-cols-1 gap-3 lg:grid-cols-3">
        {channels.map((channel) => (
          <ChannelCard key={channel.key} channel={channel} />
        ))}
      </section>

      {/* ── Signal pharmacie ─────────────────────────────────────────────── */}
      {pharmaUnderperform && pharma && (
        <section className="mt-4">
          <Alert tone="critical" title="Rentabilité du canal Pharmacie sous le seuil">
            <p>
              Le ROI estimé s&apos;établit à <strong>{formatMultiple(pharma.roi)}</strong>, en
              dessous du seuil de ×1,5. Entre la commission de{' '}
              {formatPercent(data.canauxParams.commission.pharmacie, { isRatio: true, decimals: 0 })}
              , la remise de fin d&apos;année et un délai de règlement de {formatJours(pharma.dso)},
              ce canal mobilise de la trésorerie et dilue la marge consolidée.
            </p>
            <p className="mt-1.5">
              <span className="font-semibold">Piste à instruire :</span> réexaminer les conditions
              distributeur (commission, RFA, délai) avant tout réassort, et chiffrer l&apos;impact
              d&apos;un déstockage progressif dans le simulateur de remise.
            </p>
          </Alert>
        </section>
      )}

      {/* ── Contexte consolidé ───────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionHeading
          label="Contexte"
          title="Repères consolidés"
          description={`Période analysée : ${period.longLabel}`}
        />
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric
            label="CA de la période"
            value={formatEuro(caPeriode)}
            tone="gold"
            unavailable={caPeriode === null}
            unavailableReason="Aucune écriture sur la période sélectionnée"
            source="Tous canaux confondus, net de remises"
          />
          <Metric
            label="Seuil de rentabilité canal"
            value="×1,5"
            tone="neutral"
            hint="En dessous : canal non rentable"
            source="Seuil paramétré dans compute.ts"
          />
          <Metric
            label="Canaux au-dessus du seuil"
            value={`${channels.filter((c) => c.roi !== null && c.roi >= 1.5).length} / ${channels.length}`}
            tone={
              channels.filter((c) => c.roi !== null && c.roi >= 1.5).length === channels.length
                ? 'positive'
                : 'caution'
            }
            source="Calculé sur les paramètres canaux"
          />
        </div>
      </section>
    </>
  )
}

function ChannelCard({ channel }: { channel: ChannelMetric }) {
  const signal = roiSignal(channel.roi)
  const tone =
    signal === 'green' ? 'positive' : signal === 'amber' ? 'caution' : signal === 'red' ? 'critical' : 'neutral'
  const mixPercent = channel.partMix !== null ? Math.round(channel.partMix * 100) : 0

  return (
    <Card
      tone="glass"
      title={channel.nom}
      caption={channel.sousTitre}
      action={
        <span className="flex items-center gap-1">
          <Badge tone={tone} srPrefix="Rentabilité : ">
            ROI {formatMultiple(channel.roi)}
          </Badge>
          <Tooltip content={TT_ROI} label={`À propos du ROI de ${channel.nom}`} />
        </span>
      }
    >
      <div>
        <p className="section-label text-ink-faint">Chiffre d&apos;affaires exercice</p>
        <p className="tabular mt-1 text-xl font-medium text-ink">{formatEuro(channel.caTrim)}</p>
      </div>

      {/* Part du mix */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="text-ink-muted">Part du mix canal</span>
          <span className="tabular font-semibold text-ink">
            {formatPercent(channel.partMix, { isRatio: true })}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.12]"
          role="img"
          aria-label={`Part du mix : ${formatPercent(channel.partMix, { isRatio: true })}`}
        >
          <div
            className={cn('h-full rounded-full bg-gold-deep transition-[width]')}
            style={{ width: `${mixPercent}%` }}
          />
        </div>
      </div>

      <dl className="mt-4 space-y-2 border-t border-rule pt-3 text-[13px]">
        <DetailRow
          label="Marge brute de référence"
          tooltip={TT_MARGE}
          value={formatPercent(channel.margeBrute, { isRatio: true })}
        />
        <DetailRow
          label="Coût par € de CA"
          tooltip={TT_COUT}
          value={channel.coutParEuroCA !== null ? formatEuro(channel.coutParEuroCA, 2) : '—'}
        />
        <DetailRow
          label="Délai de règlement"
          tooltip={channel.key === 'pharmacie' ? TT_DSO_PHARMA : TT_DSO_GEN}
          value={formatJours(channel.dso)}
        />
        <DetailRow label="Taux de retour" value={formatPercent(channel.tauxRetour, { isRatio: true })} />
        <DetailRow
          label="Coût d'acquisition"
          value={formatEuro(channel.cac)}
          hint={channel.cac === null ? 'Disponible pour le DTC uniquement' : undefined}
        />
      </dl>
    </Card>
  )
}

function DetailRow({
  label,
  value,
  tooltip,
  hint,
}: {
  label: string
  value: string
  tooltip?: string
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-ink-muted">
        {label}
        {tooltip && <Tooltip content={tooltip} label={`À propos de ${label}`} />}
      </dt>
      <dd className="text-right">
        <span className="tabular font-medium text-ink">{value}</span>
        {hint && <span className="mt-0.5 block text-[10px] text-ink-faint">{hint}</span>}
      </dd>
    </div>
  )
}
