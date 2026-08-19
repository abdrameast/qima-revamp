import type { AllData, PLLine } from './data-types'

// Catégories CA (revenus) et COGS (coûts de production) dans DATA_MENSUELLE
const CA_CATEGORIES = ['CA_Shopify', 'CA_TikTok', 'CA_Pharmacies', 'CA_Autres']
const COGS_CATEGORIES = [
  'COGS_Sous-traitant',
  'COGS_Packaging',
  'COGS_Transport_achats',
  'COGS_Variation_stocks'
]

// Récupère une ligne P&L par code catégorie
export function getLine(data: AllData, category: string): PLLine | null {
  return data.dataMensuelle.lines[category] ?? null
}

// Somme des totaux annuels de plusieurs catégories
function sumTotals(data: AllData, categories: string[]): number {
  return categories.reduce((acc, cat) => acc + (getLine(data, cat)?.total ?? 0), 0)
}

// Somme mois par mois de plusieurs catégories
function sumMonthly(data: AllData, categories: string[]): number[] {
  const months = data.dataMensuelle.months
  return months.map((_, i) =>
    categories.reduce((acc, cat) => acc + (getLine(data, cat)?.monthly[i] ?? 0), 0)
  )
}

// CA total annuel net de remises — null si aucune donnée (état journal vide)
export function caTotalAnnuel(data: AllData): number | null {
  const brut = sumTotals(data, CA_CATEGORIES)
  const remises = getLine(data, 'Remises_accordées')?.total ?? 0
  const net = brut - remises
  return brut === 0 ? null : net
}

// CA mensuel net (array aligné sur les mois)
export function caMensuel(data: AllData): number[] {
  const ca = sumMonthly(data, CA_CATEGORIES)
  const remises = getLine(data, 'Remises_accordées')?.monthly ?? []
  return ca.map((v, i) => v - (remises[i] ?? 0))
}

// Marge brute : (CA − COGS) / CA — null si pas de CA
export function margeBrute(data: AllData): { eur: number | null; pct: number | null } {
  const ca = caTotalAnnuel(data)
  if (ca === null || ca === 0) return { eur: null, pct: null }
  const cogs = sumTotals(data, COGS_CATEGORIES)
  const eur = ca - cogs
  return { eur, pct: eur / ca }
}

// Trésorerie : dernière valeur non nulle du poste de bilan Trésorerie — null si vide
export function tresorerieActuelle(data: AllData): number | null {
  const line = getLine(data, 'Bilan_Trésorerie')
  if (!line) return null
  for (let i = line.monthly.length - 1; i >= 0; i--) {
    if (line.monthly[i] !== 0) return line.monthly[i]
  }
  return null
}

// Delta du CA : dernier mois renseigné vs mois précédent (ratio) — null si insuffisant
export function deltaCAMensuel(data: AllData): number | null {
  const monthly = caMensuel(data)
  // dernier mois avec une valeur > 0
  let last = -1
  for (let i = monthly.length - 1; i >= 0; i--) {
    if (monthly[i] > 0) {
      last = i
      break
    }
  }
  if (last <= 0) return null
  const prev = monthly[last - 1]
  if (!prev) return null
  return (monthly[last] - prev) / prev
}

// BFR : snapshot du mois courant (premier mois renseigné)
export function bfrSnapshot(data: AllData): {
  stock: number | null
  creances: number | null
  dettes: number | null
  total: number | null
  joursStock: number | null
  bfrJoursCA: number | null
} {
  const b = data.bfr
  // Premier mois renseigné = mois courant (la BFR couvre les 12 mois à venir)
  const firstIdx = (arr: (number | null)[]): number => {
    for (let i = 0; i < arr.length; i++) if (arr[i] !== null) return i
    return -1
  }
  const i = firstIdx(b.bfrTotal)
  if (i < 0) {
    return { stock: null, creances: null, dettes: null, total: null, joursStock: null, bfrJoursCA: null }
  }
  return {
    stock: b.stocks[i],
    creances: b.creancesClients[i],
    dettes: b.dettesFournisseurs[i],
    total: b.bfrTotal[i],
    joursStock: b.joursStock[i],
    bfrJoursCA: b.bfrEnJoursCA[i]
  }
}

// CA trimestriel : regroupe les 12 mois en 4 trimestres
export interface QuarterPoint {
  label: string
  ca: number
  hasData: boolean
}

export function caTrimestriel(data: AllData): QuarterPoint[] {
  const months = data.dataMensuelle.months
  const monthly = caMensuel(data)
  const points: QuarterPoint[] = []

  for (let q = 0; q < months.length; q += 3) {
    const slice = monthly.slice(q, q + 3)
    if (slice.length === 0) break
    const ca = slice.reduce((a, b) => a + b, 0)
    const labelStart = months[q]?.split('-')[0] ?? ''
    const labelEnd = months[Math.min(q + 2, months.length - 1)]?.split('-')[0] ?? ''
    points.push({
      label: `${labelStart}–${labelEnd}`,
      ca,
      hasData: ca !== 0
    })
  }
  return points
}

// Indique si le journal mensuel contient des données réelles
export function hasMonthlyData(data: AllData): boolean {
  return caTotalAnnuel(data) !== null
}

// ---------- CANAUX ----------

export type ChannelKey = 'dtc' | 'tiktok' | 'pharmacie'

export interface ChannelMetric {
  key: ChannelKey
  nom: string
  sousTitre: string
  caCategory: string
  caTrim: number | null // CA réel (null tant que journal vide)
  partMix: number | null // part du mix canal (ratio)
  margeBrute: number | null // marge brute de référence du canal (ratio)
  coutParEuroCA: number | null // commission + logistique/panier + RFA
  roi: number | null // marge brute ÷ coût canal
  dso: number | null
  cac: number | null
  tauxRetour: number | null
}

const CHANNEL_META: { key: ChannelKey; nom: string; sousTitre: string; caCategory: string }[] = [
  { key: 'dtc', nom: 'DTC Shopify', sousTitre: 'Vente directe e-commerce', caCategory: 'CA_Shopify' },
  { key: 'tiktok', nom: 'TikTok Shop', sousTitre: 'Social commerce', caCategory: 'CA_TikTok' },
  { key: 'pharmacie', nom: 'Pharmacie', sousTitre: 'Distribution B2B', caCategory: 'CA_Pharmacies' }
]

export function channelMetrics(data: AllData): ChannelMetric[] {
  const p = data.canauxParams

  return CHANNEL_META.map(({ key, nom, sousTitre, caCategory }) => {
    const commission = p.commission[key]
    const logistique = p.logistiqueParCommande[key]
    const panier = p.panierMoyen[key]
    const rfa = p.rfaPharmacie[key]
    const marge = p.benchmarkMargeBrute[key]

    // Coût par € de CA = commission + (logistique / panier) + RFA éventuelle
    let cout: number | null = null
    if (commission !== null) {
      cout = commission
      if (logistique !== null && panier) cout += logistique / panier
      if (rfa !== null) cout += rfa
    }

    const roi = marge !== null && cout !== null && cout > 0 ? marge / cout : null

    const caTotal = getLine(data, caCategory)?.total ?? 0

    return {
      key,
      nom,
      sousTitre,
      caCategory,
      caTrim: caTotal === 0 ? null : caTotal,
      partMix: p.mixCanal[key],
      margeBrute: marge,
      coutParEuroCA: cout,
      roi,
      dso: p.dso[key],
      // CAC fully loaded uniquement disponible pour le DTC (KPI_DTC)
      cac: key === 'dtc' && data.calculsAuto.cacFullyLoaded > 0 ? data.calculsAuto.cacFullyLoaded : null,
      tauxRetour: p.tauxRetour[key]
    }
  })
}

// Signal ROI canal : vert ≥2, ambre 1.5–2, rouge <1.5
export function roiSignal(roi: number | null): 'green' | 'amber' | 'red' | null {
  if (roi === null) return null
  if (roi >= 2) return 'green'
  if (roi >= 1.5) return 'amber'
  return 'red'
}

// ---------- SHOPIFY ----------

export interface SkuRow {
  produit: string
  caHT: number
  margePct: number | null
  coutsIncomplets: boolean
}

// Top N SKUs par CA HT (pvHt × volumeVendu) — vraies données CRC
export function topSkusByCA(data: AllData, n = 5): SkuRow[] {
  return [...data.fichesCRC]
    .sort((a, b) => {
      const caA = a.pvHt * (a.volumeVendu ?? 0)
      const caB = b.pvHt * (b.volumeVendu ?? 0)
      return caB - caA
    })
    .slice(0, n)
    .map(s => ({
      produit: s.produit,
      caHT: s.pvHt * (s.volumeVendu ?? 0),
      margePct: s.coutsIncomplets ? null : s.margeVariablePct,
      coutsIncomplets: s.coutsIncomplets
    }))
}

export interface ShopifyKpis {
  tauxReachat: number | null // ratio — null si données manquantes
  nbNouveaux: number | null
  nbFideles: number | null
  ltvJour90: number | null
  cac: number | null
  ltvCacRatio: number | null
}

// ---------- PRODUITS ----------

export interface ProduitsKpis {
  nbSkus: number
  nbComplets: number
  nbIncomplets: number
  margeVariableMediane: number | null // ratio, complets seulement
  chargesFixesMensuelles: number
  chargesFixesAnnuelles: number
  chargesFixesDetail: Record<string, number>
}

export function produitsKpis(data: AllData): ProduitsKpis {
  const crcs = data.fichesCRC
  const params = data.paramsCRC
  const complets = crcs.filter(c => !c.coutsIncomplets)
  const marges = complets.map(c => c.margeVariablePct).sort((a, b) => a - b)
  const n = marges.length
  const mediane = n === 0
    ? null
    : n % 2 === 0
      ? (marges[n / 2 - 1] + marges[n / 2]) / 2
      : marges[Math.floor(n / 2)]

  return {
    nbSkus: crcs.length,
    nbComplets: complets.length,
    nbIncomplets: crcs.length - complets.length,
    margeVariableMediane: mediane,
    chargesFixesMensuelles: params.chargesFixesMensuelles,
    chargesFixesAnnuelles: params.chargesFixesMensuelles * 12,
    chargesFixesDetail: params.chargesFixesDetail
  }
}

export function shopifyKpis(data: AllData): ShopifyKpis {
  const p = data.paramsManuels
  const c = data.calculsAuto

  const nbCmd = p.nbCommandesShopify
  const nbNew = p.nbNouveauxClients

  const tauxReachat =
    nbCmd > 0 && nbNew >= 0 && nbNew <= nbCmd
      ? (nbCmd - nbNew) / nbCmd
      : null

  return {
    tauxReachat,
    nbNouveaux: nbNew > 0 ? nbNew : null,
    nbFideles: nbCmd > 0 && nbNew > 0 ? nbCmd - nbNew : null,
    ltvJour90: c.day90GrossLtv > 0 ? c.day90GrossLtv : null,
    cac: c.cacFullyLoaded > 0 ? c.cacFullyLoaded : null,
    ltvCacRatio: c.ltvCacRatio ?? null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CALCULS SUR PÉRIODE
// ───────────────────────────────────────────────────────────────────────────
// Le sélecteur global restreint l'analyse à un sous-ensemble de mois. Ces
// fonctions reprennent exactement les formules ci-dessus, appliquées à une
// tranche d'indices plutôt qu'à l'exercice entier.
//
// Elles vivent ici, et non dans les composants, pour qu'il n'existe qu'une
// seule définition de « marge brute » dans l'application.
// ═══════════════════════════════════════════════════════════════════════════

// Somme d'une catégorie sur une période. null si la période est vide.
function sumCategoriesOver(
  data: AllData,
  categories: string[],
  months: readonly number[]
): number {
  return categories.reduce((acc, cat) => {
    const line = getLine(data, cat)
    if (!line) return acc
    return acc + months.reduce((sum, i) => sum + (line.monthly[i] ?? 0), 0)
  }, 0)
}

// CA net de remises sur une période — null si aucun mois n'est renseigné,
// ce qui distingue « période à zéro » de « période non saisie ».
export function caOverPeriod(data: AllData, months: readonly number[]): number | null {
  if (months.length === 0) return null
  const brut = sumCategoriesOver(data, CA_CATEGORIES, months)
  const remises = sumCategoriesOver(data, ['Remises_accordées'], months)
  return brut === 0 ? null : brut - remises
}

// Marge brute sur une période — même formule que margeBrute(), périmètre réduit
export function margeBruteOverPeriod(
  data: AllData,
  months: readonly number[]
): { eur: number | null; pct: number | null } {
  const ca = caOverPeriod(data, months)
  if (ca === null || ca === 0) return { eur: null, pct: null }
  const cogs = sumCategoriesOver(data, COGS_CATEGORIES, months)
  const eur = ca - cogs
  return { eur, pct: eur / ca }
}

// Préfixes des lignes de BILAN présentes dans le journal mensuel.
//
// Ces postes ne sont PAS des charges : ce sont des positions de bilan, dont la
// valeur est un solde à un instant donné. Les additionner sur douze mois n'a
// aucun sens comptable — cela revient à compter douze fois le même solde.
//
// Sans cette exclusion, « Bilan_Trésorerie » gonflait le total des charges de
// la somme de ses douze soldes mensuels, rendant le résultat estimé et l'écart
// budgétaire faux de plusieurs centaines de milliers d'euros.
const BALANCE_SHEET_PREFIXES = ['Bilan_']

// Une catégorie du journal est une charge si elle n'est ni un produit
// (CA_*, remises) ni une position de bilan.
export function isChargeCategory(category: string): boolean {
  if (category.startsWith('CA_')) return false
  if (category === 'Remises_accordées') return false
  return !BALANCE_SHEET_PREFIXES.some((prefix) => category.startsWith(prefix))
}

// Total des charges d'exploitation sur une période
export function chargesOverPeriod(data: AllData, months: readonly number[]): number | null {
  if (months.length === 0) return null
  const isCharge = isChargeCategory
  let total = 0
  let seen = false
  for (const [key, line] of Object.entries(data.dataMensuelle.lines)) {
    if (!isCharge(key)) continue
    for (const i of months) {
      const value = line.monthly[i] ?? 0
      if (value !== 0) seen = true
      total += value
    }
  }
  return seen ? total : null
}

// CA budgété sur une période — null si aucune ligne budget n'est renseignée
export function caBudgetOverPeriod(data: AllData, months: readonly number[]): number | null {
  const lines = data.budget.lines
  if (Object.keys(lines).length === 0 || months.length === 0) return null

  const sumOf = (cat: string) => {
    const line = lines[cat]
    if (!line) return 0
    return months.reduce((sum, i) => sum + (line.monthly[i] ?? 0), 0)
  }

  const brut = CA_CATEGORIES.reduce((acc, cat) => acc + sumOf(cat), 0)
  if (brut === 0) return null
  return brut - sumOf('Remises_accordées')
}

// Trésorerie de fin de période : dernière valeur non nulle du poste de bilan
// à l'intérieur de la période. null si aucune écriture sur l'intervalle.
export function tresorerieFinDePeriode(
  data: AllData,
  months: readonly number[]
): number | null {
  const line = getLine(data, 'Bilan_Trésorerie')
  if (!line || months.length === 0) return null
  for (let i = months.length - 1; i >= 0; i--) {
    const value = line.monthly[months[i]]
    if (value !== undefined && value !== 0) return value
  }
  return null
}

// Série mensuelle du CA restreinte à une période, pour les graphiques.
// `null` marque un mois non renseigné : la courbe s'interrompt au lieu de
// plonger à zéro (connectNulls={false} côté Recharts).
export interface MonthlyPoint {
  label: string
  index: number
  reel: number | null
  budget: number | null
}

export function monthlySeries(data: AllData, months: readonly number[]): MonthlyPoint[] {
  const labels = data.dataMensuelle.months
  const reel = caMensuel(data)
  const budgetLines = data.budget.lines
  const hasBudget = Object.keys(budgetLines).length > 0

  const budgetAt = (i: number): number | null => {
    if (!hasBudget) return null
    const brut = CA_CATEGORIES.reduce(
      (acc, cat) => acc + (budgetLines[cat]?.monthly[i] ?? 0),
      0
    )
    if (brut === 0) return null
    return brut - (budgetLines['Remises_accordées']?.monthly[i] ?? 0)
  }

  return months.map((i) => ({
    label: labels[i] ?? '',
    index: i,
    reel: (reel[i] ?? 0) === 0 ? null : reel[i],
    budget: budgetAt(i)
  }))
}
