import * as XLSX from 'xlsx'

/**
 * Générateur de classeurs synthétiques.
 *
 * ⚠️ Toutes les valeurs produites ici sont **inventées** et servent uniquement
 * aux tests et au développement local. Aucun classeur confidentiel ni aucune
 * donnée de production n'est versionné dans ce dépôt.
 *
 * Ce module est la référence exécutable de la structure attendue des sources :
 * si le parsing change, ces fixtures doivent changer aussi, et les tests
 * échouent tant que les deux ne concordent pas.
 */

export type Row = (string | number | null)[]

export const MONTHS = [
  'janv-26', 'févr-26', 'mars-26', 'avr-26', 'mai-26', 'juin-26',
  'juil-26', 'août-26', 'sept-26', 'oct-26', 'nov-26', 'déc-26',
]

function sheetFromRows(rows: Row[]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows)
}

function workbookFrom(sheets: Record<string, Row[]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, sheetFromRows(rows), name)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/** Répartit un total annuel sur douze mois, de façon déterministe. */
function spread(total: number, shape: number[] = []): number[] {
  const weights = MONTHS.map((_, i) => shape[i] ?? 1)
  const sum = weights.reduce((a, b) => a + b, 0)
  return weights.map((w) => Math.round((total * w) / sum))
}

function lineRow(label: string, category: string, monthly: number[]): Row {
  return [label, category, ...monthly, monthly.reduce((a, b) => a + b, 0)]
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface FixtureOptions {
  /** Journal comptable vide — état « en attente du grand livre ». */
  emptyJournal?: boolean
  /** Aucune cohorte de rotation de stock saisie. */
  emptyStockRotation?: boolean
  /** Aucune saisie KPI DTC. */
  emptyKpi?: boolean
  /** Certains SKU sans coût labo → marges non représentatives. */
  incompleteCosts?: boolean
  /** Onglet BFR entièrement vide. */
  emptyBfr?: boolean
}

// ---------------------------------------------------------------------------
// Classeur de pilotage — Honeylang_PF_v3.xlsx
// ---------------------------------------------------------------------------

const SEASONALITY = [0.7, 0.7, 0.9, 1.0, 1.1, 1.3, 1.0, 0.8, 1.1, 1.2, 1.6, 1.4]

export function buildPilotageRows(options: FixtureOptions = {}): Record<string, Row[]> {
  const empty = options.emptyJournal === true
  const z = MONTHS.map(() => 0)

  const dataMensuelle: Row[] = [
    ['Journal comptable mensuel — DONNÉES SYNTHÉTIQUES', null],
    ['Poste', 'Cat.', ...MONTHS, 'TOTAL'],
    lineRow('CA Shopify', 'CA_Shopify', empty ? z : spread(214_000, SEASONALITY)),
    lineRow('CA TikTok Shop', 'CA_TikTok', empty ? z : spread(61_000, SEASONALITY)),
    lineRow('CA Pharmacies', 'CA_Pharmacies', empty ? z : spread(88_000)),
    lineRow('CA Autres', 'CA_Autres', empty ? z : spread(6_000)),
    lineRow('Remises accordées', 'Remises_accordées', empty ? z : spread(9_000, SEASONALITY)),
    [null, null],
    lineRow('Sous-traitance labo', 'COGS_Sous-traitant', empty ? z : spread(78_000, SEASONALITY)),
    lineRow('Packaging', 'COGS_Packaging', empty ? z : spread(21_000, SEASONALITY)),
    lineRow('Transport sur achats', 'COGS_Transport_achats', empty ? z : spread(7_400)),
    lineRow('Variation de stocks', 'COGS_Variation_stocks', empty ? z : spread(4_100)),
    [null, null],
    lineRow('Publicité Meta', 'Pub_Meta', empty ? z : spread(34_000, SEASONALITY)),
    lineRow('Publicité TikTok', 'Pub_TikTok', empty ? z : spread(18_000, SEASONALITY)),
    lineRow('Logistique & expédition', 'Logistique_Expedition', empty ? z : spread(26_000)),
    lineRow('Transport sur ventes', 'Transport_ventes', empty ? z : spread(9_200)),
    lineRow('Loyer & charges', 'CF_Loyer', empty ? z : spread(14_400)),
    lineRow('Abonnements SaaS', 'CF_Abonnements', empty ? z : spread(5_600)),
    lineRow('Honoraires comptable', 'CF_Honoraires', empty ? z : spread(6_000)),
    lineRow('Salaires', 'RH_Salaires', empty ? z : spread(52_000)),
    lineRow('Tests laboratoire', 'RD_Tests', empty ? z : spread(8_000)),
    [null, null],
    lineRow(
      'Trésorerie (bilan)',
      'Bilan_Trésorerie',
      empty ? z : [41_000, 38_500, 36_200, 39_800, 42_100, 47_600, 44_300, 39_900, 43_500, 48_200, 58_400, 61_200],
    ),
  ]

  const bfrEmpty = options.emptyBfr === true
  const bfrValue = (base: number, drift: number) =>
    bfrEmpty ? MONTHS.map(() => null) : MONTHS.map((_, i) => Math.round(base + drift * i))

  const bfr: Row[] = [
    ['Besoin en fonds de roulement — DONNÉES SYNTHÉTIQUES', null],
    ['Formule : BFR = Stocks + Créances clients − Dettes fournisseurs', null],
    [null, ...MONTHS],
    ['Stocks (3xx)', ...bfrValue(52_000, 900)],
    ['Créances clients (411)', ...bfrValue(28_500, 420)],
    ['Dettes fournisseurs (401)', ...bfrValue(19_000, 260)],
    ['BFR = Stocks + Créances − Dettes', ...bfrValue(61_500, 1_060)],
    ['Jours de stock', ...bfrValue(47, 0)],
    ['Jours clients', ...bfrValue(31, 0)],
    ['Jours fournisseurs', ...bfrValue(22, 0)],
    ['BFR en jours de CA', ...bfrValue(56, 0)],
  ]

  const stockRotation: Row[] = options.emptyStockRotation
    ? [
        ['Rotation des stocks — DONNÉES SYNTHÉTIQUES', null],
        ['Trimestre', 'Stock actif', 'Stock lent', 'Stock dormant', 'Total stock'],
        ['T1 2026', 0, 0, 0, 0],
        ['T2 2026', 0, 0, 0, 0],
      ]
    : [
        ['Rotation des stocks — DONNÉES SYNTHÉTIQUES', null],
        ['Trimestre', 'Stock actif', 'Stock lent', 'Stock dormant', 'Total stock'],
        ['T1 2026', 38_400, 9_200, 4_100, 51_700],
        ['T2 2026', 41_100, 8_400, 5_300, 54_800],
        ['T3 2026', 0, 0, 0, 0],
        ['Contrôle écart', 0, 0, 0, 0],
        ['% dormant', 0.08, null, null, null],
      ]

  const budget: Row[] = [
    ['Budget 12 mois — DONNÉES SYNTHÉTIQUES', null],
    ['Poste', 'Cat.', ...MONTHS, 'TOTAL'],
    [
      'Statut',
      'Statut',
      ...MONTHS.map((_, i) => (i <= 4 ? 'RÉALISÉ' : 'PRÉVISIONNEL')),
      null,
    ],
    lineRow('CA Shopify', 'CA_Shopify', spread(230_000, SEASONALITY)),
    lineRow('CA TikTok Shop', 'CA_TikTok', spread(72_000, SEASONALITY)),
    lineRow('CA Pharmacies', 'CA_Pharmacies', spread(95_000)),
    lineRow('CA Autres', 'CA_Autres', spread(8_000)),
    lineRow('Remises accordées', 'Remises_accordées', spread(11_000, SEASONALITY)),
    lineRow('Sous-traitance labo', 'COGS_Sous-traitant', spread(82_000, SEASONALITY)),
    lineRow('Packaging', 'COGS_Packaging', spread(23_000, SEASONALITY)),
    lineRow('Transport sur achats', 'COGS_Transport_achats', spread(8_000)),
    lineRow('Variation de stocks', 'COGS_Variation_stocks', spread(4_000)),
    lineRow('Publicité Meta', 'Pub_Meta', spread(36_000, SEASONALITY)),
    lineRow('Publicité TikTok', 'Pub_TikTok', spread(20_000, SEASONALITY)),
    lineRow('Logistique & expédition', 'Logistique_Expedition', spread(27_000)),
    lineRow('Transport sur ventes', 'Transport_ventes', spread(9_000)),
    lineRow('Loyer & charges', 'CF_Loyer', spread(14_400)),
    lineRow('Abonnements SaaS', 'CF_Abonnements', spread(6_000)),
    lineRow('Honoraires comptable', 'CF_Honoraires', spread(6_000)),
    lineRow('Salaires', 'RH_Salaires', spread(54_000)),
    lineRow('Tests laboratoire', 'RD_Tests', spread(9_000)),
  ]

  const canauxParams: Row[] = [
    ['Paramètres canaux — DONNÉES SYNTHÉTIQUES', 'DTC Shopify', 'TikTok Shop', 'Pharmacie'],
    ['Commission plateforme', 0.029, 0.05, 0.35],
    ['Coût logistique par commande', 4.2, 4.8, 3.5],
    ['RFA distributeur', null, null, 0.05],
    ['DSO — délai de paiement', 2, 12, 62],
    ['DPO — délai fournisseurs', 30, 30, 30],
    ['Délai expédition', 2, 3, 5],
    ['ROAS historique', 3.1, 2.4, null],
    ['Taux de retour', 0.06, 0.09, 0.02],
    ['Panier moyen', 38, 32, 240],
    ['Benchmark marge brute', 0.68, 0.62, 0.45],
    ['Mix canal', 0.56, 0.16, 0.28],
    ['Seuil de sécurité trésorerie', 5000, null, null],
  ]

  // Onglet à disposition fixe : les coordonnées comptent, pas les libellés.
  const treso: Row[] = [
    ['Pilotage de trésorerie — DONNÉES SYNTHÉTIQUES'],
    [],
    [],
    [],
    ['Indicateur', null, 'Valeur'],
    ['Solde de trésorerie', null, 61_200],
    ['Charges fixes mensuelles', null, 18_900],
    ['Runway (mois)', null, 3.2],
    ['Statut runway', null, 'Vigilance'],
    [],
    [],
    [],
    ['Canal', null, null, null, null, 'CCC (jours)'],
    ['DTC Shopify', null, null, null, null, 9],
    ['TikTok Shop', null, null, null, null, 21],
    ['Pharmacie', null, null, null, null, 74],
    [],
    ['CCC consolidé', null, 31],
    [],
    [],
    [],
    ['BFR actuel', null, 61_500],
    ['BFR en jours de CA', null, 56],
    ['Part du CA pharmacie', null, 0.28],
    ['Cash immobilisé pharmacie', null, 27_400],
  ]

  return {
    '📊 DATA_MENSUELLE': dataMensuelle,
    '⚖️ BFR': bfr,
    '📦 STOCK_ROTATION': stockRotation,
    '💰 BUDGET_12M': budget,
    '⚙️ CANAUX_PARAMS': canauxParams,
    '💧 TRESORERIE_PILOTAGE': treso,
  }
}

// ---------------------------------------------------------------------------
// Classeur CRC — QIMA_Honeylang_Fiches_CRC_v5.xlsx
// ---------------------------------------------------------------------------

interface SkuSpec {
  nom: string
  pvHt: number
  volume: number
  labo: number | null
  pack: number
}

const SKUS: SkuSpec[] = [
  { nom: 'Sérum Éclat Miel 30 ml', pvHt: 42, volume: 1_840, labo: 7.4, pack: 2.1 },
  { nom: 'Crème Nuit Régénérante 50 ml', pvHt: 38, volume: 1_420, labo: 6.8, pack: 2.4 },
  { nom: 'Baume Lèvres Propolis 15 ml', pvHt: 14, volume: 3_260, labo: 2.1, pack: 0.9 },
  { nom: 'Huile Corps Nourrissante 100 ml', pvHt: 29, volume: 980, labo: 5.2, pack: 1.8 },
  { nom: 'Masque Purifiant Argile 75 ml', pvHt: 24, volume: 760, labo: 4.4, pack: 1.6 },
  { nom: 'Gommage Sucre & Miel 200 ml', pvHt: 21, volume: 540, labo: 3.9, pack: 1.7 },
  { nom: 'Coffret Découverte Miel', pvHt: 68, volume: 310, labo: null, pack: 4.2 },
  { nom: 'Lait Démaquillant Doux 200 ml', pvHt: 19, volume: 420, labo: 3.1, pack: 1.4 },
  { nom: 'Eau Florale Tonique 150 ml', pvHt: 16, volume: 280, labo: 2.6, pack: 1.1 },
  { nom: 'Savon Surgras Miel 100 g', pvHt: 9, volume: 220, labo: null, pack: 0.6 },
]

function benchmarkFor(margePct: number): string {
  if (margePct >= 0.6) return '✅ OK'
  if (margePct >= 0.45) return '⚠️ Limite'
  return '🔴 Fragile'
}

export function buildCrcRows(options: FixtureOptions = {}): Record<string, Row[]> {
  const chargesFixesMensuelles = 18_900
  const caTotal = SKUS.reduce((a, s) => a + s.pvHt * s.volume, 0)

  const header: Row = [
    'PRODUIT', 'PV TTC', 'PV HT', 'Volume vendu', 'Coût labo', 'Packaging',
    'Logistique', 'Coût retours', 'Frais plateforme', 'Quote-part pub',
    'Réservé', 'Réservé', 'CRC total', 'Marge var. €', 'Marge var. %',
    'QP charges fixes', 'Marge nette €', 'Marge nette %', 'Benchmark',
  ]

  const rows: Row[] = [
    ['Fiches coût de revient complet — DONNÉES SYNTHÉTIQUES', null],
    header,
  ]

  for (const sku of SKUS) {
    // `incompleteCosts` force l'absence de coût labo sur tous les SKU, pour
    // exercer l'état « marge non représentative ».
    const labo = options.incompleteCosts ? null : sku.labo
    const logistique = 3.4
    const retours = sku.pvHt * 0.02
    const plateforme = sku.pvHt * 0.029
    const pub = sku.pvHt * 0.08

    const crcTotal = (labo ?? 0) + sku.pack + logistique + retours + plateforme + pub
    const margeEur = sku.pvHt - crcTotal
    const margePct = margeEur / sku.pvHt
    // Charges fixes réparties au prorata du chiffre d'affaires, pas du volume :
    // une répartition par unité écraserait mécaniquement les petits prix et
    // produirait des marges nettes absurdes sur les références d'entrée de gamme.
    const qpCF = (chargesFixesMensuelles * 12 * sku.pvHt) / caTotal
    const margeNetteEur = margeEur - qpCF
    const margeNettePct = margeNetteEur / sku.pvHt

    rows.push([
      sku.nom,
      Math.round(sku.pvHt * 1.2 * 100) / 100,
      sku.pvHt,
      sku.volume,
      labo,
      sku.pack,
      logistique,
      Math.round(retours * 100) / 100,
      Math.round(plateforme * 100) / 100,
      Math.round(pub * 100) / 100,
      null,
      null,
      Math.round(crcTotal * 100) / 100,
      Math.round(margeEur * 100) / 100,
      Math.round(margePct * 10_000) / 10_000,
      Math.round(qpCF * 100) / 100,
      Math.round(margeNetteEur * 100) / 100,
      Math.round(margeNettePct * 10_000) / 10_000,
      labo === null ? '' : benchmarkFor(margePct),
    ])
  }

  const parametres: Row[] = [
    ['Paramètres CRC — DONNÉES SYNTHÉTIQUES', null],
    ['% ventes Shopify', 0.56],
    ['% ventes TikTok', 0.16],
    ['% ventes Pharmacies', 0.28],
    ['Commission Shopify', 0.029],
    ['Commission TikTok', 0.05],
    ['Commission Pharmacie', 0.35],
    ['Taux de retour moyen Shopify', 0.06],
    ["Coût traitement d'un retour", 4.8],
    [null, null],
    ['CHARGES FIXES MENSUELLES', null],
    ['Poste de charge', 'Montant'],
    ['Loyer & charges locatives', 1_200],
    ['Abonnements & outils SaaS', 470],
    ['Honoraires comptable', 500],
    ['Assurances', 180],
    ['Salaires & cotisations', 4_330],
    ['Frais bancaires', 120],
    ['Marketing socle', 12_100],
    ['TOTAL CHARGES FIXES', 18_900],
  ]

  return { '📊 FICHES CRC': rows, '⚙️ PARAMÈTRES': parametres }
}

// ---------------------------------------------------------------------------
// Classeur KPI DTC — Honeylang_KPI_DTC_v1.xlsx
// ---------------------------------------------------------------------------

export function buildKpiRows(options: FixtureOptions = {}): Record<string, Row[]> {
  const empty = options.emptyKpi === true

  const caShopify = empty ? 0 : 21_400
  const caTiktok = empty ? 0 : 6_100
  const caPharma = empty ? 0 : 8_800
  const nbCmdShopify = empty ? 0 : 563
  const nbNouveaux = empty ? 0 : 391
  const caTotal = caShopify + caTiktok + caPharma
  const cac = empty ? 0 : 18.4
  const ltvGross = empty ? 0 : 74.2
  const ltvContribution = empty ? 0 : 46.9

  const paramsManuels: Row[] = [
    ['Saisie mensuelle — DONNÉES SYNTHÉTIQUES', null, null],
    ['Période analysée', 5, 2026],
    ['CA réel Shopify', caShopify],
    ['CA réel TikTok', caTiktok],
    ['CA réel Pharmacies', caPharma],
    ['Nb commandes Shopify', nbCmdShopify],
    ['Nb commandes TikTok', empty ? 0 : 174],
    ['Nb nouveaux clients', nbNouveaux],
    ['Nb retours', empty ? 0 : 34],
    ['Day 90 LTV brut', ltvGross],
    ['Profit brut sur clients 90j', empty ? 0 : 29_000],
    ['Profit contribution 90j', empty ? 0 : 18_350],
    ['CA mois N-1', empty ? 0 : 19_800],
  ]

  const calculsAuto: Row[] = [
    ['Calculs automatiques — DONNÉES SYNTHÉTIQUES', null],
    ['CA TOTAL CONSOLIDÉ', caTotal],
    ['Marge brute (%)', empty ? 0 : 0.641],
    ['Marge de contribution (%)', empty ? 0 : 0.412],
    ['AOV', empty ? 0 : 38.01],
    ['CAC Fully Loaded', cac],
    ['Day 90 Gross LTV', ltvGross],
    ['Day 90 Contribution Profit LTV', ltvContribution],
  ]

  return { '📥 PARAMS_MANUELS': paramsManuels, '⚙️ CALCULS_AUTO': calculsAuto }
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

export function buildPilotageWorkbook(options: FixtureOptions = {}): Buffer {
  return workbookFrom(buildPilotageRows(options))
}

export function buildCrcWorkbook(options: FixtureOptions = {}): Buffer {
  return workbookFrom(buildCrcRows(options))
}

export function buildKpiWorkbook(options: FixtureOptions = {}): Buffer {
  return workbookFrom(buildKpiRows(options))
}

export function buildAllWorkbooks(
  options: FixtureOptions = {},
): { pilotage: Buffer; crc: Buffer; kpi: Buffer } {
  return {
    pilotage: buildPilotageWorkbook(options),
    crc: buildCrcWorkbook(options),
    kpi: buildKpiWorkbook(options),
  }
}

/** Construit un classeur arbitraire — utile pour tester les cas dégradés. */
export function buildCustomWorkbook(sheets: Record<string, Row[]>): Buffer {
  return workbookFrom(sheets)
}
