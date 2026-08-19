import type { AllData } from './data-types'
import {
  bfrSnapshot,
  channelMetrics,
  margeBrute,
  produitsKpis,
  shopifyKpis,
  tresorerieActuelle,
} from './compute'
import { formatEuro, formatJours, formatMois, formatMultiple, formatPercent } from './format'

/**
 * Moteur d'alertes — aide à la décision.
 *
 * ## Statut de ces messages
 *
 * Ce sont des **signaux calculés**, pas un avis comptable ni financier. Chaque
 * alerte expose la règle qui l'a déclenchée et la valeur observée, de sorte
 * que le lecteur puisse la contredire. C'est délibéré : un tableau de bord qui
 * énonce « il faut faire X » sans montrer son raisonnement demande une
 * confiance qu'il n'a pas les moyens de justifier.
 *
 * Les seuils ne sont pas inventés ici : ils reprennent ceux déjà présents dans
 * `compute.ts` et `format.ts` (marge 60 / 45 %, ROI canal ×2 / ×1,5, seuil de
 * sécurité de trésorerie issu du classeur de pilotage).
 *
 * Fonctions pures et testables : aucune dépendance à React.
 */

export type AlertSeverity = 'critical' | 'caution' | 'info'

export interface DecisionAlert {
  id: string
  severity: AlertSeverity
  /** Titre court, factuel. */
  title: string
  /** Ce que la valeur observée signifie, sans prescription. */
  explanation: string
  /** Indicateur concerné et sa valeur formatée. */
  metric: { label: string; value: string }
  /** Règle appliquée, en clair — rend l'alerte contestable. */
  rule: string
  /** Classeur et onglet d'origine de la donnée. */
  source: string
  /** Piste à instruire. Jamais formulée comme une instruction. */
  lead: string
  /** Page où examiner le détail. */
  href: string
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, caution: 1, info: 2 }

/**
 * Évalue l'ensemble des règles.
 *
 * Une règle dont la donnée d'entrée est absente ne produit **aucune** alerte :
 * on ne signale pas un risque sur la foi d'une valeur manquante.
 */
export function evaluateAlerts(data: AllData): DecisionAlert[] {
  const alerts: DecisionAlert[] = []

  // ---- Trésorerie : solde sous le seuil de sécurité ----------------------
  const treso = tresorerieActuelle(data)
  const seuil = data.canauxParams.seuilSecuriteTreso

  if (treso !== null && seuil > 0 && treso < seuil) {
    alerts.push({
      id: 'treso-sous-seuil',
      severity: 'critical',
      title: 'Trésorerie sous le seuil de sécurité',
      explanation:
        `Le solde disponible (${formatEuro(treso)}) est inférieur à la réserve de sécurité ` +
        `paramétrée (${formatEuro(seuil)}), censée couvrir un mois de charges fixes.`,
      metric: { label: 'Trésorerie disponible', value: formatEuro(treso) },
      rule: `Alerte si trésorerie < seuil de sécurité (${formatEuro(seuil)})`,
      source: 'Honeylang_PF_v3.xlsx · DATA_MENSUELLE et CANAUX_PARAMS',
      lead: "Examiner l'échéancier fournisseurs et les encaissements attendus sur 30 jours.",
      href: '/dashboard/tresorerie',
    })
  }

  // ---- Trésorerie : runway court ----------------------------------------
  const runway = data.tresoreriePilotage.runwayMois
  if (runway !== null && runway < 3) {
    alerts.push({
      id: 'runway-court',
      severity: 'critical',
      title: 'Runway inférieur à 3 mois',
      explanation:
        `Au rythme actuel des charges fixes, la trésorerie couvre ${formatMois(runway)} ` +
        `d'exploitation.`,
      metric: { label: 'Runway', value: `${formatMois(runway)}` },
      rule: 'Alerte si runway < 3 mois (seuil de criticité du classeur de pilotage)',
      source: 'Honeylang_PF_v3.xlsx · TRESORERIE_PILOTAGE',
      lead: 'Comparer les scénarios de réduction de charges et de déstockage.',
      href: '/dashboard/tresorerie',
    })
  } else if (runway !== null && runway < 6) {
    alerts.push({
      id: 'runway-vigilance',
      severity: 'caution',
      title: 'Runway sous six mois',
      explanation: `La trésorerie couvre ${formatMois(runway)} de charges fixes.`,
      metric: { label: 'Runway', value: `${formatMois(runway)}` },
      rule: 'Vigilance si runway compris entre 3 et 6 mois',
      source: 'Honeylang_PF_v3.xlsx · TRESORERIE_PILOTAGE',
      lead: "Anticiper le besoin de financement du prochain cycle d'approvisionnement.",
      href: '/dashboard/tresorerie',
    })
  }

  // ---- Marge brute sous le benchmark sectoriel ---------------------------
  const marge = margeBrute(data)
  if (marge.pct !== null && marge.pct < 0.6) {
    alerts.push({
      id: 'marge-sous-benchmark',
      severity: marge.pct < 0.45 ? 'critical' : 'caution',
      title: 'Marge brute sous le repère sectoriel',
      explanation:
        `La marge brute consolidée s'établit à ${formatPercent(marge.pct, { isRatio: true })}, ` +
        `en dessous de la fourchette 60–72 % observée en cosmétique premium.`,
      metric: { label: 'Marge brute', value: formatPercent(marge.pct, { isRatio: true }) },
      rule: 'Alerte si marge brute < 60 % ; criticité si < 45 %',
      source: 'Honeylang_PF_v3.xlsx · DATA_MENSUELLE (CA et COGS)',
      lead: 'Comparer la structure de coûts par SKU pour situer la dilution.',
      href: '/dashboard/produits',
    })
  }

  // ---- Canaux : rentabilité insuffisante --------------------------------
  for (const channel of channelMetrics(data)) {
    if (channel.roi === null || channel.roi >= 1.5) continue

    alerts.push({
      id: `canal-roi-${channel.key}`,
      severity: channel.roi < 1 ? 'critical' : 'caution',
      title: `Rentabilité du canal ${channel.nom} sous le seuil`,
      explanation:
        `Le ROI estimé du canal est de ${formatMultiple(channel.roi)}, ` +
        `pour un coût de ${formatEuro(channel.coutParEuroCA, 2)} par euro de chiffre d'affaires` +
        (channel.dso !== null ? ` et un délai de paiement de ${formatJours(channel.dso)}.` : '.'),
      metric: { label: `ROI ${channel.nom}`, value: formatMultiple(channel.roi) },
      rule: 'Alerte si ROI canal < ×1,5 ; criticité si < ×1 (seuils de compute.ts)',
      source: 'Honeylang_PF_v3.xlsx · CANAUX_PARAMS',
      lead: 'Réexaminer les conditions commerciales du canal avant tout réassort.',
      href: '/dashboard/canaux',
    })
  }

  // ---- Produits : coûts incomplets --------------------------------------
  const produits = produitsKpis(data)
  if (produits.nbIncomplets > 0) {
    alerts.push({
      id: 'crc-incomplets',
      severity: 'caution',
      title: `${produits.nbIncomplets} produit(s) sans coût de production renseigné`,
      explanation:
        `Sur ${produits.nbSkus} références, ${produits.nbIncomplets} n'ont pas de coût labo saisi. ` +
        `Leur marge affichée n'est pas représentative et elles sont exclues des médianes.`,
      metric: {
        label: 'Références à compléter',
        value: `${produits.nbIncomplets} / ${produits.nbSkus}`,
      },
      rule: 'Alerte si au moins une fiche CRC a un coût labo absent ou nul',
      source: 'QIMA_Honeylang_Fiches_CRC_v5.xlsx · FICHES CRC',
      lead: 'Compléter les coûts labo pour fiabiliser les marges par référence.',
      href: '/dashboard/produits',
    })
  }

  // ---- Produits : concentration du chiffre d'affaires --------------------
  const withRevenue = data.fichesCRC
    .map((sku) => sku.pvHt * sku.volumeVendu)
    .sort((a, b) => b - a)
  const totalRevenue = withRevenue.reduce((sum, value) => sum + value, 0)

  if (totalRevenue > 0 && withRevenue.length >= 4) {
    const topTwo = withRevenue.slice(0, 2).reduce((sum, value) => sum + value, 0)
    const share = topTwo / totalRevenue

    if (share > 0.6) {
      alerts.push({
        id: 'concentration-catalogue',
        severity: 'caution',
        title: 'Chiffre d’affaires concentré sur deux références',
        explanation:
          `Les deux premières références représentent ${formatPercent(share, { isRatio: true })} ` +
          `du chiffre d'affaires du catalogue. Une rupture sur l'une d'elles aurait un effet ` +
          `immédiat sur le total.`,
        metric: { label: 'Part des 2 premières références', value: formatPercent(share, { isRatio: true }) },
        rule: 'Alerte si les 2 premières références dépassent 60 % du CA catalogue',
        source: 'QIMA_Honeylang_Fiches_CRC_v5.xlsx · FICHES CRC',
        lead: "Vérifier la couverture de stock et la sécurité d'approvisionnement de ces références.",
        href: '/dashboard/produits',
      })
    }
  }

  // ---- Acquisition : ratio LTV / CAC ------------------------------------
  const shopify = shopifyKpis(data)
  if (shopify.ltvCacRatio !== null && shopify.ltvCacRatio < 3) {
    alerts.push({
      id: 'ltv-cac-faible',
      severity: shopify.ltvCacRatio < 1 ? 'critical' : 'caution',
      title: "Rentabilité de l'acquisition sous le repère",
      explanation:
        `Le ratio LTV / CAC à 90 jours est de ${formatMultiple(shopify.ltvCacRatio)}, ` +
        `en dessous du repère e-commerce de ×3` +
        (shopify.ltvCacRatio < 1 ? " : l'acquisition coûte plus qu'elle ne rapporte." : '.'),
      metric: { label: 'LTV / CAC', value: formatMultiple(shopify.ltvCacRatio) },
      rule: 'Alerte si LTV/CAC < ×3 ; criticité si < ×1',
      source: 'Honeylang_KPI_DTC_v1.xlsx · CALCULS_AUTO',
      lead: 'Examiner la rétention par cohorte avant de faire varier le budget média.',
      href: '/dashboard/shopify',
    })
  }

  // ---- BFR : stock immobilisé -------------------------------------------
  const bfr = bfrSnapshot(data)
  if (bfr.joursStock !== null && bfr.joursStock > 40) {
    alerts.push({
      id: 'stock-rotation-lente',
      severity: bfr.joursStock > 60 ? 'critical' : 'caution',
      title: 'Rotation des stocks au-delà du repère',
      explanation:
        `Le stock représente ${formatJours(bfr.joursStock)} de couverture, au-delà du repère ` +
        `de 40 jours retenu pour la catégorie.`,
      metric: { label: 'Jours de stock', value: formatJours(bfr.joursStock) },
      rule: 'Alerte si jours de stock > 40 ; criticité si > 60',
      source: 'Honeylang_PF_v3.xlsx · BFR',
      lead: 'Identifier les références à rotation lente pour libérer de la trésorerie.',
      href: '/dashboard/tresorerie',
    })
  }

  // ---- Stock dormant ----------------------------------------------------
  const stock = data.stockRotation.at(-1)
  if (stock && stock.totalStock > 0) {
    const dormantShare = stock.stockDormant / stock.totalStock
    if (dormantShare > 0.1) {
      alerts.push({
        id: 'stock-dormant',
        severity: dormantShare > 0.2 ? 'critical' : 'caution',
        title: 'Part de stock dormant élevée',
        explanation:
          `Sur ${stock.trimestre}, le stock dormant (plus de 180 jours sans vente) représente ` +
          `${formatPercent(dormantShare, { isRatio: true })} du stock total, soit ` +
          `${formatEuro(stock.stockDormant)} immobilisés.`,
        metric: { label: 'Stock dormant', value: formatEuro(stock.stockDormant) },
        rule: 'Alerte si stock dormant > 10 % du stock total ; criticité si > 20 %',
        source: 'Honeylang_PF_v3.xlsx · STOCK_ROTATION',
        lead: "Évaluer l'écoulement de ces références au regard de leur date limite d'utilisation.",
        href: '/dashboard/tresorerie',
      })
    }
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/** Décompte par gravité, pour les pastilles de synthèse. */
export function countBySeverity(alerts: readonly DecisionAlert[]): Record<AlertSeverity, number> {
  return alerts.reduce<Record<AlertSeverity, number>>(
    (counts, alert) => {
      counts[alert.severity] += 1
      return counts
    },
    { critical: 0, caution: 0, info: 0 },
  )
}
