import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { getDataSource, type WorkbookKey } from './env'
import { AppError } from './errors'
import { fetchAllWorkbooks, EXPECTED_FILE_NAMES, WORKBOOK_KEYS } from './drive'
import { parseAllWorkbooks, type WorkbookInput } from './parse-excel'
import type { AllData, DataOrigin } from './data-types'
import type { Logger } from './logger'

/**
 * Point d'entrée unique de récupération des données.
 *
 * Sépare strictement les trois étapes : récupération des octets → validation
 * structurelle + parsing → données métier. Aucune couche supérieure ne connaît
 * Google Drive.
 */

export interface SyncResult {
  data: AllData
  origin: DataOrigin
  /** Instant de fin de synchronisation, ISO 8601. */
  syncedAt: string
  durationMs: number
}

// ---------------------------------------------------------------------------
// Source « fixtures locales » — développement uniquement
// ---------------------------------------------------------------------------

const FIXTURE_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'generated')

const FIXTURE_FILES: Record<WorkbookKey, string> = {
  pilotage: 'pilotage.xlsx',
  crc: 'crc.xlsx',
  kpi: 'kpi.xlsx',
}

async function loadLocalFixtures(log: Logger): Promise<Record<WorkbookKey, WorkbookInput>> {
  const inputs = {} as Record<WorkbookKey, WorkbookInput>

  for (const key of WORKBOOK_KEYS) {
    const filePath = path.join(FIXTURE_DIR, FIXTURE_FILES[key])
    let buffer: Buffer
    try {
      buffer = await readFile(filePath)
    } catch (error) {
      throw new AppError('config', `fixture manquante : ${FIXTURE_FILES[key]}`, {
        userMessage:
          'Les fixtures locales sont absentes. Exécuter `npm run fixtures:generate`.',
        detail: `Fichier attendu : tests/fixtures/generated/${FIXTURE_FILES[key]}`,
        cause: error,
      })
    }

    inputs[key] = {
      buffer,
      provenance: {
        fileName: `${EXPECTED_FILE_NAMES[key]} (fixture synthétique)`,
        modifiedTime: new Date().toISOString(),
        sizeBytes: buffer.length,
        contentHash: createHash('sha256').update(buffer).digest('hex').slice(0, 16),
        exported: false,
      },
    }
  }

  log.warn('data.source.local', {
    reason: 'DATA_SOURCE=local — données synthétiques, jamais des chiffres réels',
  })

  return inputs
}

// ---------------------------------------------------------------------------
// Source Google Drive
// ---------------------------------------------------------------------------

async function loadFromDrive(log: Logger): Promise<Record<WorkbookKey, WorkbookInput>> {
  const files = await fetchAllWorkbooks(log)
  const inputs = {} as Record<WorkbookKey, WorkbookInput>

  for (const key of WORKBOOK_KEYS) {
    const file = files[key]
    inputs[key] = {
      buffer: file.buffer,
      provenance: {
        fileName: file.name,
        modifiedTime: file.modifiedTime,
        sizeBytes: file.sizeBytes,
        contentHash: file.contentHash,
        exported: file.exported,
      },
    }
  }

  return inputs
}

// ---------------------------------------------------------------------------
// Synchronisation
// ---------------------------------------------------------------------------

/**
 * Récupère et parse les trois classeurs.
 *
 * @throws {AppError} en cas d'échec d'accès Drive ou de structure invalide.
 *   Aucune valeur par défaut n'est substituée à une donnée manquante.
 */
export async function synchronize(log: Logger): Promise<SyncResult> {
  const source = getDataSource()
  const startedAt = Date.now()

  const inputs =
    source === 'local' ? await loadLocalFixtures(log) : await loadFromDrive(log)

  const parseStartedAt = Date.now()
  const data = parseAllWorkbooks(inputs)
  const durationMs = Date.now() - startedAt

  log.info('data.sync.parsed', {
    parseMs: Date.now() - parseStartedAt,
    totalMs: durationMs,
    months: data.dataMensuelle.months.length,
    plLines: Object.keys(data.dataMensuelle.lines).length,
    skus: data.fichesCRC.length,
    hasMonthlyData: data.meta.hasMonthlyData,
    hasKpiData: data.meta.hasKpiData,
  })

  return {
    data,
    origin: source === 'local' ? 'local-fixtures' : 'drive',
    syncedAt: new Date().toISOString(),
    durationMs,
  }
}
