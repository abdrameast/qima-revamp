import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isChargeCategory,
  caBudgetOverPeriod,
  caMensuel,
  caOverPeriod,
  caTotalAnnuel,
  channelMetrics,
  chargesOverPeriod,
  margeBrute,
  margeBruteOverPeriod,
  monthlySeries,
  produitsKpis,
  roiSignal,
  shopifyKpis,
  topSkusByCA,
  tresorerieActuelle,
  tresorerieFinDePeriode,
} from '../src/lib/compute'
import { parseAllWorkbooks } from '../src/lib/parse-excel'
import type { AllData } from '../src/lib/data-types'
import { buildAllWorkbooks, type FixtureOptions } from './fixtures/build-workbooks'

function load(options: FixtureOptions = {}): AllData {
  const workbooks = buildAllWorkbooks(options)
  const provenance = {
    fileName: 'fixture.xlsx',
    modifiedTime: '2026-08-18T10:00:00.000Z',
    sizeBytes: 0,
    contentHash: '',
    exported: false,
  }
  return parseAllWorkbooks({
    pilotage: { buffer: workbooks.pilotage, provenance },
    crc: { buffer: workbooks.crc, provenance },
    kpi: { buffer: workbooks.kpi, provenance },
  })
}

const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const data = load()

describe('invariants du chiffre d’affaires', () => {
  test('le CA annuel est net des remises', () => {
    const brut =
      data.dataMensuelle.lines['CA_Shopify'].total +
      data.dataMensuelle.lines['CA_TikTok'].total +
      data.dataMensuelle.lines['CA_Pharmacies'].total +
      data.dataMensuelle.lines['CA_Autres'].total
    const remises = data.dataMensuelle.lines['Remises_accordées'].total

    assert.equal(caTotalAnnuel(data), brut - remises)
  })

  test('la somme des mois égale le total annuel', () => {
    const mensuel = caMensuel(data).reduce((a, b) => a + b, 0)
    assert.equal(Math.round(mensuel), Math.round(caTotalAnnuel(data)!))
  })

  test('le CA sur l’exercice complet égale le CA annuel', () => {
    assert.equal(
      Math.round(caOverPeriod(data, ALL_MONTHS)!),
      Math.round(caTotalAnnuel(data)!),
    )
  })

  test('les périodes disjointes s’additionnent', () => {
    // Propriété d'additivité : T1 + T2 + T3 + T4 = exercice.
    const quarters = [
      caOverPeriod(data, [0, 1, 2])!,
      caOverPeriod(data, [3, 4, 5])!,
      caOverPeriod(data, [6, 7, 8])!,
      caOverPeriod(data, [9, 10, 11])!,
    ]
    const sum = quarters.reduce((a, b) => a + b, 0)
    assert.equal(Math.round(sum), Math.round(caOverPeriod(data, ALL_MONTHS)!))
  })

  test('journal vide : null, pas zéro', () => {
    const empty = load({ emptyJournal: true })
    assert.equal(caTotalAnnuel(empty), null)
    assert.equal(caOverPeriod(empty, ALL_MONTHS), null)
  })

  test('période vide : null', () => {
    assert.equal(caOverPeriod(data, []), null)
  })
})

describe('marge brute', () => {
  test('cohérence entre montant et pourcentage', () => {
    const marge = margeBrute(data)
    assert.ok(marge.eur !== null && marge.pct !== null)
    assert.equal(Math.round(marge.pct! * 10_000) / 10_000, Math.round((marge.eur! / caTotalAnnuel(data)!) * 10_000) / 10_000)
  })

  test('la marge est bornée par le chiffre d’affaires', () => {
    const marge = margeBrute(data)
    assert.ok(marge.eur! <= caTotalAnnuel(data)!)
    assert.ok(marge.pct! <= 1)
  })

  test('la version périodique coïncide sur l’exercice complet', () => {
    const annuel = margeBrute(data)
    const periode = margeBruteOverPeriod(data, ALL_MONTHS)
    assert.equal(Math.round(annuel.eur!), Math.round(periode.eur!))
  })

  test('sans chiffre d’affaires, aucune marge n’est inventée', () => {
    const empty = load({ emptyJournal: true })
    assert.deepEqual(margeBrute(empty), { eur: null, pct: null })
    assert.deepEqual(margeBruteOverPeriod(empty, ALL_MONTHS), { eur: null, pct: null })
  })
})

describe('trésorerie', () => {
  test('dernière valeur non nulle du poste de bilan', () => {
    const line = data.dataMensuelle.lines['Bilan_Trésorerie']
    assert.equal(tresorerieActuelle(data), line.monthly[11])
  })

  test('fin de période : dernière valeur à l’intérieur de la période', () => {
    const line = data.dataMensuelle.lines['Bilan_Trésorerie']
    assert.equal(tresorerieFinDePeriode(data, [0, 1, 2]), line.monthly[2])
  })

  test('aucune écriture : null', () => {
    assert.equal(tresorerieActuelle(load({ emptyJournal: true })), null)
    assert.equal(tresorerieFinDePeriode(data, []), null)
  })
})

describe('charges', () => {
  test('classification des catégories', () => {
    assert.equal(isChargeCategory('COGS_Packaging'), true)
    assert.equal(isChargeCategory('RH_Salaires'), true)
    assert.equal(isChargeCategory('CA_Shopify'), false)
    assert.equal(isChargeCategory('Remises_accordées'), false)
    assert.equal(isChargeCategory('Bilan_Trésorerie'), false)
  })

  test('les postes de bilan sont exclus des charges', () => {
    // Régression : « Bilan_Trésorerie » est un SOLDE, pas une charge.
    // L'additionner sur douze mois revenait à compter douze fois le même
    // solde — le total des charges dépassait de 540 700 € la somme de ses
    // propres lignes, et le résultat estimé passait de +76 k€ à −464 k€.
    const charges = chargesOverPeriod(data, ALL_MONTHS)!
    const bilan = data.dataMensuelle.lines['Bilan_Trésorerie']

    assert.ok(bilan, 'la fixture doit contenir une ligne de bilan')
    assert.ok(bilan.total > 0, 'la ligne de bilan doit être non nulle')
    assert.ok(
      charges < bilan.total,
      'le total des charges ne doit pas englober le poste de bilan',
    )
  })

  test('les charges excluent produits, remises et postes de bilan', () => {
    const charges = chargesOverPeriod(data, ALL_MONTHS)!
    const attendu = Object.entries(data.dataMensuelle.lines)
      .filter(([key]) => isChargeCategory(key))
      .reduce((sum, [, line]) => sum + line.total, 0)
    assert.equal(Math.round(charges), Math.round(attendu))
  })

  test('le total des charges égale la somme des postes affichés', () => {
    // Invariant de la page Budget : la ligne « Total » doit correspondre à
    // l'addition des lignes au-dessus d'elle, sinon le tableau se contredit.
    const groups = [
      (k: string) => k.startsWith('COGS_'),
      (k: string) => k.startsWith('Pub_') || k.startsWith('Marketing_') || k.startsWith('Ads_'),
      (k: string) => k.startsWith('Logistique') || k === 'Transport_ventes',
      (k: string) => k.startsWith('CF_') || k.startsWith('Frais_Fixes_'),
      (k: string) => k.startsWith('RH_') || k.startsWith('Salaires_') || k.startsWith('Personnel_'),
      (k: string) => k.startsWith('RD_') || k.startsWith('Innovation_') || k.startsWith('RnD_'),
    ]

    const sommeDesPostes = Object.entries(data.dataMensuelle.lines)
      .filter(([key]) => groups.some((matches) => matches(key)))
      .reduce((sum, [, line]) => sum + line.total, 0)

    assert.equal(
      Math.round(chargesOverPeriod(data, ALL_MONTHS)!),
      Math.round(sommeDesPostes),
    )
  })

  test('journal vide : null', () => {
    assert.equal(chargesOverPeriod(load({ emptyJournal: true }), ALL_MONTHS), null)
  })
})

describe('budget', () => {
  test('le budget est disponible sur l’exercice', () => {
    assert.ok(caBudgetOverPeriod(data, ALL_MONTHS)! > 0)
  })

  test('série mensuelle : réalisé et budget alignés sur les mêmes mois', () => {
    const series = monthlySeries(data, ALL_MONTHS)
    assert.equal(series.length, 12)
    assert.ok(series.every((point) => point.label !== ''))
    assert.ok(series.some((point) => point.budget !== null))
  })

  test('un mois sans écriture vaut null, pas zéro — la courbe s’interrompt', () => {
    const empty = load({ emptyJournal: true })
    const series = monthlySeries(empty, ALL_MONTHS)
    assert.ok(series.every((point) => point.reel === null))
  })
})

describe('canaux', () => {
  const channels = channelMetrics(data)

  test('les trois canaux sont produits', () => {
    assert.equal(channels.length, 3)
    assert.deepEqual(channels.map((c) => c.key), ['dtc', 'tiktok', 'pharmacie'])
  })

  test('le coût par euro cumule commission, logistique rapportée au panier et RFA', () => {
    const dtc = channels.find((c) => c.key === 'dtc')!
    const p = data.canauxParams
    const attendu = p.commission.dtc! + p.logistiqueParCommande.dtc! / p.panierMoyen.dtc!
    assert.equal(Math.round(dtc.coutParEuroCA! * 10_000), Math.round(attendu * 10_000))
  })

  test('la pharmacie supporte en plus la remise de fin d’année', () => {
    const pharma = channels.find((c) => c.key === 'pharmacie')!
    assert.ok(pharma.coutParEuroCA! > data.canauxParams.commission.pharmacie!)
  })

  test('le CAC n’est renseigné que pour le DTC', () => {
    assert.ok(channels.find((c) => c.key === 'dtc')!.cac !== null)
    assert.equal(channels.find((c) => c.key === 'tiktok')!.cac, null)
    assert.equal(channels.find((c) => c.key === 'pharmacie')!.cac, null)
  })

  test('seuils du signal ROI', () => {
    assert.equal(roiSignal(2.5), 'green')
    assert.equal(roiSignal(2), 'green')
    assert.equal(roiSignal(1.99), 'amber')
    assert.equal(roiSignal(1.5), 'amber')
    assert.equal(roiSignal(1.49), 'red')
    assert.equal(roiSignal(null), null)
  })
})

describe('produits', () => {
  test('les références incomplètes sont comptées mais exclues de la médiane', () => {
    const kpis = produitsKpis(data)
    assert.equal(kpis.nbSkus, 10)
    assert.equal(kpis.nbIncomplets, 2)
    assert.equal(kpis.nbComplets, 8)
    assert.equal(kpis.nbComplets + kpis.nbIncomplets, kpis.nbSkus)
  })

  test('la médiane est encadrée par les marges observées', () => {
    const kpis = produitsKpis(data)
    const marges = data.fichesCRC.filter((s) => !s.coutsIncomplets).map((s) => s.margeVariablePct)
    assert.ok(kpis.margeVariableMediane! >= Math.min(...marges))
    assert.ok(kpis.margeVariableMediane! <= Math.max(...marges))
  })

  test('sans référence complète, aucune médiane n’est inventée', () => {
    const kpis = produitsKpis(load({ incompleteCosts: true }))
    assert.equal(kpis.margeVariableMediane, null)
    assert.equal(kpis.nbComplets, 0)
  })

  test('charges fixes annuelles = mensuelles × 12', () => {
    const kpis = produitsKpis(data)
    assert.equal(kpis.chargesFixesAnnuelles, kpis.chargesFixesMensuelles * 12)
  })

  test('le classement par CA est décroissant et borné', () => {
    const top = topSkusByCA(data, 5)
    assert.equal(top.length, 5)
    for (let i = 1; i < top.length; i++) {
      assert.ok(top[i - 1].caHT >= top[i].caHT, 'classement non décroissant')
    }
  })

  test('une référence à coûts incomplets n’affiche pas de marge', () => {
    const top = topSkusByCA(data, 10)
    for (const sku of top) {
      if (sku.coutsIncomplets) assert.equal(sku.margePct, null)
    }
  })
})

describe('KPI Shopify', () => {
  test('taux de réachat déduit des commandes et des nouveaux clients', () => {
    const kpis = shopifyKpis(data)
    const p = data.paramsManuels
    assert.equal(
      kpis.tauxReachat,
      (p.nbCommandesShopify - p.nbNouveauxClients) / p.nbCommandesShopify,
    )
  })

  test('le taux de réachat reste dans [0, 1]', () => {
    const kpis = shopifyKpis(data)
    assert.ok(kpis.tauxReachat! >= 0 && kpis.tauxReachat! <= 1)
  })

  test('plus de nouveaux clients que de commandes : incohérence, donc null', () => {
    const inconsistent = load()
    inconsistent.paramsManuels.nbNouveauxClients = inconsistent.paramsManuels.nbCommandesShopify + 10
    assert.equal(shopifyKpis(inconsistent).tauxReachat, null)
  })

  test('saisie KPI absente : tous les indicateurs sont nuls', () => {
    const kpis = shopifyKpis(load({ emptyKpi: true }))
    assert.equal(kpis.tauxReachat, null)
    assert.equal(kpis.cac, null)
    assert.equal(kpis.ltvCacRatio, null)
  })

  test('le ratio LTV/CAC correspond au quotient des deux', () => {
    const kpis = shopifyKpis(data)
    assert.equal(
      Math.round(kpis.ltvCacRatio! * 1000),
      Math.round((data.calculsAuto.day90ContributionLtv / data.calculsAuto.cacFullyLoaded) * 1000),
    )
  })
})
