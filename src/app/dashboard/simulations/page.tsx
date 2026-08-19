'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useData } from '@/components/data/DataProvider'
import { SyncStatus } from '@/components/data/SyncStatus'
import { DataErrorState, PageLoading } from '@/components/data/PageState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SelectInput, SliderInput, TextInput } from '@/components/ui/Field'
import { formatEuro, formatEuroCompact, formatPercent, formatRoas } from '@/lib/format'
import type { AllData } from '@/lib/data-types'
import { cn } from '@/lib/cn'

/**
 * Simulateurs.
 *
 * ## Séparation entre réel et hypothétique
 *
 * Tout ce que produit cette page est une **projection**, calculée à partir de
 * paramètres saisis à la main. Elle est visuellement distincte des chiffres
 * constatés : bandeau permanent, mention « hypothèse » sur chaque bloc de
 * résultat, et jamais d'euro affiché sans son étiquette de projection.
 *
 * ## Persistance
 *
 * Les scénarios nommés vivent **uniquement en mémoire de la page**. Ils ne
 * sont ni écrits dans le navigateur ni transmis au serveur : un scénario
 * contient des hypothèses commerciales (remises envisagées, budgets média)
 * dont la fuite serait plus gênante que le confort de les retrouver demain.
 * Quitter la page les efface, et le bandeau le dit.
 */

type SimulatorKey = 'remise' | 'campagne' | 'produit'

const SIMULATORS: { value: SimulatorKey; label: string; description: string }[] = [
  {
    value: 'remise',
    label: 'Remise commerciale',
    description: "Effet d'une remise sur le chiffre d'affaires et la marge, et volume nécessaire pour la compenser.",
  },
  {
    value: 'campagne',
    label: 'Campagne publicitaire',
    description: "Rentabilité d'un budget média selon le ROAS attendu et la marge du catalogue.",
  },
  {
    value: 'produit',
    label: 'Nouveau produit',
    description: "Marge variable et marge nette d'une nouvelle référence, et son seuil de rentabilité.",
  },
]

type Signal = 'positive' | 'caution' | 'critical'

export default function SimulationsPage() {
  const { data, loading, error, retry } = useData()
  const [simulator, setSimulator] = useState<SimulatorKey>('remise')

  if (loading) return <PageLoading metrics={2} cards={2} />
  if (error) return <DataErrorState error={error} onRetry={retry} />
  if (!data) return null

  const active = SIMULATORS.find((item) => item.value === simulator)!

  return (
    <>
      <PageHeader
        label="Aide à la décision"
        title="Simulations"
        description="Projections calculées dans le navigateur à partir des coûts réels du catalogue."
        meta={<SyncStatus />}
      />

      <Alert tone="caution" title="Ces résultats sont des hypothèses, pas des chiffres constatés">
        Les valeurs produites ci-dessous découlent des paramètres que vous réglez. Elles
        n&apos;apparaissent dans aucun autre écran et ne modifient aucune donnée source. Les
        scénarios enregistrés restent en mémoire de cette page et disparaissent lorsque vous la
        quittez : rien n&apos;est envoyé au serveur.
      </Alert>

      <div className="mt-4">
        <SegmentedControl
          options={SIMULATORS}
          value={simulator}
          onChange={setSimulator}
          label="Choix du simulateur"
          surface="dark"
        />
        <p className="mt-2 text-[12px] text-cream-muted">{active.description}</p>
      </div>

      <div className="mt-4">
        {simulator === 'remise' && <RemiseSimulator data={data} />}
        {simulator === 'campagne' && <CampagneSimulator data={data} />}
        {simulator === 'produit' && <ProduitSimulator data={data} />}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Coque commune : paramètres, scénarios nommés, comparaison
// ═══════════════════════════════════════════════════════════════════════════

interface Scenario<P> {
  id: number
  name: string
  params: P
}

/**
 * Gère les scénarios nommés et la comparaison.
 * Générique sur la forme des paramètres, pour servir les trois simulateurs.
 */
function useScenarios<P>(current: P, defaults: P, reset: (params: P) => void) {
  const [scenarios, setScenarios] = useState<Scenario<P>[]>([])
  const [comparedId, setComparedId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  const [nextId, setNextId] = useState(1)

  const save = useCallback(() => {
    const name = draftName.trim() || `Scénario ${nextId}`
    setScenarios((previous) => [...previous, { id: nextId, name, params: current }])
    setNextId((value) => value + 1)
    setDraftName('')
  }, [draftName, nextId, current])

  const remove = useCallback(
    (id: number) => {
      setScenarios((previous) => previous.filter((scenario) => scenario.id !== id))
      setComparedId((value) => (value === id ? null : value))
    },
    [],
  )

  const compared = scenarios.find((scenario) => scenario.id === comparedId) ?? null

  const resetToDefaults = useCallback(() => {
    reset(defaults)
  }, [defaults, reset])

  return {
    scenarios,
    compared,
    comparedId,
    setComparedId,
    draftName,
    setDraftName,
    save,
    remove,
    resetToDefaults,
    restore: (params: P) => reset(params),
  }
}

function ScenarioBar<P>({
  controller,
  className,
}: {
  controller: ReturnType<typeof useScenarios<P>>
  className?: string
}) {
  const { scenarios, comparedId, setComparedId, draftName, setDraftName, save, remove, resetToDefaults } =
    controller

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end gap-2">
        <TextInput
          label="Nommer ce scénario"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="ex. Remise salon"
          maxLength={40}
          containerClassName="w-44"
        />
        <Button variant="secondary" size="sm" onClick={save} className="mb-[1px]">
          Enregistrer
        </Button>
        <Button variant="quiet" size="sm" onClick={resetToDefaults} className="mb-[1px]">
          Réinitialiser
        </Button>
      </div>

      {scenarios.length > 0 && (
        <div>
          <p className="section-label mb-1.5 text-ink-faint">
            Scénarios en mémoire ({scenarios.length})
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {scenarios.map((scenario) => {
              const selected = scenario.id === comparedId
              return (
                <li key={scenario.id}>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[11px]',
                      selected
                        ? 'border-gold-deep bg-gold/15 text-gold'
                        : 'border-rule-strong text-ink-muted',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setComparedId(selected ? null : scenario.id)}
                      aria-pressed={selected}
                      className="rounded-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold"
                    >
                      {scenario.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(scenario.id)}
                      aria-label={`Supprimer le scénario ${scenario.name}`}
                      className="rounded-full px-1 text-ink-faint transition-colors hover:text-critical-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-1.5 text-[10px] text-ink-faint">
            Sélectionner un scénario l&apos;affiche en regard des valeurs courantes.
          </p>
        </div>
      )}
    </div>
  )
}

/** Bloc de résultat — toujours étiqueté comme une projection. */
function ResultTile({
  label,
  value,
  comparison,
  caption,
  signal,
  emphasis = false,
}: {
  label: string
  value: string
  /** Valeur du scénario comparé, si une comparaison est active. */
  comparison?: string
  caption?: ReactNode
  signal?: Signal
  emphasis?: boolean
}) {
  const signalClass =
    signal === 'positive'
      ? 'text-positive-ink'
      : signal === 'caution'
        ? 'text-caution-ink'
        : signal === 'critical'
          ? 'text-critical-ink'
          : 'text-ink'

  return (
    <div
      className={cn(
        'rounded-md border p-3.5',
        emphasis ? 'border-gold/40 bg-gold/[0.06]' : 'border-rule bg-white/[0.04]',
      )}
    >
      <p className="section-label text-ink-faint">{label}</p>
      <p className={cn('tabular mt-1.5 text-xl font-semibold', emphasis ? signalClass : 'text-ink')}>
        {value}
      </p>
      {comparison !== undefined && (
        <p className="tabular mt-1 text-[11px] text-ink-muted">
          <span className="text-ink-faint">Comparé :</span> {comparison}
        </p>
      )}
      {caption && <p className="mt-1 text-[11px] leading-snug text-ink-faint">{caption}</p>}
    </div>
  )
}

function SignalBadge({ signal }: { signal: Signal }) {
  const label = signal === 'positive' ? 'Favorable' : signal === 'caution' ? 'Ambitieux' : 'Risqué'
  return (
    <Badge tone={signal} srPrefix="Appréciation : ">
      {label}
    </Badge>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Remise commerciale
// ═══════════════════════════════════════════════════════════════════════════

interface RemiseParams {
  skuKey: string
  remisePct: number
  volumeOverride: number | null
}

const REMISE_DEFAULTS: RemiseParams = { skuKey: '__all__', remisePct: 10, volumeOverride: null }

function computeRemise(
  data: AllData,
  params: RemiseParams,
): {
  volume: number
  pvMoyen: number
  volTotal: number
  result: {
    caAvant: number
    caApres: number
    margeAvant: number
    margeApres: number
    deltaMargePct: number
    volComp: number
    unitesSup: number | null
    viable: boolean
    signal: Signal
  } | null
} {
  const complets = data.fichesCRC.filter((sku) => !sku.coutsIncomplets)
  const selection =
    params.skuKey === '__all__' ? complets : complets.filter((sku) => sku.produit === params.skuKey)

  const volTotal = selection.reduce((sum, sku) => sum + sku.volumeVendu, 0)
  const pvMoyen =
    volTotal > 0
      ? selection.reduce((sum, sku) => sum + sku.pvHt * sku.volumeVendu, 0) / volTotal
      : 0
  const margeUnitMoyenne =
    volTotal > 0
      ? selection.reduce((sum, sku) => sum + sku.margeVariableEur * sku.volumeVendu, 0) / volTotal
      : 0

  const volume = params.volumeOverride ?? volTotal

  if (selection.length === 0 || volume === 0 || pvMoyen === 0) {
    return { volume, pvMoyen, volTotal, result: null }
  }

  const r = params.remisePct / 100

  const caAvant = volume * pvMoyen
  const margeAvant = volume * margeUnitMoyenne
  const caApres = volume * pvMoyen * (1 - r)
  const margeApresParUnite = margeUnitMoyenne - pvMoyen * r
  const margeApres = volume * margeApresParUnite

  const deltaMarge = margeApres - margeAvant
  const deltaMargePct = margeAvant > 0 ? deltaMarge / margeAvant : 0

  const perteMarge = margeAvant - margeApres
  const viable = margeApresParUnite > 0
  const unitesSup = viable ? Math.ceil(perteMarge / margeApresParUnite) : null
  const volComp = viable ? perteMarge / margeApres : Number.POSITIVE_INFINITY

  const signal: Signal = !viable ? 'critical' : volComp < 0.2 ? 'positive' : volComp < 0.5 ? 'caution' : 'critical'

  return {
    volume,
    pvMoyen,
    volTotal,
    result: {
      caAvant,
      caApres,
      margeAvant,
      margeApres,
      deltaMargePct,
      volComp,
      unitesSup,
      viable,
      signal,
    },
  }
}

function RemiseSimulator({ data }: { data: AllData }) {
  const [params, setParams] = useState<RemiseParams>(REMISE_DEFAULTS)
  const complets = useMemo(() => data.fichesCRC.filter((sku) => !sku.coutsIncomplets), [data])

  const controller = useScenarios(params, REMISE_DEFAULTS, setParams)

  const current = useMemo(() => computeRemise(data, params), [data, params])
  const compared = useMemo(
    () => (controller.compared ? computeRemise(data, controller.compared.params) : null),
    [data, controller.compared],
  )

  if (complets.length === 0) {
    return (
      <Card>
        <EmptyState
          variant="pending"
          title="Aucune référence à coûts complets"
          description="Le simulateur de remise s'appuie sur la marge variable réelle par référence. Renseigner les coûts labo dans le classeur CRC pour l'activer."
        />
      </Card>
    )
  }

  const maxVolume = Math.max(current.volTotal * 2, 200)

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card label="Hypothèses" title="Paramètres">
        <div className="space-y-5">
          <SelectInput
            label="Périmètre"
            value={params.skuKey}
            onChange={(event) =>
              // Le volume repart de l'historique du nouveau périmètre : conserver
              // l'ancien produirait une projection sur un volume sans rapport.
              setParams({ ...params, skuKey: event.target.value, volumeOverride: null })
            }
            hint="Gamme complète ou référence unique"
          >
            <option value="__all__">{`Gamme complète (${complets.length} références)`}</option>
            {complets.map((sku) => (
              <option key={sku.produit} value={sku.produit}>
                {sku.produit}
              </option>
            ))}
          </SelectInput>

          <SliderInput
            label="Volume de vente projeté"
            value={current.volume}
            min={1}
            max={maxVolume}
            step={1}
            onChange={(value) => setParams({ ...params, volumeOverride: value })}
            display={`${current.volume.toLocaleString('fr-FR')} u.`}
            hint={
              current.volume !== current.volTotal
                ? `Volume historique du périmètre : ${current.volTotal.toLocaleString('fr-FR')} unités`
                : 'Initialisé sur le volume historique du périmètre'
            }
          />

          <SliderInput
            label="Remise accordée"
            value={params.remisePct}
            min={0}
            max={50}
            step={1}
            onChange={(value) => setParams({ ...params, remisePct: value })}
            display={`${params.remisePct} %`}
          />
        </div>

        <div className="mt-5 border-t border-rule pt-4">
          <ScenarioBar controller={controller} />
        </div>
      </Card>

      <div className="space-y-3">
        {current.result ? (
          <>
            <Card
              tone="glass"
              label="Projection"
              title="Effet de la remise"
              action={<SignalBadge signal={current.result.signal} />}
              caption={
                controller.compared
                  ? `Comparaison avec « ${controller.compared.name} »`
                  : "Valeurs projetées, dérivées des marges réelles du catalogue"
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <ResultTile
                  label="CA avant remise"
                  value={formatEuro(current.result.caAvant)}
                  comparison={compared?.result ? formatEuro(compared.result.caAvant) : undefined}
                />
                <ResultTile
                  label="CA après remise"
                  value={formatEuro(current.result.caApres)}
                  comparison={compared?.result ? formatEuro(compared.result.caApres) : undefined}
                />
                <ResultTile
                  label="Marge variable avant"
                  value={formatEuro(current.result.margeAvant)}
                  comparison={compared?.result ? formatEuro(compared.result.margeAvant) : undefined}
                />
                <ResultTile
                  label="Marge variable après"
                  value={formatEuro(current.result.margeApres)}
                  comparison={compared?.result ? formatEuro(compared.result.margeApres) : undefined}
                  caption={`${formatPercent(current.result.deltaMargePct, { isRatio: true })} par rapport à la situation actuelle`}
                  signal={current.result.signal}
                  emphasis
                />
              </div>
            </Card>

            <Card label="Compensation" title="Volume nécessaire pour retrouver la marge">
              {current.result.viable ? (
                <>
                  <p className="tabular text-3xl font-semibold text-gold">
                    {`+${current.result.unitesSup!.toLocaleString('fr-FR')} unités`}
                  </p>
                  <p className="mt-1.5 text-[12px] text-ink-muted">
                    Soit {formatPercent(current.result.volComp, { isRatio: true, decimals: 0 })} de
                    volume supplémentaire pour compenser intégralement la marge cédée.
                  </p>
                  {compared?.result?.viable && (
                    <p className="tabular mt-2 border-t border-rule pt-2 text-[11px] text-ink-muted">
                      <span className="text-ink-faint">Scénario comparé : </span>
                      {`+${compared.result.unitesSup!.toLocaleString('fr-FR')} unités`}
                    </p>
                  )}
                </>
              ) : (
                <Alert tone="critical" title="Remise non compensable par le volume">
                  À ce niveau de remise, la marge variable unitaire devient négative : chaque unité
                  supplémentaire vendue creuse la perte. Aucun volume ne rétablit la marge initiale.
                </Alert>
              )}
            </Card>
          </>
        ) : (
          <Card>
            <EmptyState
              variant="none"
              title="Projection non calculable"
              description="Le périmètre sélectionné n'a ni volume ni prix moyen exploitable."
            />
          </Card>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Campagne publicitaire
// ═══════════════════════════════════════════════════════════════════════════

interface CampagneParams {
  canal: 'shopify' | 'tiktok'
  budget: number
  /** ROAS × 10, pour un curseur à pas entier. */
  roasDixiemes: number
  margePct: number
}

function medianeMarge(data: AllData): number {
  const marges = data.fichesCRC
    .filter((sku) => !sku.coutsIncomplets)
    .map((sku) => sku.margeVariablePct)
    .sort((a, b) => a - b)

  if (marges.length === 0) return 0.6
  const middle = Math.floor(marges.length / 2)
  return marges.length % 2 === 0 ? (marges[middle - 1] + marges[middle]) / 2 : marges[middle]
}

function computeCampagne(params: CampagneParams) {
  const roas = params.roasDixiemes / 10

  const caGenere = params.budget * roas
  const margeGeneree = caGenere * (params.margePct / 100)
  const profitNet = margeGeneree - params.budget
  const roi = params.budget > 0 ? profitNet / params.budget : 0
  const roasBreakEven = params.margePct > 0 ? 100 / params.margePct : null
  const profitable = profitNet > 0

  const signal: Signal = profitable ? (roi > 0.5 ? 'positive' : 'caution') : 'critical'

  return { roas, caGenere, margeGeneree, profitNet, roi, roasBreakEven, profitable, signal }
}

function CampagneSimulator({ data }: { data: AllData }) {
  const defaults = useMemo<CampagneParams>(
    () => ({
      canal: 'shopify',
      budget: 5000,
      roasDixiemes: 30,
      margePct: Math.round(medianeMarge(data) * 100),
    }),
    [data],
  )

  const [params, setParams] = useState<CampagneParams>(defaults)
  const controller = useScenarios(params, defaults, setParams)

  const current = useMemo(() => computeCampagne(params), [params])
  const compared = useMemo(
    () => (controller.compared ? computeCampagne(controller.compared.params) : null),
    [controller.compared],
  )

  const ccc =
    params.canal === 'shopify'
      ? data.tresoreriePilotage.cccShopify
      : data.tresoreriePilotage.cccTiktok

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card label="Hypothèses" title="Paramètres de la campagne">
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-muted">Canal de diffusion</p>
            <SegmentedControl
              options={[
                { value: 'shopify' as const, label: 'DTC Shopify' },
                { value: 'tiktok' as const, label: 'TikTok Shop' },
              ]}
              value={params.canal}
              onChange={(canal) => setParams({ ...params, canal })}
              label="Canal de diffusion de la campagne"
              surface="paper"
              size="sm"
            />
            {ccc !== null && (
              <p className="mt-1.5 text-[11px] text-ink-faint">
                Délai d&apos;encaissement réel de ce canal :{' '}
                <span className="tabular font-semibold text-ink-muted">{Math.round(ccc)} jours</span>{' '}
                — donnée constatée, issue du classeur de pilotage.
              </p>
            )}
          </div>

          <SliderInput
            label="Budget publicitaire"
            value={params.budget}
            min={500}
            max={50_000}
            step={500}
            onChange={(budget) => setParams({ ...params, budget })}
            display={formatEuro(params.budget)}
          />

          <SliderInput
            label="ROAS attendu"
            value={params.roasDixiemes}
            min={10}
            max={80}
            step={1}
            onChange={(roasDixiemes) => setParams({ ...params, roasDixiemes })}
            display={formatRoas(params.roasDixiemes / 10)}
            hint="Chiffre d'affaires généré par euro investi"
          />

          <SliderInput
            label="Marge variable du catalogue"
            value={params.margePct}
            min={10}
            max={90}
            step={1}
            onChange={(margePct) => setParams({ ...params, margePct })}
            display={`${params.margePct} %`}
            hint={`Initialisé sur la médiane réelle du catalogue (${formatPercent(medianeMarge(data), { isRatio: true })})`}
          />
        </div>

        <div className="mt-5 border-t border-rule pt-4">
          <ScenarioBar controller={controller} />
        </div>
      </Card>

      <div className="space-y-3">
        <Card
          tone="glass"
          label="Projection"
          title="Rentabilité de la campagne"
          action={<SignalBadge signal={current.signal} />}
          caption={
            controller.compared
              ? `Comparaison avec « ${controller.compared.name} »`
              : 'Valeurs projetées à partir du ROAS et de la marge saisis'
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <ResultTile
              label="CA généré"
              value={formatEuroCompact(current.caGenere)}
              comparison={compared ? formatEuroCompact(compared.caGenere) : undefined}
              caption={`ROAS ${formatRoas(current.roas)}`}
            />
            <ResultTile
              label="Marge brute générée"
              value={formatEuroCompact(current.margeGeneree)}
              comparison={compared ? formatEuroCompact(compared.margeGeneree) : undefined}
              caption={`${params.margePct} % de marge`}
            />
            <ResultTile
              label="Profit net"
              value={`${current.profitNet >= 0 ? '+' : ''}${formatEuroCompact(current.profitNet)}`}
              comparison={
                compared
                  ? `${compared.profitNet >= 0 ? '+' : ''}${formatEuroCompact(compared.profitNet)}`
                  : undefined
              }
              caption="Marge générée moins le budget investi"
              signal={current.signal}
              emphasis
            />
            <ResultTile
              label="ROI publicitaire"
              value={formatPercent(current.roi, { isRatio: true, decimals: 0 })}
              comparison={
                compared ? formatPercent(compared.roi, { isRatio: true, decimals: 0 }) : undefined
              }
            />
          </div>
        </Card>

        {current.roasBreakEven !== null && (
          <Card label="Seuil" title="ROAS d'équilibre">
            <p className="tabular text-3xl font-semibold text-gold">
              {formatRoas(current.roasBreakEven)}
            </p>
            <p className="mt-1.5 text-[12px] text-ink-muted">
              En dessous de ce ROAS, la campagne consomme plus de marge qu&apos;elle n&apos;en
              génère. Le ROAS visé actuellement est de {formatRoas(current.roas)}.
            </p>

            <div className="mt-4">
              <div
                className="relative h-2 overflow-hidden rounded-full bg-white/[0.12]"
                role="img"
                aria-label={`ROAS visé ${formatRoas(current.roas)} sur une échelle allant jusqu'à ×8, seuil d'équilibre à ${formatRoas(current.roasBreakEven)}`}
              >
                <div
                  className={cn(
                    'h-full rounded-full',
                    current.profitable ? 'bg-gold-deep' : 'bg-critical',
                  )}
                  style={{ width: `${Math.min((current.roas / 8) * 100, 100)}%` }}
                />
              </div>
              <div className="relative h-3">
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-3 w-px bg-ink-muted"
                  style={{ left: `${Math.min((current.roasBreakEven / 8) * 100, 100)}%` }}
                />
              </div>
              <div className="mt-0.5 flex justify-between text-[10px] text-ink-faint">
                <span>{`ROAS visé ${formatRoas(current.roas)}`}</span>
                <span>{`Seuil ${formatRoas(current.roasBreakEven)}`}</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Nouveau produit
// ═══════════════════════════════════════════════════════════════════════════

interface ProduitParams {
  pvHt: number
  coutLabo: number
  coutPack: number
  logistique: number
  retours: number
  fraisPlateformePct: number
  quotePartPubPct: number
  volume: number
}

const PRODUIT_DEFAULTS: ProduitParams = {
  pvHt: 25,
  coutLabo: 4,
  coutPack: 2,
  logistique: 4,
  retours: 1,
  fraisPlateformePct: 3,
  quotePartPubPct: 15,
  volume: 100,
}

function computeProduit(params: ProduitParams, qpChargesFixesParUnite: number) {
  const fraisPlateforme = (params.pvHt * params.fraisPlateformePct) / 100
  const quotePartPub = (params.pvHt * params.quotePartPubPct) / 100

  const crc =
    params.coutLabo + params.coutPack + params.logistique + params.retours + fraisPlateforme + quotePartPub

  const margeVariableEur = params.pvHt - crc
  const margeVariablePct = params.pvHt > 0 ? margeVariableEur / params.pvHt : 0
  const margeNetteEur = margeVariableEur - qpChargesFixesParUnite
  const margeNettePct = params.pvHt > 0 ? margeNetteEur / params.pvHt : 0

  const caHT = params.pvHt * params.volume
  const margeVariableTotale = margeVariableEur * params.volume
  const seuilUnites =
    margeVariableEur > 0 ? Math.ceil(qpChargesFixesParUnite / margeVariableEur) : null

  const signal: Signal =
    margeVariablePct >= 0.6 ? 'positive' : margeVariablePct >= 0.45 ? 'caution' : 'critical'

  return {
    crc,
    margeVariableEur,
    margeVariablePct,
    margeNetteEur,
    margeNettePct,
    caHT,
    margeVariableTotale,
    seuilUnites,
    signal,
  }
}

function ProduitSimulator({ data }: { data: AllData }) {
  const [params, setParams] = useState<ProduitParams>(PRODUIT_DEFAULTS)
  const controller = useScenarios(params, PRODUIT_DEFAULTS, setParams)

  // Quote-part de charges fixes par unité, calculée sur le volume réel du catalogue.
  const qpChargesFixes = useMemo(() => {
    const volumeTotal = data.fichesCRC
      .filter((sku) => !sku.coutsIncomplets)
      .reduce((sum, sku) => sum + sku.volumeVendu, 0)
    return volumeTotal > 0 ? data.paramsCRC.chargesFixesMensuelles / volumeTotal : 0
  }, [data])

  const current = useMemo(() => computeProduit(params, qpChargesFixes), [params, qpChargesFixes])
  const compared = useMemo(
    () => (controller.compared ? computeProduit(controller.compared.params, qpChargesFixes) : null),
    [controller.compared, qpChargesFixes],
  )

  const cccShopify = data.tresoreriePilotage.cccShopify

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card label="Hypothèses" title="Structure de coûts">
        <div className="space-y-4">
          <SliderInput
            label="Prix de vente HT"
            value={params.pvHt}
            min={5}
            max={200}
            step={1}
            onChange={(pvHt) => setParams({ ...params, pvHt })}
            display={formatEuro(params.pvHt)}
          />
          <SliderInput
            label="Coût labo / production"
            value={params.coutLabo}
            min={0}
            max={60}
            step={0.5}
            onChange={(coutLabo) => setParams({ ...params, coutLabo })}
            display={formatEuro(params.coutLabo, 2)}
          />
          <SliderInput
            label="Packaging"
            value={params.coutPack}
            min={0}
            max={20}
            step={0.25}
            onChange={(coutPack) => setParams({ ...params, coutPack })}
            display={formatEuro(params.coutPack, 2)}
          />
          <SliderInput
            label="Logistique"
            value={params.logistique}
            min={0}
            max={20}
            step={0.25}
            onChange={(logistique) => setParams({ ...params, logistique })}
            display={formatEuro(params.logistique, 2)}
          />
          <SliderInput
            label="Coût des retours"
            value={params.retours}
            min={0}
            max={10}
            step={0.25}
            onChange={(retours) => setParams({ ...params, retours })}
            display={formatEuro(params.retours, 2)}
          />
          <SliderInput
            label="Frais de plateforme"
            value={params.fraisPlateformePct}
            min={0}
            max={30}
            step={0.5}
            onChange={(fraisPlateformePct) => setParams({ ...params, fraisPlateformePct })}
            display={`${params.fraisPlateformePct} %`}
          />
          <SliderInput
            label="Quote-part publicitaire"
            value={params.quotePartPubPct}
            min={0}
            max={40}
            step={0.5}
            onChange={(quotePartPubPct) => setParams({ ...params, quotePartPubPct })}
            display={`${params.quotePartPubPct} %`}
          />
          <SliderInput
            label="Volume mensuel projeté"
            value={params.volume}
            min={1}
            max={2000}
            step={10}
            onChange={(volume) => setParams({ ...params, volume })}
            display={`${params.volume.toLocaleString('fr-FR')} u.`}
          />
        </div>

        <div className="mt-5 border-t border-rule pt-4">
          <ScenarioBar controller={controller} />
        </div>
      </Card>

      <div className="space-y-3">
        <Card
          tone="glass"
          label="Projection"
          title="Rentabilité de la référence"
          action={<SignalBadge signal={current.signal} />}
          caption={
            controller.compared
              ? `Comparaison avec « ${controller.compared.name} »`
              : `Quote-part de charges fixes retenue : ${formatEuro(qpChargesFixes, 2)} par unité, calculée sur le volume réel du catalogue`
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <ResultTile
              label="Marge variable"
              value={formatPercent(current.margeVariablePct, { isRatio: true })}
              comparison={
                compared ? formatPercent(compared.margeVariablePct, { isRatio: true }) : undefined
              }
              caption={`${formatEuro(current.margeVariableEur, 2)} par unité`}
              signal={current.signal}
              emphasis
            />
            <ResultTile
              label="Marge nette"
              value={formatPercent(current.margeNettePct, { isRatio: true })}
              comparison={
                compared ? formatPercent(compared.margeNettePct, { isRatio: true }) : undefined
              }
              caption={`${formatEuro(current.margeNetteEur, 2)} par unité`}
              signal={current.margeNetteEur >= 0 ? 'positive' : 'critical'}
            />
            <ResultTile
              label="Coût de revient complet"
              value={formatEuro(current.crc, 2)}
              comparison={compared ? formatEuro(compared.crc, 2) : undefined}
            />
            <ResultTile
              label="CA mensuel projeté"
              value={formatEuroCompact(current.caHT)}
              comparison={compared ? formatEuroCompact(compared.caHT) : undefined}
              caption={`${params.volume.toLocaleString('fr-FR')} unités × ${formatEuro(params.pvHt)}`}
            />
          </div>
        </Card>

        <Card label="Repère" title="Position par rapport au catalogue">
          <p
            className={cn(
              'text-sm font-semibold',
              current.signal === 'positive'
                ? 'text-positive-ink'
                : current.signal === 'caution'
                  ? 'text-caution-ink'
                  : 'text-critical-ink',
            )}
          >
            {current.signal === 'positive'
              ? 'Au-dessus du seuil sain de 60 % de marge variable'
              : current.signal === 'caution'
                ? 'Zone limite : entre 45 % et 60 % de marge variable'
                : 'Sous le seuil de 45 % : marge fragile'}
          </p>

          <div className="mt-3">
            <div
              className="relative h-2 overflow-hidden rounded-full bg-white/[0.12]"
              role="img"
              aria-label={`Marge variable de ${formatPercent(current.margeVariablePct, { isRatio: true })}, seuils de référence à 45 % et 60 %`}
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  current.signal === 'positive'
                    ? 'bg-positive'
                    : current.signal === 'caution'
                      ? 'bg-caution'
                      : 'bg-critical',
                )}
                style={{
                  width: `${Math.min(Math.max(current.margeVariablePct * 100, 0), 100)}%`,
                }}
              />
            </div>
            <div className="relative h-2">
              <span aria-hidden="true" className="absolute top-0 h-2 w-px bg-ink-faint" style={{ left: '45%' }} />
              <span aria-hidden="true" className="absolute top-0 h-2 w-px bg-ink-faint" style={{ left: '60%' }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] text-ink-faint">
              <span>0 %</span>
              <span>45 %</span>
              <span>60 %</span>
              <span>100 %</span>
            </div>
          </div>

          {current.seuilUnites !== null && (
            <p className="mt-4 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-muted">
              Seuil de rentabilité estimé :{' '}
              <span className="tabular font-semibold text-ink">
                {`${current.seuilUnites.toLocaleString('fr-FR')} unités`}
              </span>{' '}
              par mois pour couvrir la quote-part de charges fixes, sur la base du catalogue actuel.
            </p>
          )}

          {cccShopify !== null && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              Pour mémoire, le délai d&apos;encaissement constaté sur Shopify est de{' '}
              {`${Math.round(cccShopify)} jours`} entre décaissement fournisseur et encaissement
              client.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
