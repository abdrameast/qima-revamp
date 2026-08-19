// Types TypeScript pour toutes les données du dashboard Honeylang

// Ligne P&L mensuelle : valeurs par mois + total
export interface PLLine {
  label: string
  category: string
  monthly: number[]
  total: number
}

// Onglet DATA_MENSUELLE structuré
export interface DataMensuelle {
  months: string[]
  lines: Record<string, PLLine> // indexé par category code
}

// Onglet BFR (null = valeur manquante, à afficher en "—")
export interface BFRData {
  months: string[]
  stocks: (number | null)[]
  creancesClients: (number | null)[]
  dettesFournisseurs: (number | null)[]
  bfrTotal: (number | null)[]
  joursStock: (number | null)[]
  joursClients: (number | null)[]
  joursFournisseurs: (number | null)[]
  bfrEnJoursCA: (number | null)[]
}

// Onglet STOCK_ROTATION
export interface StockRotation {
  trimestre: string
  stockActif: number
  stockLent: number
  stockDormant: number
  totalStock: number
}

// Onglet BUDGET_12M
export interface BudgetLine {
  label: string
  category: string
  monthly: number[]
  total: number
}

export interface BudgetData {
  months: string[]
  lines: Record<string, BudgetLine>
  realisedUntil: string | null   // dernier mois avec statut "RÉALISÉ", null si aucun
}

// Paramètres canaux (3 canaux : DTC, TikTok, Pharmacie)
export interface ChannelValues {
  dtc: number | null
  tiktok: number | null
  pharmacie: number | null
}

export interface CanauxParams {
  commission: ChannelValues
  logistiqueParCommande: ChannelValues
  rfaPharmacie: ChannelValues
  dso: ChannelValues
  dpo: ChannelValues
  delaiExpedition: ChannelValues
  roasHistorique: ChannelValues
  tauxRetour: ChannelValues
  panierMoyen: ChannelValues
  seuilSecuriteTreso: number
  benchmarkMargeBrute: ChannelValues
  mixCanal: ChannelValues
}

// Fiche produit CRC
export interface FicheCRC {
  produit: string
  pvTtc: number
  pvHt: number
  volumeVendu: number
  coutLabo: number | null
  coutPackaging: number | null
  logistique: number
  coutRetours: number
  fraisPlateforme: number
  quotePartPub: number
  crcTotal: number
  margeVariableEur: number
  margeVariablePct: number
  qpChargesFixes: number
  margeNetteEur: number
  margeNettePct: number
  benchmark: string
  coutsIncomplets: boolean // true si coût labo manquant (marge non représentative)
}

// Paramètres CRC (charges fixes, mix canal)
export interface ParamsCRC {
  mixCanal: ChannelValues
  commissions: ChannelValues
  chargesFixesMensuelles: number
  chargesFixesDetail: Record<string, number>
  tauxRetourShopify: number
  coutTraitementRetour: number
}

// Paramètres manuels KPI (saisie mensuelle)
export interface ParamsManuels {
  periode: { mois: number; annee: number }
  caShopify: number
  caTiktok: number
  caPharmacies: number
  nbCommandesShopify: number
  nbCommandesTiktok: number
  nbNouveauxClients: number
  nbRetours: number
  ltvBrut90j: number
  profitBrut90j: number
  profitContribution90j: number
  caMoisPrecedent: number
}

// Onglet TRESORERIE_PILOTAGE
export interface TresoreriePilotage {
  soldeActuel: number | null
  chargesFixesMensuelles: number | null
  runwayMois: number | null
  statutRunway: string | null
  cccShopify: number | null
  cccTiktok: number | null
  cccPharmacie: number | null
  cccConsolide: number | null
  bfrActuel: number | null
  bfrJoursCA: number | null
  partCAPharmacie: number | null
  cashImmobilisePharmacie: number | null
}

// Calculs automatiques KPI
export interface CalculsAuto {
  caTotal: number
  margeBrutePct: number
  margeContributionPct: number
  aov: number
  cacFullyLoaded: number
  day90GrossLtv: number
  day90ContributionLtv: number
  ltvCacRatio: number | null
}

// ---------------------------------------------------------------------------
// Provenance & fraîcheur
// ---------------------------------------------------------------------------

// Traçabilité d'un classeur source. Aucun identifiant Drive n'y figure :
// ces métadonnées sont transmises au client, où un file ID serait une fuite.
export interface WorkbookProvenance {
  // Nom du fichier tel que renvoyé par Drive.
  fileName: string
  // Dernière modification côté Drive, ISO 8601.
  modifiedTime: string
  sizeBytes: number
  // Empreinte courte du contenu — permet de détecter un changement réel.
  contentHash: string
  // true si la source était une feuille Google native exportée en xlsx.
  exported: boolean
}

// Origine effective des données servies.
export type DataOrigin = 'drive' | 'local-fixtures'

// Structure complète des données
export interface AllData {
  dataMensuelle: DataMensuelle
  bfr: BFRData
  stockRotation: StockRotation[]
  budget: BudgetData
  canauxParams: CanauxParams
  fichesCRC: FicheCRC[]
  paramsCRC: ParamsCRC
  paramsManuels: ParamsManuels
  calculsAuto: CalculsAuto
  tresoreriePilotage: TresoreriePilotage
  meta: {
    hasMonthlyData: boolean
    hasKpiData: boolean
    hasCrcData: boolean
    lastParsed: string
    sources: {
      pilotage: WorkbookProvenance
      crc: WorkbookProvenance
      kpi: WorkbookProvenance
    }
  }
}

// ---------------------------------------------------------------------------
// Enveloppe de réponse API
// ---------------------------------------------------------------------------

// Réponse de GET/POST /api/data. `origin` et `syncedAt` alimentent
// l'indicateur de fraîcheur de l'interface.
export interface DataEnvelope {
  data: AllData
  // Instant de la synchronisation ayant produit ces données, ISO 8601.
  syncedAt: string
  origin: DataOrigin
  // true si la réponse provient du cache serveur plutôt qu'un appel Drive.
  fromCache: boolean
  // Âge des données servies, en secondes.
  ageSeconds: number
  // true si l'âge dépasse la durée de vie du cache — données à rafraîchir.
  stale: boolean
}
