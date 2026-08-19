import 'server-only'
import { google, type drive_v3 } from 'googleapis'
import { createHash } from 'node:crypto'
import { getDriveEnv, type WorkbookKey } from './env'
import { AppError } from './errors'
import { fileRef, type Logger } from './logger'
import { DEFAULT_RETRY_POLICY, withRetry } from './retry'

/**
 * Accès Google Drive — strictement serveur, strictement lecture seule.
 *
 * ## Modèle d'authentification
 *
 * OAuth 2.0 « Web server » : compte Google dédié, refresh token stocké côté
 * serveur, échangé contre un access token de courte durée à chaque cycle.
 * Justification du choix et procédure d'autorisation : `docs/GOOGLE_DRIVE.md`.
 *
 * ## ⚠️ Le scope est fixé à l'AUTORISATION, pas à l'exécution
 *
 * Le scope réel d'un refresh token est figé au moment où l'utilisateur a
 * accordé le consentement. Passer `scope` à `setCredentials()` — ce que faisait
 * l'implémentation précédente — ne restreint **rien** : c'est une simple
 * annotation locale. Un jeton émis avec `drive` (lecture-écriture) conserve le
 * droit d'écriture quoi qu'on écrive ici.
 *
 * La garantie de lecture seule repose donc sur deux points :
 *  1. le jeton doit avoir été émis avec `drive.readonly` — voir
 *     `npm run drive:authorize`, qui est le seul chemin d'émission supporté ;
 *  2. ce module n'expose aucune opération d'écriture, et `verifyReadOnlyScope()`
 *     vérifie à l'exécution le scope réellement attaché au jeton.
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet'

/** Limite d'export imposée par l'API Drive pour les documents natifs. */
const GOOGLE_EXPORT_MAX_BYTES = 10 * 1024 * 1024

/** Nom attendu de chaque classeur — vérifié, mais non bloquant. */
export const EXPECTED_FILE_NAMES: Record<WorkbookKey, string> = {
  pilotage: 'Honeylang_PF_v3.xlsx',
  crc: 'QIMA_Honeylang_Fiches_CRC_v5.xlsx',
  kpi: 'Honeylang_KPI_DTC_v1.xlsx',
}

export const WORKBOOK_KEYS: readonly WorkbookKey[] = ['pilotage', 'crc', 'kpi']

// ---------------------------------------------------------------------------
// Résultat
// ---------------------------------------------------------------------------

export interface WorkbookFile {
  key: WorkbookKey
  /** Nom du fichier tel que renvoyé par Drive. */
  name: string
  mimeType: string
  sizeBytes: number
  /** Date de dernière modification côté Drive, en ISO 8601. */
  modifiedTime: string
  /** Empreinte md5 fournie par Drive, si disponible (absente pour les exports). */
  checksum: string | null
  /** Empreinte sha256 calculée localement — toujours présente. */
  contentHash: string
  /** `true` si le fichier était un Google Sheet natif exporté en xlsx. */
  exported: boolean
  buffer: Buffer
}

// ---------------------------------------------------------------------------
// Client authentifié
// ---------------------------------------------------------------------------

function createDriveClient(): drive_v3.Drive {
  const env = getDriveEnv()

  const auth = new google.auth.OAuth2({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
  })

  // Seul le refresh token est fourni : la librairie obtient un access token
  // à la demande. Aucun `scope` n'est passé ici — ce serait trompeur (cf. en-tête).
  auth.setCredentials({ refresh_token: env.refreshToken })

  return google.drive({ version: 'v3', auth, timeout: env.timeoutMs })
}

/**
 * Vérifie le scope réellement attaché au jeton courant.
 *
 * Utilisé par l'endpoint de santé pour détecter un jeton sur-privilégié (émis
 * avant le durcissement, par exemple avec le scope `drive` complet).
 */
export async function verifyReadOnlyScope(
  log: Logger,
): Promise<{ ok: boolean; scopes: string[] }> {
  const env = getDriveEnv()
  const auth = new google.auth.OAuth2({
    clientId: env.clientId,
    clientSecret: env.clientSecret,
  })
  auth.setCredentials({ refresh_token: env.refreshToken })

  try {
    const { token } = await auth.getAccessToken()
    if (!token) return { ok: false, scopes: [] }

    const info = await auth.getTokenInfo(token)
    const scopes = info.scopes ?? []

    const writable = scopes.filter(
      (s) => s.startsWith('https://www.googleapis.com/auth/drive') && !s.endsWith('.readonly'),
    )

    if (writable.length > 0) {
      log.warn('drive.scope.over_privileged', { scopeCount: scopes.length })
      return { ok: false, scopes }
    }
    return { ok: scopes.includes(DRIVE_READONLY_SCOPE), scopes }
  } catch (error) {
    throw mapDriveError(error, 'scope-check')
  }
}

// ---------------------------------------------------------------------------
// Traduction des erreurs
// ---------------------------------------------------------------------------

/**
 * Extrait le statut HTTP d'une erreur googleapis.
 *
 * Volontairement structurel plutôt que `instanceof GaxiosError` : `gaxios` est
 * une dépendance transitive de `googleapis`, pas une dépendance déclarée de ce
 * projet. L'importer créerait un couplage fragile à une version que nous ne
 * contrôlons pas. Selon la version, le statut se trouve sur `status` ou sur
 * `response.status` — les deux sont testés.
 */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const direct = (error as { status?: unknown }).status
  if (typeof direct === 'number') return direct

  const legacy = (error as { code?: unknown }).code
  if (typeof legacy === 'number') return legacy

  const response = (error as { response?: unknown }).response
  if (typeof response === 'object' && response !== null) {
    const nested = (response as { status?: unknown }).status
    if (typeof nested === 'number') return nested
  }

  return undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Traduit une erreur googleapis en `AppError`.
 * Le contexte technique reste dans `message` (journalisé) ; le client ne voit
 * que `userMessage`.
 */
export function mapDriveError(error: unknown, context: string): AppError {
  if (error instanceof AppError) return error

  const status = statusOf(error)
  const raw = messageOf(error)

  // Refresh token révoqué / invalide — l'API renvoie `invalid_grant`.
  if (/invalid_grant|token has been (expired|revoked)/i.test(raw)) {
    return new AppError('drive_auth', `[${context}] refresh token rejeté : ${raw}`, {
      detail:
        "Le refresh token a expiré ou été révoqué. Réémettre une autorisation avec `npm run drive:authorize`.",
      cause: error,
    })
  }

  if (/invalid_client|unauthorized_client/i.test(raw)) {
    return new AppError('drive_auth', `[${context}] client OAuth rejeté : ${raw}`, {
      detail: "GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET ne correspondent pas au jeton.",
      cause: error,
    })
  }

  switch (status) {
    case 401:
      return new AppError('drive_auth', `[${context}] 401 Unauthorized`, { cause: error })
    case 403: {
      if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(raw)) {
        return new AppError('drive_quota', `[${context}] 403 quota : ${raw}`, {
          cause: error,
          retryable: true,
        })
      }
      return new AppError('drive_permission', `[${context}] 403 Forbidden`, {
        detail:
          "Vérifier que le classeur est bien partagé, au moins en lecture, avec le compte Google utilisé.",
        cause: error,
      })
    }
    case 404:
      return new AppError('drive_not_found', `[${context}] 404 Not Found`, {
        detail:
          "Vérifier l'identifiant du fichier, et qu'il n'a pas été déplacé dans la corbeille.",
        cause: error,
      })
    case 429:
      return new AppError('drive_quota', `[${context}] 429 Too Many Requests`, {
        cause: error,
        retryable: true,
      })
  }

  if (status !== undefined && status >= 500) {
    return new AppError('drive_unavailable', `[${context}] ${status} côté Google`, {
      cause: error,
      retryable: true,
    })
  }

  // Timeout / réseau
  if (/timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|aborted/i.test(raw)) {
    return new AppError('drive_unavailable', `[${context}] réseau : ${raw}`, {
      cause: error,
      retryable: true,
    })
  }

  return new AppError('drive_unavailable', `[${context}] ${raw}`, { cause: error })
}

// ---------------------------------------------------------------------------
// Réessais
// ---------------------------------------------------------------------------

/**
 * Enveloppe `withRetry` en traduisant l'erreur au passage.
 *
 * La politique elle-même vit dans `lib/retry` — testable sans réseau. Ici on
 * ne décide que d'une chose : ce qui est récupérable, à savoir les échecs que
 * `mapDriveError` a marqués `retryable` (429, 5xx, réseau, timeout).
 */
async function withDriveRetry<T>(
  context: string,
  log: Logger,
  operation: (attempt: number) => Promise<T>,
): Promise<T> {
  try {
    return await withRetry(operation, {
      isRetryable: (error) => mapDriveError(error, context).retryable,
      onRetry: ({ attempt, delayMs, error }) => {
        log.warn('drive.retry', {
          context,
          attempt,
          maxAttempts: DEFAULT_RETRY_POLICY.maxAttempts,
          delayMs,
          kind: mapDriveError(error, context).kind,
        })
      },
    })
  } catch (error) {
    throw mapDriveError(error, context)
  }
}

// ---------------------------------------------------------------------------
// Métadonnées
// ---------------------------------------------------------------------------

export interface DriveMetadata {
  id: string
  name: string
  mimeType: string
  size: number | null
  modifiedTime: string
  md5Checksum: string | null
  trashed: boolean
}

/**
 * Lit les métadonnées d'un fichier **avant** tout téléchargement.
 *
 * Permet de rejeter un fichier trop volumineux, d'un type inattendu, ou mis à
 * la corbeille, sans consommer de bande passante ni de mémoire.
 */
export async function fetchMetadata(
  drive: drive_v3.Drive,
  key: WorkbookKey,
  fileId: string,
  log: Logger,
): Promise<DriveMetadata> {
  const env = getDriveEnv()

  const response = await withDriveRetry(`metadata:${key}`, log, () =>
    drive.files.get(
      {
        fileId,
        fields: 'id,name,mimeType,size,modifiedTime,md5Checksum,trashed',
        // Compatibilité Drive partagés : sans cela, un classeur déplacé dans
        // un Drive partagé remonterait en 404.
        supportsAllDrives: true,
      },
      { timeout: env.timeoutMs },
    ),
  )

  const d = response.data

  return {
    id: d.id ?? fileId,
    name: d.name ?? '',
    mimeType: d.mimeType ?? '',
    size: d.size != null ? Number(d.size) : null,
    modifiedTime: d.modifiedTime ?? new Date(0).toISOString(),
    md5Checksum: d.md5Checksum ?? null,
    trashed: d.trashed === true,
  }
}

/**
 * Valide les métadonnées avant téléchargement.
 * Toute anomalie est bloquante : mieux vaut une erreur explicite qu'un
 * tableau de bord affichant des chiffres issus du mauvais fichier.
 */
export function validateMetadata(
  key: WorkbookKey,
  expectedFileId: string,
  meta: DriveMetadata,
  log: Logger,
): void {
  const ref = fileRef(key, expectedFileId)

  if (meta.id !== expectedFileId) {
    throw new AppError(
      'drive_not_found',
      `[${key}] identifiant renvoyé différent de celui demandé`,
      { detail: `Classeur « ${key} » : réponse Drive incohérente.` },
    )
  }

  if (meta.trashed) {
    throw new AppError('drive_not_found', `[${key}] fichier dans la corbeille`, {
      detail: `Le classeur « ${meta.name || key} » est dans la corbeille Google Drive.`,
    })
  }

  if (meta.mimeType !== XLSX_MIME && meta.mimeType !== GOOGLE_SHEET_MIME) {
    throw new AppError('workbook_invalid', `[${key}] type MIME inattendu : ${meta.mimeType}`, {
      detail:
        `Le classeur « ${meta.name || key} » n'est ni un fichier .xlsx ` +
        `ni une feuille Google Sheets.`,
    })
  }

  const env = getDriveEnv()
  const limit = meta.mimeType === GOOGLE_SHEET_MIME ? GOOGLE_EXPORT_MAX_BYTES : env.maxFileBytes

  if (meta.size !== null && meta.size > limit) {
    throw new AppError('workbook_invalid', `[${key}] fichier trop volumineux : ${meta.size} o`, {
      detail:
        `Le classeur « ${meta.name || key} » dépasse la taille maximale autorisée ` +
        `(${Math.round(limit / 1024 / 1024)} Mo).`,
    })
  }

  // Le nom est vérifié mais non bloquant : le propriétaire peut légitimement
  // renommer ou versionner un classeur. On trace l'écart pour le diagnostic.
  const expectedName = EXPECTED_FILE_NAMES[key]
  if (meta.name && meta.name !== expectedName) {
    log.info('drive.name_mismatch', { file: ref, expectedName, actualName: meta.name })
  }
}

// ---------------------------------------------------------------------------
// Téléchargement
// ---------------------------------------------------------------------------

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  if (typeof data === 'string') return Buffer.from(data, 'binary')
  throw new AppError('drive_unavailable', 'réponse Drive de type inattendu')
}

async function downloadContent(
  drive: drive_v3.Drive,
  key: WorkbookKey,
  meta: DriveMetadata,
  log: Logger,
): Promise<{ buffer: Buffer; exported: boolean }> {
  const env = getDriveEnv()

  // `files.export` uniquement si la source est une feuille Google native.
  // Pour un vrai .xlsx, `files.get` + `alt=media` est la seule méthode correcte.
  if (meta.mimeType === GOOGLE_SHEET_MIME) {
    const response = await withDriveRetry(`export:${key}`, log, () =>
      drive.files.export(
        { fileId: meta.id, mimeType: XLSX_MIME },
        { responseType: 'arraybuffer', timeout: env.timeoutMs },
      ),
    )
    return { buffer: toBuffer(response.data), exported: true }
  }

  const response = await withDriveRetry(`download:${key}`, log, () =>
    drive.files.get(
      { fileId: meta.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer', timeout: env.timeoutMs },
    ),
  )
  return { buffer: toBuffer(response.data), exported: false }
}

/** Signature ZIP — tout .xlsx valide est une archive ZIP (`PK\x03\x04`). */
function assertLooksLikeXlsx(key: WorkbookKey, name: string, buffer: Buffer): void {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    throw new AppError('workbook_invalid', `[${key}] contenu non reconnu comme .xlsx`, {
      detail: `Le contenu du classeur « ${name || key} » n'est pas un fichier .xlsx exploitable.`,
    })
  }
}

/** Télécharge et valide un classeur. */
async function fetchWorkbook(
  drive: drive_v3.Drive,
  key: WorkbookKey,
  fileId: string,
  log: Logger,
): Promise<WorkbookFile> {
  const ref = fileRef(key, fileId)
  const startedAt = Date.now()

  const meta = await fetchMetadata(drive, key, fileId, log)
  validateMetadata(key, fileId, meta, log)

  const { buffer, exported } = await downloadContent(drive, key, meta, log)

  // Un fichier peut grossir entre la lecture des métadonnées et le
  // téléchargement : on revérifie sur le contenu réellement reçu.
  const env = getDriveEnv()
  if (buffer.length > env.maxFileBytes) {
    throw new AppError('workbook_invalid', `[${key}] contenu téléchargé trop volumineux`, {
      detail: `Le classeur « ${meta.name || key} » dépasse la taille maximale autorisée.`,
    })
  }

  assertLooksLikeXlsx(key, meta.name, buffer)

  // Le checksum md5 n'est fourni que pour les fichiers binaires stockés tels
  // quels ; il est absent des exports de documents natifs.
  if (!exported && meta.md5Checksum) {
    const actual = createHash('md5').update(buffer).digest('hex')
    if (actual !== meta.md5Checksum) {
      throw new AppError('workbook_invalid', `[${key}] checksum md5 non concordant`, {
        detail:
          `Le téléchargement du classeur « ${meta.name || key} » est incomplet ou corrompu. ` +
          `Réessayez.`,
        retryable: true,
      })
    }
  }

  log.info('drive.workbook.fetched', {
    file: ref,
    sizeBytes: buffer.length,
    exported,
    modifiedTime: meta.modifiedTime,
    durationMs: Date.now() - startedAt,
  })

  return {
    key,
    name: meta.name,
    mimeType: meta.mimeType,
    sizeBytes: buffer.length,
    modifiedTime: meta.modifiedTime,
    checksum: meta.md5Checksum,
    contentHash: createHash('sha256').update(buffer).digest('hex').slice(0, 16),
    exported,
    buffer,
  }
}

/**
 * Récupère les trois classeurs.
 *
 * Les trois requêtes sont indépendantes et lancées en parallèle. On attend
 * l'ensemble des résultats (`allSettled`) avant de décider : cela évite qu'un
 * échec précoce masque un second problème, et donne un diagnostic complet en
 * une seule tentative.
 */
export async function fetchAllWorkbooks(log: Logger): Promise<Record<WorkbookKey, WorkbookFile>> {
  const env = getDriveEnv()
  const drive = createDriveClient()
  const startedAt = Date.now()

  log.info('drive.sync.start', { workbooks: WORKBOOK_KEYS.length })

  const settled = await Promise.allSettled(
    WORKBOOK_KEYS.map((key) => fetchWorkbook(drive, key, env.fileIds[key], log)),
  )

  const files = {} as Record<WorkbookKey, WorkbookFile>
  const failures: { key: WorkbookKey; error: AppError }[] = []

  settled.forEach((outcome, index) => {
    const key = WORKBOOK_KEYS[index]
    if (outcome.status === 'fulfilled') {
      files[key] = outcome.value
    } else {
      failures.push({ key, error: mapDriveError(outcome.reason, key) })
    }
  })

  if (failures.length > 0) {
    for (const { key, error } of failures) {
      log.error('drive.workbook.failed', {
        workbook: key,
        kind: error.kind,
        reason: error.message,
      })
    }

    // On remonte l'échec le plus explicite plutôt qu'un générique : une erreur
    // de permission est plus actionnable qu'un « service indisponible ».
    const priority: Record<string, number> = {
      drive_auth: 5,
      drive_permission: 4,
      drive_not_found: 3,
      workbook_invalid: 2,
      drive_quota: 1,
    }
    failures.sort((a, b) => (priority[b.error.kind] ?? 0) - (priority[a.error.kind] ?? 0))

    const primary = failures[0].error
    const names = failures.map((f) => f.key).join(', ')

    throw new AppError(primary.kind, `échec de synchronisation (${names}) : ${primary.message}`, {
      userMessage: primary.userMessage,
      detail:
        failures.length > 1
          ? `${failures.length} classeurs sur ${WORKBOOK_KEYS.length} sont concernés (${names}).`
          : (primary.detail ?? `Classeur concerné : ${names}.`),
      retryable: primary.retryable,
    })
  }

  log.info('drive.sync.done', {
    durationMs: Date.now() - startedAt,
    totalBytes: WORKBOOK_KEYS.reduce((sum, k) => sum + files[k].sizeBytes, 0),
  })

  return files
}
