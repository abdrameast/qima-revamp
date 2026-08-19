/**
 * Export CSV.
 *
 * Conventions françaises assumées, parce que le fichier sera ouvert dans un
 * Excel configuré en français :
 *  - séparateur `;` (la virgule est le séparateur décimal en fr-FR) ;
 *  - nombres avec virgule décimale ;
 *  - BOM UTF-8, sans lequel Excel sous Windows affiche « Ã© » à la place de « é ».
 *
 * Fonctions pures : la génération du contenu est testable indépendamment du
 * déclenchement du téléchargement.
 */

export interface CsvColumn<T> {
  header: string
  /** Valeur brute. Les nombres sont formatés en conventions fr-FR. */
  value: (row: T) => string | number | null | undefined
}

const SEPARATOR = ';'

/**
 * Échappe une cellule.
 *
 * Neutralise aussi l'injection de formule : une cellule commençant par
 * `=`, `+`, `-` ou `@` est interprétée comme une formule par Excel et
 * Google Sheets. On la préfixe d'une apostrophe pour la forcer en texte.
 */
function escapeCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value

  if (guarded.includes(SEPARATOR) || guarded.includes('"') || /[\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`
  }
  return guarded
}

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    // Virgule décimale, sans séparateur de milliers : c'est ce qu'attend
    // l'import numérique d'un tableur configuré en français.
    return String(value).replace('.', ',')
  }
  return value
}

export interface CsvMetadata {
  /** Titre du jeu de données. */
  title: string
  /** Période analysée, telle qu'affichée à l'écran. */
  period?: string
  /** Filtres actifs au moment de l'export. */
  filters?: string
  /** Horodatage de la synchronisation des données source. */
  syncedAt?: string
  /** Mention de confidentialité. */
  confidentiality?: string
}

/**
 * Construit le contenu CSV, en-tête de contexte compris.
 *
 * Le bloc de contexte est délibéré : un CSV exporté circule par courriel et
 * se retrouve consulté hors de son contexte. Sans période ni horodatage, il
 * devient impossible de savoir ce qu'on regarde.
 */
export function buildCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  metadata: CsvMetadata,
): string {
  const lines: string[] = []

  lines.push(escapeCell(metadata.title))
  if (metadata.period) lines.push(`${escapeCell('Période')}${SEPARATOR}${escapeCell(metadata.period)}`)
  if (metadata.filters) lines.push(`${escapeCell('Filtres')}${SEPARATOR}${escapeCell(metadata.filters)}`)
  if (metadata.syncedAt) {
    lines.push(`${escapeCell('Données synchronisées')}${SEPARATOR}${escapeCell(metadata.syncedAt)}`)
  }
  lines.push(
    `${escapeCell('Confidentialité')}${SEPARATOR}${escapeCell(
      metadata.confidentiality ?? 'Document confidentiel — diffusion restreinte',
    )}`,
  )
  lines.push('')

  lines.push(columns.map((column) => escapeCell(column.header)).join(SEPARATOR))

  for (const row of rows) {
    lines.push(
      columns.map((column) => escapeCell(formatValue(column.value(row)))).join(SEPARATOR),
    )
  }

  return lines.join('\r\n')
}

/** Nom de fichier assaini et horodaté. */
export function csvFileName(base: string, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10)
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug}-${stamp}.csv`
}
