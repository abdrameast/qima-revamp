import type { WorkbookKey } from './env'
import { AppError } from './errors'
import {
  cellNumber,
  cellText,
  loadWorkbook,
  sheet,
  type Cell,
  type Grid,
} from './workbook'
import type {
  AllData,
  BFRData,
  BudgetData,
  BudgetLine,
  CalculsAuto,
  CanauxParams,
  ChannelValues,
  DataMensuelle,
  FicheCRC,
  ParamsCRC,
  ParamsManuels,
  PLLine,
  StockRotation,
  TresoreriePilotage,
  WorkbookProvenance,
} from './data-types'

/**
 * Extraction des données métier depuis les grilles de cellules.
 *
 * Ces fonctions sont **pures** : elles prennent une grille et rendent une
 * structure typée, sans I/O ni état global. C'est ce qui les rend testables
 * avec des fixtures synthétiques.
 *
 * ⚠️ La logique métier, les correspondances d'onglets, les index de colonnes
 * et les libellés recherchés sont repris **à l'identique** de l'implémentation
 * d'origine. Les seules évolutions sont le typage (suppression de `any`), la
 * lecture unique de chaque classeur, et la distinction explicite entre
 * « valeur absente » et « zéro ».
 */

// ---------------------------------------------------------------------------
// Aides de lecture
// ---------------------------------------------------------------------------

const num = cellNumber
const txt = cellText

/** Valeur numérique avec repli à 0 — pour les postes où l'absence vaut zéro. */
function num0(value: Cell): number {
  return num(value) ?? 0
}

function row(grid: Grid, index: number): Cell[] {
  return grid[index] ?? []
}

function findRowIndex(grid: Grid, predicate: (r: Cell[]) => boolean): number {
  for (let i = 0; i < grid.length; i++) {
    if (predicate(row(grid, i))) return i
  }
  return -1
}

/** Première ligne dont la colonne 0 contient `fragment` (insensible à la casse). */
function findRowByLabel(grid: Grid, fragment: string): Cell[] | null {
  const lower = fragment.toLowerCase()
  const idx = findRowIndex(grid, (r) => txt(r[0]).toLowerCase().includes(lower))
  return idx >= 0 ? grid[idx] : null
}

/**
 * Idem, mais en démarrant à `startIdx`.
 * Évite de capter une ligne de titre ou de formule située au-dessus des données.
 */
function findRowByLabelAfter(grid: Grid, fragment: string, startIdx: number): Cell[] | null {
  const lower = fragment.toLowerCase()
  for (let i = Math.max(0, startIdx); i < grid.length; i++) {
    if (txt(row(grid, i)[0]).toLowerCase().includes(lower)) return grid[i]
  }
  return null
}

/**
 * Collecte les libellés de mois d'une ligne d'en-tête à partir d'une colonne.
 * S'arrête à une cellule vide, à une colonne TOTAL/MOY, ou à un libellé déjà vu
 * (certains classeurs répètent un mois avant la colonne de total).
 */
function collectMonths(header: Cell[], start: number): string[] {
  const months: string[] = []
  const seen = new Set<string>()
  for (let c = start; c < header.length; c++) {
    const label = txt(header[c])
    if (!label) break
    if (/total|moy/i.test(label)) break
    if (seen.has(label)) break
    seen.add(label)
    months.push(label)
  }
  return months
}

// ---------------------------------------------------------------------------
// DATA_MENSUELLE
// ---------------------------------------------------------------------------

function extractMonthsHeader(grid: Grid): {
  headerIdx: number
  monthStart: number
  months: string[]
} {
  const headerIdx = findRowIndex(grid, (r) => txt(r[1]) === 'Cat.')
  if (headerIdx < 0) return { headerIdx: -1, monthStart: 2, months: [] }
  return { headerIdx, monthStart: 2, months: collectMonths(grid[headerIdx], 2) }
}

export function parseDataMensuelle(grid: Grid): DataMensuelle {
  const { headerIdx, monthStart, months } = extractMonthsHeader(grid)
  const lines: Record<string, PLLine> = {}

  if (headerIdx < 0) return { months: [], lines: {} }

  const totalCol = monthStart + months.length

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = row(grid, i)
    const category = txt(r[1])
    if (!category) continue // séparateurs et lignes sans catégorie

    const monthly = months.map((_, idx) => num0(r[monthStart + idx]))
    const total = num(r[totalCol]) ?? monthly.reduce((a, b) => a + b, 0)

    lines[category] = { label: txt(r[0]), category, monthly, total }
  }

  return { months, lines }
}

// ---------------------------------------------------------------------------
// BFR
// ---------------------------------------------------------------------------

export function parseBFR(grid: Grid): BFRData {
  // Ligne d'en-tête réelle : colonne 0 vide + cellules de mois.
  const headerIdx = findRowIndex(
    grid,
    (r) => !txt(r[0]) && r.some((c) => /(-2[0-9])$/.test(txt(c))),
  )

  let monthStart = 1
  if (headerIdx >= 0) {
    const header = grid[headerIdx]
    for (let c = 1; c < header.length; c++) {
      if (/(-2[0-9])$/.test(txt(header[c]))) {
        monthStart = c
        break
      }
    }
  }

  const months = headerIdx >= 0 ? collectMonths(grid[headerIdx], monthStart) : []

  const extractRow = (fragment: string): (number | null)[] => {
    const r = findRowByLabelAfter(grid, fragment, headerIdx + 1)
    if (!r) return months.map(() => null)
    return months.map((_, idx) => num(r[monthStart + idx]))
  }

  return {
    months,
    stocks: extractRow('Stocks (3xx)'),
    creancesClients: extractRow('Créances clients (411)'),
    dettesFournisseurs: extractRow('Dettes fournisseurs (401)'),
    bfrTotal: extractRow('BFR ='),
    joursStock: extractRow('Jours de stock'),
    joursClients: extractRow('Jours clients'),
    joursFournisseurs: extractRow('Jours fournisseurs'),
    bfrEnJoursCA: extractRow('BFR en jours'),
  }
}

// ---------------------------------------------------------------------------
// STOCK_ROTATION
// ---------------------------------------------------------------------------

export function parseStockRotation(grid: Grid): StockRotation[] {
  const result: StockRotation[] = []

  const headerIdx = findRowIndex(
    grid,
    (r) =>
      txt(r[0]).toLowerCase().includes('trimestre') ||
      r.some((c) => /T[1-4]\s*20/.test(txt(c))),
  )
  const start = headerIdx >= 0 ? headerIdx + 1 : 1

  // Lignes de contrôle / synthèse — ce ne sont pas des cohortes.
  const isControlRow = (label: string): boolean => {
    const l = label.toLowerCase()
    return (
      l.includes('contrôle') ||
      l.includes('controle') ||
      l.includes('écart') ||
      l.includes('ecart') ||
      l.includes('synthèse') ||
      l.includes('synthese') ||
      l.includes('total stock') ||
      l.startsWith('%')
    )
  }

  for (let i = start; i < grid.length; i++) {
    const r = row(grid, i)
    const trimestre = txt(r[0])
    if (!trimestre) continue
    if (isControlRow(trimestre)) continue

    const actif = num(r[1])
    const lent = num(r[2])
    const dormant = num(r[3])
    if (actif === null && lent === null && dormant === null) continue

    const totalStock = num(r[4]) ?? (actif ?? 0) + (lent ?? 0) + (dormant ?? 0)

    // Cohortes non encore saisies : toutes valeurs à zéro.
    if ((actif ?? 0) === 0 && (lent ?? 0) === 0 && (dormant ?? 0) === 0 && totalStock === 0) {
      continue
    }

    result.push({
      trimestre,
      stockActif: actif ?? 0,
      stockLent: lent ?? 0,
      stockDormant: dormant ?? 0,
      totalStock,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// BUDGET_12M
// ---------------------------------------------------------------------------

export function parseBudget(grid: Grid): BudgetData {
  const { headerIdx, monthStart, months } = extractMonthsHeader(grid)
  const lines: Record<string, BudgetLine> = {}

  if (headerIdx < 0) return { months: [], lines: {}, realisedUntil: null }

  const totalCol = monthStart + months.length

  // Ligne « Statut » : contient RÉALISÉ / PRÉVISIONNEL dans les colonnes de mois.
  let realisedUntil: string | null = null
  const scanLimit = Math.min(headerIdx + 15, grid.length)
  for (let i = headerIdx + 1; i < scanLimit; i++) {
    const r = row(grid, i)
    const hasStatut = r.some((c) => /réalis[ée]|réel|realise/i.test(txt(c)))
    if (hasStatut) {
      for (let m = months.length - 1; m >= 0; m--) {
        if (/réalis[ée]|réel|realise/i.test(txt(r[monthStart + m]))) {
          realisedUntil = months[m]
          break
        }
      }
      break
    }
  }

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = row(grid, i)
    const category = txt(r[1]) || txt(r[0])
    if (!category) continue
    if (/réalis[ée]|réel|prévisionnel|previsionnel/i.test(category)) continue

    const monthly = months.map((_, idx) => num0(r[monthStart + idx]))
    const total = num(r[totalCol]) ?? monthly.reduce((a, b) => a + b, 0)
    lines[category] = { label: txt(r[0]), category, monthly, total }
  }

  return { months, lines, realisedUntil }
}

// ---------------------------------------------------------------------------
// CANAUX_PARAMS
// ---------------------------------------------------------------------------

export function parseCanauxParams(grid: Grid): CanauxParams {
  // Colonnes : 0 = paramètre, 1 = DTC, 2 = TikTok, 3 = Pharmacie
  const channelRow = (fragment: string): ChannelValues => {
    const r = findRowByLabel(grid, fragment)
    if (!r) return { dtc: null, tiktok: null, pharmacie: null }
    return { dtc: num(r[1]), tiktok: num(r[2]), pharmacie: num(r[3]) }
  }

  const seuilRow = findRowByLabel(grid, 'Seuil de sécurité')

  return {
    commission: channelRow('Commission plateforme'),
    logistiqueParCommande: channelRow('Coût logistique par commande'),
    rfaPharmacie: channelRow('RFA'),
    dso: channelRow('DSO'),
    dpo: channelRow('DPO'),
    delaiExpedition: channelRow('Délai expédition'),
    roasHistorique: channelRow('ROAS historique'),
    tauxRetour: channelRow('Taux de retour'),
    panierMoyen: channelRow('Panier moyen'),
    seuilSecuriteTreso: seuilRow ? num0(seuilRow[1]) : 5000,
    benchmarkMargeBrute: channelRow('Benchmark marge brute'),
    mixCanal: channelRow('Mix canal'),
  }
}

// ---------------------------------------------------------------------------
// FICHES CRC
// ---------------------------------------------------------------------------

export function parseFichesCRC(grid: Grid): FicheCRC[] {
  const headerIdx = findRowIndex(grid, (r) => txt(r[0]).toUpperCase() === 'PRODUIT')
  if (headerIdx < 0) return []

  const result: FicheCRC[] = []

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = row(grid, i)
    const produit = txt(r[0])
    if (!produit) continue

    // Sans prix de vente HT, la ligne est un séparateur ou une synthèse.
    const pvHt = num(r[2])
    if (pvHt === null) continue

    const coutLabo = num(r[4])

    result.push({
      produit,
      pvTtc: num0(r[1]),
      pvHt,
      volumeVendu: num0(r[3]),
      coutLabo,
      coutPackaging: num(r[5]),
      logistique: num0(r[6]),
      coutRetours: num0(r[7]),
      fraisPlateforme: num0(r[8]),
      quotePartPub: num0(r[9]),
      crcTotal: num0(r[12]),
      margeVariableEur: num0(r[13]),
      margeVariablePct: num0(r[14]),
      qpChargesFixes: num0(r[15]),
      margeNetteEur: num0(r[16]),
      margeNettePct: num0(r[17]),
      benchmark: txt(r[18]),
      // Sans coût labo, la marge affichée n'est pas représentative.
      coutsIncomplets: coutLabo === null || coutLabo === 0,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// PARAMÈTRES (CRC)
// ---------------------------------------------------------------------------

export function parseParamsCRC(grid: Grid): ParamsCRC {
  const valOf = (fragment: string): number => {
    const r = findRowByLabel(grid, fragment)
    return r ? num0(r[1]) : 0
  }

  // Détail des charges fixes, entre « CHARGES FIXES MENSUELLES » et son total.
  const chargesFixesDetail: Record<string, number> = {}
  const startIdx = findRowIndex(grid, (r) =>
    txt(r[0]).toUpperCase().includes('CHARGES FIXES MENSUELLES'),
  )
  const totalRow = findRowByLabel(grid, 'TOTAL CHARGES FIXES')

  if (startIdx >= 0) {
    for (let i = startIdx + 1; i < grid.length; i++) {
      const r = row(grid, i)
      const label = txt(r[0])
      if (!label) continue
      if (label.toUpperCase().includes('TOTAL CHARGES FIXES')) break
      if (label.toUpperCase().includes('POSTE DE CHARGE')) continue
      const v = num(r[1])
      if (v !== null) chargesFixesDetail[label] = v
    }
  }

  return {
    mixCanal: {
      dtc: valOf('% ventes Shopify'),
      tiktok: valOf('% ventes TikTok'),
      pharmacie: valOf('% ventes Pharmacies'),
    },
    commissions: {
      dtc: valOf('Commission Shopify'),
      tiktok: valOf('Commission TikTok'),
      pharmacie: valOf('Commission Pharmacie'),
    },
    chargesFixesMensuelles: totalRow ? num0(totalRow[1]) : 0,
    chargesFixesDetail,
    tauxRetourShopify: valOf('Taux de retour moyen Shopify'),
    coutTraitementRetour: valOf("Coût traitement d'un retour"),
  }
}

// ---------------------------------------------------------------------------
// PARAMS_MANUELS (KPI)
// ---------------------------------------------------------------------------

export function parseParamsManuels(grid: Grid): ParamsManuels {
  const valOf = (fragment: string): number => {
    const r = findRowByLabel(grid, fragment)
    return r ? num0(r[1]) : 0
  }

  const periodeRow = findRowByLabel(grid, 'Période analysée')

  return {
    periode: {
      mois: periodeRow ? num0(periodeRow[1]) : 0,
      annee: periodeRow ? num0(periodeRow[2]) : 0,
    },
    caShopify: valOf('CA réel Shopify'),
    caTiktok: valOf('CA réel TikTok'),
    caPharmacies: valOf('CA réel Pharmacies'),
    nbCommandesShopify: valOf('Nb commandes Shopify'),
    nbCommandesTiktok: valOf('Nb commandes TikTok'),
    nbNouveauxClients: valOf('Nb nouveaux clients'),
    nbRetours: valOf('Nb retours'),
    ltvBrut90j: valOf('Day 90 LTV brut'),
    profitBrut90j: valOf('Profit brut sur clients'),
    profitContribution90j: valOf('Profit contribution'),
    caMoisPrecedent: valOf('CA mois N-1'),
  }
}

// ---------------------------------------------------------------------------
// CALCULS_AUTO (KPI)
// ---------------------------------------------------------------------------

export function parseCalculsAuto(grid: Grid): CalculsAuto {
  const valOf = (fragment: string): number => {
    const r = findRowByLabel(grid, fragment)
    return r ? num0(r[1]) : 0
  }

  const ltv = valOf('Day 90 Contribution Profit LTV')
  const cac = valOf('CAC Fully Loaded')

  return {
    caTotal: valOf('CA TOTAL CONSOLIDÉ'),
    margeBrutePct: valOf('Marge brute (%)'),
    margeContributionPct: valOf('Marge de contribution (%)'),
    aov: valOf('AOV'),
    cacFullyLoaded: cac,
    day90GrossLtv: valOf('Day 90 Gross LTV'),
    day90ContributionLtv: ltv,
    ltvCacRatio: cac > 0 ? ltv / cac : null,
  }
}

// ---------------------------------------------------------------------------
// TRESORERIE_PILOTAGE
// ---------------------------------------------------------------------------

/**
 * Cet onglet est une fiche de synthèse à disposition fixe : les valeurs sont
 * lues par coordonnées absolues, comme dans l'implémentation d'origine.
 *
 * C'est intrinsèquement fragile — l'insertion d'une ligne décale tout. On
 * conserve néanmoins ce comportement (aucun libellé stable n'existe dans la
 * source pour ancrer la lecture), mais on vérifie la cohérence du résultat
 * plus bas : si aucune valeur n'est exploitable, l'interface affichera « — »
 * plutôt que des zéros inventés.
 */
export function parseTresoreriePilotage(grid: Grid): TresoreriePilotage {
  const cell = (r: number, c: number): Cell => row(grid, r)[c] ?? null

  const txtOrNull = (v: Cell): string | null => {
    const s = txt(v)
    return s === '' ? null : s
  }

  return {
    soldeActuel: num(cell(5, 2)),
    chargesFixesMensuelles: num(cell(6, 2)),
    runwayMois: num(cell(7, 2)),
    statutRunway: txtOrNull(cell(8, 2)),
    cccShopify: num(cell(13, 5)),
    cccTiktok: num(cell(14, 5)),
    cccPharmacie: num(cell(15, 5)),
    cccConsolide: num(cell(17, 2)),
    bfrActuel: num(cell(21, 2)),
    bfrJoursCA: num(cell(22, 2)),
    partCAPharmacie: num(cell(23, 2)),
    cashImmobilisePharmacie: num(cell(24, 2)),
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Métadonnées de provenance fournies par la couche de récupération. */
export interface WorkbookInput {
  buffer: Buffer
  provenance: WorkbookProvenance
}

/**
 * Parse les trois classeurs en une structure unique.
 *
 * @throws {AppError} `workbook_invalid` si un onglet requis est absent ou a
 *   perdu son marqueur structurel.
 */
export function parseAllWorkbooks(inputs: Record<WorkbookKey, WorkbookInput>): AllData {
  const pilotage = loadWorkbook('pilotage', inputs.pilotage.buffer)
  const crc = loadWorkbook('crc', inputs.crc.buffer)
  const kpi = loadWorkbook('kpi', inputs.kpi.buffer)

  const dataMensuelle = parseDataMensuelle(sheet(pilotage, '📊 DATA_MENSUELLE'))
  const bfr = parseBFR(sheet(pilotage, '⚖️ BFR'))
  const stockRotation = parseStockRotation(sheet(pilotage, '📦 STOCK_ROTATION'))
  const budget = parseBudget(sheet(pilotage, '💰 BUDGET_12M'))
  const canauxParams = parseCanauxParams(sheet(pilotage, '⚙️ CANAUX_PARAMS'))
  const tresoreriePilotage = parseTresoreriePilotage(sheet(pilotage, '💧 TRESORERIE_PILOTAGE'))

  const fichesCRC = parseFichesCRC(sheet(crc, '📊 FICHES CRC'))
  const paramsCRC = parseParamsCRC(sheet(crc, '⚙️ PARAMÈTRES'))

  const paramsManuels = parseParamsManuels(sheet(kpi, '📥 PARAMS_MANUELS'))
  const calculsAuto = parseCalculsAuto(sheet(kpi, '⚙️ CALCULS_AUTO'))

  // Le journal mensuel est le socle du tableau de bord : s'il ne contient
  // aucune ligne exploitable, c'est que la structure a changé.
  if (dataMensuelle.months.length === 0 || Object.keys(dataMensuelle.lines).length === 0) {
    throw new AppError('workbook_invalid', "[pilotage] DATA_MENSUELLE sans mois ni catégorie", {
      detail:
        "L'onglet « Journal mensuel » ne contient aucune colonne de mois exploitable. " +
        'La structure du classeur de pilotage a probablement changé.',
    })
  }

  // Détection de données réelles — distingue « pas encore saisi » de « zéro ».
  const hasMonthlyData = Object.values(dataMensuelle.lines).some((line) => line.total !== 0)
  const hasKpiData =
    paramsManuels.caShopify !== 0 || paramsManuels.caTiktok !== 0 || calculsAuto.caTotal !== 0
  const hasCrcData = fichesCRC.length > 0

  return {
    dataMensuelle,
    bfr,
    stockRotation,
    budget,
    canauxParams,
    fichesCRC,
    paramsCRC,
    paramsManuels,
    calculsAuto,
    tresoreriePilotage,
    meta: {
      hasMonthlyData,
      hasKpiData,
      hasCrcData,
      lastParsed: new Date().toISOString(),
      sources: {
        pilotage: inputs.pilotage.provenance,
        crc: inputs.crc.provenance,
        kpi: inputs.kpi.provenance,
      },
    },
  }
}
