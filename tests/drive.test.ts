import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mapDriveError, validateMetadata, type DriveMetadata } from '../src/lib/drive'
import { AppError } from '../src/lib/errors'
import { __resetEnvCacheForTests } from '../src/lib/env'
import { createLogger } from '../src/lib/logger'

/**
 * Le client Drive n'est pas testé contre le réseau : ce sont ses **décisions**
 * qui comptent — quelle erreur produit quel diagnostic, et ce qui est accepté
 * avant téléchargement. Ces deux parties sont pures et testables directement.
 */

const log = createLogger({ suite: 'drive' })

/** Reproduit la forme d'erreur de googleapis / gaxios. */
function gaxiosError(status: number, message = 'Request failed'): Error {
  const error = new Error(message) as Error & { status: number; response: { status: number } }
  error.status = status
  error.response = { status }
  return error
}

beforeEach(() => {
  __resetEnvCacheForTests()
  process.env.GOOGLE_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
  process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token'
  process.env.DRIVE_FILE_ID_PILOTAGE = 'file-pilotage'
  process.env.DRIVE_FILE_ID_CRC = 'file-crc'
  process.env.DRIVE_FILE_ID_KPI = 'file-kpi'
  delete process.env.DRIVE_MAX_FILE_BYTES
})

describe('classification des erreurs Drive', () => {
  test('401 : problème d’authentification', () => {
    const error = mapDriveError(gaxiosError(401), 'download')
    assert.equal(error.kind, 'drive_auth')
    assert.equal(error.retryable, false)
  })

  test('403 : permission manquante, non réessayable', () => {
    // Réessayer un refus de permission ne fait que retarder le diagnostic.
    const error = mapDriveError(gaxiosError(403, 'Insufficient permissions'), 'download')
    assert.equal(error.kind, 'drive_permission')
    assert.equal(error.retryable, false)
    assert.match(error.detail ?? '', /partagé/)
  })

  test('403 de quota : réessayable, contrairement au 403 de permission', () => {
    const error = mapDriveError(gaxiosError(403, 'userRateLimitExceeded'), 'download')
    assert.equal(error.kind, 'drive_quota')
    assert.equal(error.retryable, true)
  })

  test('404 : fichier introuvable', () => {
    const error = mapDriveError(gaxiosError(404), 'metadata')
    assert.equal(error.kind, 'drive_not_found')
    assert.equal(error.retryable, false)
  })

  test('429 : réessayable', () => {
    const error = mapDriveError(gaxiosError(429), 'download')
    assert.equal(error.kind, 'drive_quota')
    assert.equal(error.retryable, true)
  })

  test('5xx : indisponibilité temporaire, réessayable', () => {
    for (const status of [500, 502, 503, 504]) {
      const error = mapDriveError(gaxiosError(status), 'download')
      assert.equal(error.kind, 'drive_unavailable', `statut ${status}`)
      assert.equal(error.retryable, true)
    }
  })

  test('refresh token révoqué : diagnostic actionnable, non réessayable', () => {
    const error = mapDriveError(new Error('invalid_grant: Token has been expired or revoked.'), 'auth')
    assert.equal(error.kind, 'drive_auth')
    assert.equal(error.retryable, false)
    assert.match(error.detail ?? '', /drive:authorize/)
  })

  test('identifiants client erronés', () => {
    const error = mapDriveError(new Error('invalid_client'), 'auth')
    assert.equal(error.kind, 'drive_auth')
    assert.match(error.detail ?? '', /GOOGLE_CLIENT_ID/)
  })

  test('timeout et coupures réseau : réessayables', () => {
    for (const message of ['ETIMEDOUT', 'socket hang up ECONNRESET', 'getaddrinfo ENOTFOUND', 'The operation was aborted']) {
      const error = mapDriveError(new Error(message), 'download')
      assert.equal(error.retryable, true, message)
      assert.equal(error.kind, 'drive_unavailable')
    }
  })

  test('statut lu depuis `response.status` comme depuis `status`', () => {
    const nested = new Error('nope') as Error & { response: { status: number } }
    nested.response = { status: 404 }
    assert.equal(mapDriveError(nested, 'x').kind, 'drive_not_found')
  })

  test('une AppError traverse sans être reclassée', () => {
    const original = new AppError('workbook_invalid', 'déjà typée')
    assert.equal(mapDriveError(original, 'x'), original)
  })
})

describe('confidentialité des erreurs', () => {
  test('aucun jeton ni identifiant de fichier dans la charge publique', () => {
    const error = mapDriveError(
      new Error('failed for file 1a2b3c with token ya29.SECRET_TOKEN_VALUE'),
      'download',
    )
    const payload = JSON.stringify(error.toPublicJSON('corr-1'))
    assert.ok(!payload.includes('ya29'), 'jeton exposé')
    assert.ok(!payload.includes('1a2b3c'), 'identifiant de fichier exposé')
    assert.ok(!payload.includes('SECRET_TOKEN_VALUE'))
  })
})

describe('validation des métadonnées avant téléchargement', () => {
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  const valid: DriveMetadata = {
    id: 'file-pilotage',
    name: 'Honeylang_PF_v3.xlsx',
    mimeType: XLSX_MIME,
    size: 45_000,
    modifiedTime: '2026-08-18T10:00:00.000Z',
    md5Checksum: 'abc123',
    trashed: false,
  }

  test('métadonnées conformes : aucune erreur', () => {
    assert.doesNotThrow(() => validateMetadata('pilotage', 'file-pilotage', valid, log))
  })

  test('identifiant renvoyé différent de celui demandé', () => {
    // Protège contre une réponse incohérente qui ferait afficher les chiffres
    // d'un autre fichier.
    assert.throws(
      () => validateMetadata('pilotage', 'file-pilotage', { ...valid, id: 'autre' }, log),
      (error: unknown) => error instanceof AppError && error.kind === 'drive_not_found',
    )
  })

  test('fichier à la corbeille', () => {
    assert.throws(
      () => validateMetadata('pilotage', 'file-pilotage', { ...valid, trashed: true }, log),
      (error: unknown) => error instanceof AppError && error.kind === 'drive_not_found',
    )
  })

  test('type MIME inattendu : PDF refusé', () => {
    assert.throws(
      () => validateMetadata('pilotage', 'file-pilotage', { ...valid, mimeType: 'application/pdf' }, log),
      (error: unknown) => error instanceof AppError && error.kind === 'workbook_invalid',
    )
  })

  test('un Google Sheet natif est accepté — il sera exporté', () => {
    assert.doesNotThrow(() =>
      validateMetadata(
        'pilotage',
        'file-pilotage',
        { ...valid, mimeType: 'application/vnd.google-apps.spreadsheet', size: 1_000 },
        log,
      ),
    )
  })

  test('taille au-delà de la limite : rejet avant téléchargement', () => {
    process.env.DRIVE_MAX_FILE_BYTES = '1024'
    __resetEnvCacheForTests()

    assert.throws(
      () => validateMetadata('pilotage', 'file-pilotage', { ...valid, size: 2048 }, log),
      (error: unknown) => error instanceof AppError && error.kind === 'workbook_invalid',
    )
  })

  test('export Google Sheets : plafond de 10 Mo imposé par l’API', () => {
    assert.throws(
      () =>
        validateMetadata(
          'pilotage',
          'file-pilotage',
          {
            ...valid,
            mimeType: 'application/vnd.google-apps.spreadsheet',
            size: 11 * 1024 * 1024,
          },
          log,
        ),
      (error: unknown) => error instanceof AppError && error.kind === 'workbook_invalid',
    )
  })

  test('taille inconnue : accepté, la vérification a lieu sur le contenu reçu', () => {
    assert.doesNotThrow(() =>
      validateMetadata('pilotage', 'file-pilotage', { ...valid, size: null }, log),
    )
  })

  test('nom différent : toléré, car un classeur peut être versionné', () => {
    assert.doesNotThrow(() =>
      validateMetadata('pilotage', 'file-pilotage', { ...valid, name: 'Honeylang_PF_v4.xlsx' }, log),
    )
  })
})
