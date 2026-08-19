'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useData } from '@/components/data/DataProvider'
import { SyncStatus } from '@/components/data/SyncStatus'
import { DataErrorState, PageLoading } from '@/components/data/PageState'
import { PrintButton } from '@/components/data/ExportButton'
import { PageHeader, SectionHeading } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Metric } from '@/components/ui/Metric'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { Tooltip } from '@/components/ui/Tooltip'
import { EmptyState } from '@/components/ui/EmptyState'
import { MISSING, formatEuro, formatJours, formatMois, formatPercent } from '@/lib/format'
import { cn } from '@/lib/cn'

const TT_RUNWAY =
  'Nombre de mois pendant lesquels la trésorerie actuelle couvre les charges fixes, à activité constante. En dessous de trois mois, la situation appelle une décision.'
const TT_CCC =
  "Cycle de conversion de trésorerie : nombre de jours entre le décaissement fournisseur et l'encaissement client. Plus il est court, moins l'exploitation mobilise de cash."
const TT_BFR =
  "Besoin en fonds de roulement : argent immobilisé dans l'exploitation, soit stock et créances clients diminués des dettes fournisseurs."

/** Seuils de couleur du cycle de conversion, propres à chaque canal. */
interface ChannelCcc {
  key: string
  nom: string
  sousTitre: string
  jours: number | null
  greenBelow: number
  redAbove: number
  tooltip: string
}

export default function TresoreriePage() {
  const { data, loading, error, retry } = useData()

  const computed = useMemo(() => {
    if (!data) return null
    const t = data.tresoreriePilotage

    const channels: ChannelCcc[] = [
      {
        key: 'shopify',
        nom: 'DTC Shopify',
        sousTitre: 'Encaissement carte à J+2',
        jours: t.cccShopify,
        greenBelow: 15,
        redAbove: 30,
        tooltip:
          'Encaissement quasi immédiat par carte. Le cycle court de ce canal compense partiellement les délais des autres.',
      },
      {
        key: 'tiktok',
        nom: 'TikTok Shop',
        sousTitre: 'Règlement 7 à 15 jours après livraison',
        jours: t.cccTiktok,
        greenBelow: 15,
        redAbove: 30,
        tooltip:
          'Règlement de la plateforme sous 7 à 15 jours. Un pic de ventes crée un décalage de trésorerie proportionnel.',
      },
      {
        key: 'pharmacie',
        nom: 'Pharmacie',
        sousTitre: 'Règlement à 62 jours',
        jours: t.cccPharmacie,
        greenBelow: 30,
        redAbove: 60,
        tooltip:
          "Chaque euro facturé en pharmacie reste immobilisé environ deux mois. C'est le principal facteur de tension sur la trésorerie.",
      },
    ]

    return { t, channels }
  }, [data])

  if (loading) return <PageLoading metrics={4} cards={3} />
  if (error) return <DataErrorState error={error} onRetry={retry} />
  if (!data || !computed) return null

  const { t, channels } = computed

  const noData =
    t.soldeActuel === null &&
    t.runwayMois === null &&
    t.cccConsolide === null &&
    t.bfrActuel === null

  return (
    <>
      <PageHeader
        label="Pilotage"
        title="Trésorerie"
        description="Runway, cycle de conversion de trésorerie et facteurs de tension."
        actions={<PrintButton />}
        meta={<SyncStatus />}
      />

      {noData ? (
        <Card>
          <EmptyState
            variant="pending"
            title="Onglet de pilotage non renseigné"
            description="L'onglet TRESORERIE_PILOTAGE du classeur Honeylang_PF_v3.xlsx ne contient aucune valeur exploitable. Aucun chiffre n'est estimé à sa place."
          />
        </Card>
      ) : (
        <>
          {/* ── Indicateurs ────────────────────────────────────────────── */}
          <section
            aria-label="Indicateurs de trésorerie"
            className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Metric
              label="Solde de trésorerie"
              value={formatEuro(t.soldeActuel)}
              tone="gold"
              unavailable={t.soldeActuel === null}
              source="Source : TRESORERIE_PILOTAGE"
            />

            <Metric
              label="Runway"
              value={formatMois(t.runwayMois)}
              tone={runwayTone(t.runwayMois)}
              tooltip={TT_RUNWAY}
              unavailable={t.runwayMois === null}
              hint={
                t.statutRunway ? (
                  <Badge tone={statutTone(t.statutRunway)} srPrefix="Statut : ">
                    {t.statutRunway}
                  </Badge>
                ) : undefined
              }
              source={
                t.chargesFixesMensuelles !== null
                  ? `Base : ${formatEuro(t.chargesFixesMensuelles)} de charges fixes par mois`
                  : undefined
              }
            />

            <Metric
              label="CCC consolidé"
              value={formatJours(t.cccConsolide)}
              tone={t.cccConsolide !== null && t.cccConsolide > 45 ? 'caution' : 'neutral'}
              tooltip={TT_CCC}
              unavailable={t.cccConsolide === null}
              source="Moyenne pondérée des trois canaux"
            />

            <Metric
              label="BFR actuel"
              value={formatEuro(t.bfrActuel)}
              tone="neutral"
              tooltip={TT_BFR}
              unavailable={t.bfrActuel === null}
              hint={t.bfrJoursCA !== null ? `${formatJours(t.bfrJoursCA)} de CA` : undefined}
              source="Source : TRESORERIE_PILOTAGE"
            />
          </section>

          {/* ── Cycle par canal ────────────────────────────────────────── */}
          <section className="mt-6">
            <SectionHeading
              label="Cycle de conversion"
              title="Délai d'encaissement par canal"
              description="Nombre de jours entre le décaissement fournisseur et l'encaissement client."
            />
            <div className="stagger grid grid-cols-1 gap-3 lg:grid-cols-3">
              {channels.map((channel) => (
                <CccCard key={channel.key} channel={channel} />
              ))}
            </div>
          </section>

          {/* ── Facteurs de tension ────────────────────────────────────── */}
          <section className="mt-6">
            <SectionHeading
              label="Analyse"
              title="Facteurs de tension"
              description="Ce qui mobilise la trésorerie, par ordre d'impact."
            />
            <div className="stagger grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Card label="Stocks" title="Stock immobilisé">
                <dl className="space-y-2 text-[13px]">
                  <Row label="BFR actuel" value={formatEuro(t.bfrActuel)} />
                  <Row label="En jours de CA" value={formatJours(t.bfrJoursCA)} />
                </dl>
                <p className="mt-3 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-muted">
                  {t.bfrJoursCA !== null
                    ? `Le stock et les créances représentent ${formatJours(
                        t.bfrJoursCA,
                      )} de chiffre d'affaires immobilisés. Le déstockage est le levier le plus direct pour libérer du cash.`
                    : "L'onglet BFR n'est pas renseigné : la couverture en jours de CA ne peut pas être calculée."}
                </p>
              </Card>

              <Card label="Distribution" title="Canal Pharmacie">
                <dl className="space-y-2 text-[13px]">
                  <Row
                    label="Part du chiffre d'affaires"
                    value={formatPercent(t.partCAPharmacie, { isRatio: true, decimals: 0 })}
                  />
                  <Row
                    label="Trésorerie immobilisée"
                    value={formatEuro(t.cashImmobilisePharmacie)}
                    emphasis
                  />
                </dl>
                <p className="mt-3 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-muted">
                  {t.partCAPharmacie !== null && t.cashImmobilisePharmacie !== null
                    ? `Ce canal pèse ${formatPercent(t.partCAPharmacie, {
                        isRatio: true,
                        decimals: 0,
                      })} du chiffre d'affaires mais immobilise ${formatEuro(
                        t.cashImmobilisePharmacie,
                      )} pendant environ deux mois.`
                    : 'Les paramètres du canal pharmacie ne sont pas renseignés dans le classeur de pilotage.'}
                </p>
              </Card>

              <Card label="Structure" title="Charges fixes">
                <dl className="space-y-2 text-[13px]">
                  <Row label="Montant mensuel" value={formatEuro(t.chargesFixesMensuelles)} />
                  <Row
                    label="Runway couvert"
                    value={formatMois(t.runwayMois)}
                  />
                </dl>
                <p className="mt-3 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-muted">
                  {t.chargesFixesMensuelles !== null
                    ? `${formatEuro(
                        t.chargesFixesMensuelles,
                      )} de charges incompressibles chaque mois. C'est la base de calcul du runway.`
                    : "Le montant des charges fixes mensuelles n'est pas renseigné."}
                </p>
              </Card>
            </div>
          </section>

          {/* ── Lien vers les simulateurs ──────────────────────────────── */}
          <section className="mt-6">
            <Alert tone="info" title="Ces délais alimentent les simulateurs">
              Le cycle de conversion réel de chaque canal est repris dans les simulateurs{' '}
              <Link
                href="/dashboard/simulations"
                className="font-semibold text-gold underline underline-offset-2 hover:text-ink"
              >
                Campagne publicitaire et Nouveau produit
              </Link>{' '}
              pour estimer le délai d&apos;encaissement effectif du canal sélectionné.
            </Alert>
          </section>
        </>
      )}
    </>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function runwayTone(mois: number | null): 'gold' | 'positive' | 'caution' | 'critical' {
  if (mois === null) return 'gold'
  if (mois < 3) return 'critical'
  if (mois < 6) return 'caution'
  return 'positive'
}

function statutTone(statut: string): 'positive' | 'caution' | 'critical' {
  if (statut.includes('Sain')) return 'positive'
  if (statut.includes('Vigilance')) return 'caution'
  return 'critical'
}

function cccTone(jours: number | null, greenBelow: number, redAbove: number) {
  if (jours === null) return 'neutral' as const
  if (jours < greenBelow) return 'positive' as const
  if (jours > redAbove) return 'critical' as const
  return 'caution' as const
}

function CccCard({ channel }: { channel: ChannelCcc }) {
  const tone = cccTone(channel.jours, channel.greenBelow, channel.redAbove)
  const badgeLabel =
    tone === 'positive'
      ? `moins de ${channel.greenBelow} j`
      : tone === 'critical'
        ? `plus de ${channel.redAbove} j`
        : `${channel.greenBelow}–${channel.redAbove} j`

  // Échelle fixe à 90 jours : comparer trois canaux sur des échelles
  // différentes rendrait les barres visuellement trompeuses.
  const SCALE_MAX = 90
  const width = channel.jours !== null ? Math.min((channel.jours / SCALE_MAX) * 100, 100) : 0

  const barColor =
    tone === 'positive'
      ? 'bg-positive'
      : tone === 'critical'
        ? 'bg-critical'
        : 'bg-caution'

  return (
    <Card
      tone="glass"
      title={channel.nom}
      caption={channel.sousTitre}
      action={
        <span className="flex items-center gap-1">
          <Badge tone={tone} srPrefix="Délai : ">
            {channel.jours !== null ? badgeLabel : MISSING}
          </Badge>
          <Tooltip content={channel.tooltip} label={`À propos du cycle ${channel.nom}`} />
        </span>
      }
    >
      <p className="section-label text-ink-faint">Cycle de conversion</p>
      <p className="tabular mt-1 text-3xl font-medium text-ink">
        {channel.jours !== null ? `${Math.round(channel.jours)} j` : MISSING}
      </p>

      {channel.jours !== null && (
        <div className="mt-4">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/[0.12]"
            role="img"
            aria-label={`${Math.round(channel.jours)} jours sur une échelle de 0 à ${SCALE_MAX}`}
          >
            <div className={cn('h-full rounded-full', barColor)} style={{ width: `${width}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
            <span>0 j</span>
            <span>45 j</span>
            <span>90 j</span>
          </div>
        </div>
      )}
    </Card>
  )
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn('tabular font-medium', emphasis ? 'text-critical-ink' : 'text-ink')}>
        {value}
      </dd>
    </div>
  )
}
