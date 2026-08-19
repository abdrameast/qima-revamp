/**
 * Jetons graphiques partagés par tous les graphiques.
 *
 * Recharts attend des valeurs de couleur en propriétés SVG. Les `var(--…)`
 * y sont résolues par le moteur CSS, ce qui permet aux graphiques de puiser
 * dans les mêmes jetons que le reste de l'interface : une couleur modifiée
 * dans `globals.css` se propage aux graphiques sans toucher un composant.
 *
 * Les graphiques sont posés sur les surfaces claires « papier » : ce sont les
 * variantes `-ink` des couleurs sémantiques qui s'appliquent.
 */

export const CHART = {
  /** Série principale — chiffre d'affaires réalisé, valeurs constatées. */
  primary: 'var(--color-gold-deep)',
  /** Série secondaire — prévisionnel, budget, référence. */
  secondary: 'var(--color-mauve)',
  /** Troisième série — comparaison, période précédente. */
  tertiary: 'var(--color-ink-faint)',

  positive: 'var(--color-positive-ink)',
  caution: 'var(--color-caution-ink)',
  critical: 'var(--color-critical-ink)',

  grid: 'var(--color-rule)',
  axis: 'var(--color-rule-strong)',
  axisText: 'var(--color-ink-faint)',
} as const

/**
 * Palette catégorielle, pour les séries sans signification propre (canaux,
 * postes de charges). Ordonnée par distinction perceptive décroissante, et
 * conçue pour rester différenciable en deutéranopie : la progression joue
 * autant sur la clarté que sur la teinte, jamais sur la seule teinte.
 */
export const CATEGORICAL = [
  'var(--color-gold-deep)',
  'var(--color-mauve)',
  'var(--color-positive-ink)',
  'var(--color-ink-muted)',
  'var(--color-caution-ink)',
  'var(--color-critical-ink)',
] as const

/** Réglages d'axes communs — évite six déclarations divergentes. */
export const AXIS_PROPS = {
  tick: { fontSize: 11, fill: 'var(--color-ink-faint)' },
  tickLine: false,
  axisLine: { stroke: 'var(--color-rule)' },
} as const

export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'var(--color-rule)',
  vertical: false,
} as const
