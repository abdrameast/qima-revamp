import * as XLSX from 'xlsx'
import { AppError } from './errors'
import type { WorkbookKey } from './env'

/**
 * Lecture et validation structurelle des classeurs.
 *
 * Ce module s'interpose entre le téléchargement (`drive.ts`) et le parsing
 * (`parse-excel.ts`). Son rôle est de garantir qu'un classeur a bien la forme
 * attendue **avant** que le moindre calcul financier ne soit lancé.
 *
 * Principe directeur : en cas de doute, échouer. Un onglet renommé ou une
 * colonne déplacée doit produire une erreur explicite, jamais une valeur par
 * défaut. Afficher « 0 € » là où la donnée est en réalité illisible est le
 * pire résultat possible pour un tableau de bord de direction.
 */

// ---------------------------------------------------------------------------
// Grille de cellules
// ---------------------------------------------------------------------------

/** Valeur brute d'une cellule telle que renvoyée par SheetJS. */
export type Cell = string | number | boolean | Date | null

/** Onglet sous forme de grille indexée `[ligne][colonne]`. */
export type Grid = Cell[][]

export function cellText(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

export function cellNumber(value: Cell): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return null
  const parsed = Number(String(value).replace(/\s| /g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

// ---------------------------------------------------------------------------
// Résolution tolérante des noms d'onglets
// ---------------------------------------------------------------------------

/**
 * Réduit un nom d'onglet à son noyau comparable.
 *
 * Les onglets sources sont préfixés d'émojis (`📊 DATA_MENSUELLE`). Comparer
 * la chaîne exacte rendrait le parsing cassable par un simple changement
 * d'émoji ou d'espace insécable. On compare donc sur les caractères
 * alphanumériques, accents retirés, en majuscules.
 */
function sheetKey(name: string): string {
  return foldAccents(name).replace(/[^A-Z0-9]/g, '')
}

/** Majuscules sans diacritiques — comparaison insensible aux accents. */
function foldAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

/** Retrouve un onglet par son nom canonique, en tolérant préfixes et accents. */
export function resolveSheetName(
  workbook: XLSX.WorkBook,
  canonicalName: string,
): string | null {
  if (workbook.Sheets[canonicalName]) return canonicalName

  const target = sheetKey(canonicalName)
  const match = workbook.SheetNames.find((name) => sheetKey(name) === target)
  if (match) return match

  // Repli : correspondance par préfixe, pour absorber un suffixe de version
  // (« DATA_MENSUELLE v2 ») sans accepter n'importe quoi.
  const prefixed = workbook.SheetNames.filter((name) => sheetKey(name).startsWith(target))
  return prefixed.length === 1 ? prefixed[0] : null
}

// ---------------------------------------------------------------------------
// Schéma attendu
// ---------------------------------------------------------------------------

/** Contrôle structurel appliqué à un onglet une fois localisé. */
export interface SheetRequirement {
  /** Nom canonique tel qu'attendu dans le classeur. */
  name: string
  /** Description lisible, utilisée dans les messages d'erreur. */
  label: string
  /**
   * Marqueur structurel devant être présent. Sa disparition signale un
   * changement de mise en page qui invalide les index de colonnes.
   */
  marker?: {
    description: string
    test: (grid: Grid) => boolean
  }
}

/** Cherche un texte dans les `limit` premières lignes, toutes colonnes. */
function hasTextAnywhere(grid: Grid, needle: string, limit = 80): boolean {
  const target = foldAccents(needle)
  return grid
    .slice(0, limit)
    .some((row) => row.some((cell) => foldAccents(cellText(cell)).includes(target)))
}

/** Cherche une cellule dont le texte est exactement `value`, dans une colonne. */
function hasExactInColumn(grid: Grid, column: number, value: string, limit = 80): boolean {
  const target = foldAccents(value)
  return grid.slice(0, limit).some((row) => foldAccents(cellText(row[column])) === target)
}

export const WORKBOOK_SCHEMA: Record<
  WorkbookKey,
  { fileLabel: string; sheets: SheetRequirement[] }
> = {
  pilotage: {
    fileLabel: 'Honeylang_PF_v3.xlsx',
    sheets: [
      {
        name: '📊 DATA_MENSUELLE',
        label: 'Journal mensuel',
        marker: {
          description: 'ligne d\'en-tête contenant « Cat. » en colonne B',
          test: (grid) => hasExactInColumn(grid, 1, 'Cat.'),
        },
      },
      {
        name: '⚖️ BFR',
        label: 'Besoin en fonds de roulement',
        marker: {
          description: 'ligne d\'en-tête avec des libellés de mois (ex. « janv-26 »)',
          test: (grid) =>
            grid.slice(0, 40).some((row) => row.some((c) => /-2\d$/.test(cellText(c)))),
        },
      },
      { name: '📦 STOCK_ROTATION', label: 'Rotation des stocks' },
      {
        name: '💰 BUDGET_12M',
        label: 'Budget 12 mois',
        marker: {
          description: 'ligne d\'en-tête contenant « Cat. » en colonne B',
          test: (grid) => hasExactInColumn(grid, 1, 'Cat.'),
        },
      },
      {
        name: '⚙️ CANAUX_PARAMS',
        label: 'Paramètres canaux',
        marker: {
          description: 'ligne « Commission plateforme »',
          test: (grid) => hasTextAnywhere(grid, 'Commission'),
        },
      },
      { name: '💧 TRESORERIE_PILOTAGE', label: 'Pilotage de trésorerie' },
    ],
  },
  crc: {
    fileLabel: 'QIMA_Honeylang_Fiches_CRC_v5.xlsx',
    sheets: [
      {
        name: '📊 FICHES CRC',
        label: 'Fiches coût de revient complet',
        marker: {
          description: 'ligne d\'en-tête « PRODUIT » en colonne A',
          test: (grid) => hasExactInColumn(grid, 0, 'PRODUIT'),
        },
      },
      {
        name: '⚙️ PARAMÈTRES',
        label: 'Paramètres CRC',
        marker: {
          description: 'bloc « CHARGES FIXES MENSUELLES »',
          test: (grid) => hasTextAnywhere(grid, 'CHARGES FIXES'),
        },
      },
    ],
  },
  kpi: {
    fileLabel: 'Honeylang_KPI_DTC_v1.xlsx',
    sheets: [
      {
        name: '📥 PARAMS_MANUELS',
        label: 'Saisie mensuelle',
        marker: {
          description: 'ligne « CA réel Shopify »',
          test: (grid) => hasTextAnywhere(grid, 'CA réel'),
        },
      },
      {
        name: '⚙️ CALCULS_AUTO',
        label: 'Calculs automatiques',
        marker: {
          description: 'ligne « CA TOTAL CONSOLIDÉ »',
          test: (grid) => hasTextAnywhere(grid, 'CA TOTAL'),
        },
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// Classeur chargé
// ---------------------------------------------------------------------------

/**
 * Classeur lu une seule fois, avec ses onglets déjà convertis en grilles.
 *
 * L'implémentation précédente appelait `XLSX.read()` pour **chaque** onglet,
 * soit dix décompressions complètes des trois classeurs à chaque
 * synchronisation. Ici, chaque fichier n'est décodé qu'une fois.
 */
export interface LoadedWorkbook {
  key: WorkbookKey
  sheets: Record<string, Grid>
  /** Onglets réellement présents, pour le diagnostic. */
  availableSheetNames: string[]
}

export interface SheetIssue {
  workbook: WorkbookKey
  sheet: string
  label: string
  problem: 'missing_sheet' | 'empty_sheet' | 'missing_marker'
  detail: string
}

/**
 * Lit un classeur et valide sa structure.
 *
 * @throws {AppError} `workbook_invalid` si le fichier est illisible ou si un
 *   onglet requis est absent, vide, ou a perdu son marqueur structurel.
 */
export function loadWorkbook(key: WorkbookKey, buffer: Buffer): LoadedWorkbook {
  const schema = WORKBOOK_SCHEMA[key]

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      // Aucune donnée source n'utilise de macro ni de lien externe : on
      // désactive tout ce qui n'est pas strictement nécessaire au parsing.
      cellFormula: false,
      cellHTML: false,
      bookVBA: false,
      dense: false,
    })
  } catch (error) {
    throw new AppError('workbook_invalid', `[${key}] XLSX.read a échoué`, {
      detail: `Le classeur « ${schema.fileLabel} » est illisible ou corrompu.`,
      cause: error,
    })
  }

  const sheets: Record<string, Grid> = {}
  const issues: SheetIssue[] = []

  for (const requirement of schema.sheets) {
    const actualName = resolveSheetName(workbook, requirement.name)

    if (!actualName) {
      issues.push({
        workbook: key,
        sheet: requirement.name,
        label: requirement.label,
        problem: 'missing_sheet',
        detail: `onglet « ${requirement.name} » introuvable`,
      })
      continue
    }

    const grid = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[actualName], {
      header: 1,
      defval: null,
      blankrows: true,
      raw: true,
    }) as Grid

    if (grid.length === 0) {
      issues.push({
        workbook: key,
        sheet: requirement.name,
        label: requirement.label,
        problem: 'empty_sheet',
        detail: `onglet « ${requirement.name} » vide`,
      })
      continue
    }

    if (requirement.marker && !requirement.marker.test(grid)) {
      issues.push({
        workbook: key,
        sheet: requirement.name,
        label: requirement.label,
        problem: 'missing_marker',
        detail:
          `onglet « ${requirement.name} » : ${requirement.marker.description} introuvable`,
      })
      continue
    }

    sheets[requirement.name] = grid
  }

  if (issues.length > 0) {
    const summary = issues.map((i) => `« ${i.label} » — ${i.detail}`).join(' ; ')
    throw new AppError('workbook_invalid', `[${key}] structure invalide : ${summary}`, {
      detail:
        `Le classeur « ${schema.fileLabel} » ne correspond plus à la structure attendue : ` +
        `${issues.map((i) => i.label).join(', ')}. ` +
        `Les calculs sont suspendus pour éviter d'afficher des chiffres erronés.`,
    })
  }

  return {
    key,
    sheets,
    availableSheetNames: workbook.SheetNames,
  }
}

/** Récupère une grille validée. */
export function sheet(loaded: LoadedWorkbook, name: string): Grid {
  const grid = loaded.sheets[name]
  if (!grid) {
    // Ne devrait pas arriver : `loadWorkbook` a déjà tout validé.
    throw new AppError('workbook_invalid', `[${loaded.key}] onglet « ${name} » non chargé`)
  }
  return grid
}
