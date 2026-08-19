import 'server-only'

/**
 * Validation typée de la configuration d'environnement.
 *
 * Toute la configuration est strictement serveur : aucune variable n'est
 * préfixée `NEXT_PUBLIC_`, donc rien n'atteint le bundle client.
 *
 * La validation est **paresseuse et mémoïsée** plutôt qu'exécutée à
 * l'import : `next build` évalue les modules pour collecter les routes, et
 * une exception à l'import ferait échouer la compilation sur une machine de
 * CI qui n'a légitimement pas les secrets de production. Les erreurs sont
 * donc levées à la première requête qui a réellement besoin de la valeur,
 * avec un message actionnable.
 */

// ---------------------------------------------------------------------------
// Erreur de configuration
// ---------------------------------------------------------------------------

export class ConfigError extends Error {
  readonly variables: string[]

  constructor(message: string, variables: string[]) {
    super(message)
    this.name = 'ConfigError'
    this.variables = variables
  }
}

/** Agrège plusieurs problèmes en une seule erreur lisible. */
function fail(problems: { name: string; hint: string }[]): never {
  const lines = problems.map((p) => `  • ${p.name} — ${p.hint}`).join('\n')
  throw new ConfigError(
    `Configuration d'environnement invalide :\n${lines}\n\n` +
      `Voir .env.example pour le modèle complet.`,
    problems.map((p) => p.name),
  )
}

function raw(name: string): string | undefined {
  const v = process.env[name]
  if (v === undefined) return undefined
  const trimmed = v.trim()
  return trimmed === '' ? undefined : trimmed
}

// ---------------------------------------------------------------------------
// Environnement d'exécution
// ---------------------------------------------------------------------------

export const isProduction = process.env.NODE_ENV === 'production'
export const isTest = process.env.NODE_ENV === 'test'

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

export interface AuthEnv {
  /** Clé HMAC de signature des sessions. */
  sessionSecret: string
  /** Adresses autorisées, déjà normalisées. */
  allowedEmails: readonly string[]
  /** Mot de passe partagé du tableau de bord. */
  dashboardPassword: string
  /** Durée de vie d'une session, en secondes. */
  sessionMaxAgeSeconds: number
}

const MIN_SECRET_LENGTH = 32
const MIN_PASSWORD_LENGTH = 12

/**
 * Normalise une adresse email pour comparaison : suppression des espaces,
 * normalisation Unicode NFKC (neutralise les homoglyphes de compatibilité)
 * puis passage en minuscules.
 */
export function normalizeEmail(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

let authEnvCache: AuthEnv | null = null

export function getAuthEnv(): AuthEnv {
  if (authEnvCache) return authEnvCache

  const problems: { name: string; hint: string }[] = []

  // `SESSION_SECRET` est le nom canonique ; `NEXTAUTH_SECRET` reste accepté
  // pour ne pas casser le déploiement Netlify existant, qui l'utilise déjà.
  const secret = raw('SESSION_SECRET') ?? raw('NEXTAUTH_SECRET')
  if (!secret) {
    problems.push({
      name: 'SESSION_SECRET',
      hint: 'absent. Générer une valeur avec `openssl rand -base64 32`.',
    })
  } else if (secret.length < MIN_SECRET_LENGTH) {
    problems.push({
      name: 'SESSION_SECRET',
      hint: `trop court (${secret.length} caractères, minimum ${MIN_SECRET_LENGTH}).`,
    })
  }

  const emailsRaw = raw('ALLOWED_EMAILS')
  const allowedEmails = (emailsRaw ?? '')
    .split(',')
    .map(normalizeEmail)
    .filter((e) => e.length > 0 && e.includes('@'))

  if (allowedEmails.length === 0) {
    problems.push({
      name: 'ALLOWED_EMAILS',
      hint: 'aucune adresse valide. Format attendu : `a@b.fr,c@d.fr`.',
    })
  }

  const password = raw('DASHBOARD_PASSWORD')
  if (!password) {
    problems.push({ name: 'DASHBOARD_PASSWORD', hint: 'absent.' })
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push({
      name: 'DASHBOARD_PASSWORD',
      hint: `trop court (${password.length} caractères, minimum ${MIN_PASSWORD_LENGTH}).`,
    })
  }

  if (problems.length > 0) fail(problems)

  const hours = Number(raw('AUTH_SESSION_MAX_AGE_HOURS') ?? '12')
  const sessionMaxAgeSeconds =
    Number.isFinite(hours) && hours > 0 && hours <= 24 * 30
      ? Math.round(hours * 3600)
      : 12 * 3600

  authEnvCache = {
    sessionSecret: secret!,
    allowedEmails,
    dashboardPassword: password!,
    sessionMaxAgeSeconds,
  }
  return authEnvCache
}

// ---------------------------------------------------------------------------
// Origine de l'application (redirections + CSRF)
// ---------------------------------------------------------------------------

/**
 * Origine publique canonique, si elle est configurée.
 *
 * `APP_ORIGIN` prime toujours. À défaut, on accepte les variables injectées
 * par l'hébergeur, ce qui évite d'exiger une configuration manuelle :
 *
 *  - `VERCEL_PROJECT_PRODUCTION_URL` — domaine de production stable, sans
 *    protocole. C'est celui qu'il faut privilégier : `VERCEL_URL` pointe sur
 *    le déploiement courant (URL unique par commit), ce qui ferait échouer la
 *    vérification CSRF sur les aperçus.
 *  - `URL` — équivalent Netlify.
 */
export function getAppOrigin(): string | null {
  const explicit = raw('APP_ORIGIN')
  const platform =
    raw('VERCEL_PROJECT_PRODUCTION_URL') ?? raw('VERCEL_URL') ?? raw('URL')

  const candidate = explicit ?? platform
  if (!candidate) return null

  // Vercel expose l'hôte sans protocole ; on le complète.
  const withProtocol = /^https?:\/\//.test(candidate) ? candidate : `https://${candidate}`

  try {
    return new URL(withProtocol).origin
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Contournement d'authentification — DÉVELOPPEMENT LOCAL UNIQUEMENT
// ---------------------------------------------------------------------------

/**
 * Adresse attribuée à la session factice lorsque le contournement est actif.
 * Volontairement reconnaissable : elle apparaît dans l'interface et les logs.
 */
export const AUTH_BYPASS_EMAIL = 'acces-local@developpement.invalid'

/**
 * Indique si l'authentification est contournée.
 *
 * ⚠️ Trois verrous cumulatifs, tous nécessaires :
 *
 *  1. `NODE_ENV !== 'production'` — Next.js force `production` sur
 *     `next build` et `next start`. Un déploiement ne peut donc pas activer
 *     ce mode, quelle que soit la configuration de l'hébergeur.
 *  2. `AUTH_DISABLED=true` doit être explicitement présent. Aucune valeur par
 *     défaut, aucune activation implicite.
 *  3. La valeur est lue à chaque appel, jamais mémoïsée : impossible qu'un
 *     état résiduel maintienne le contournement après changement de config.
 *
 * Lorsqu'il est actif, l'interface affiche un bandeau permanent et la
 * synchronisation reste soumise aux mêmes règles qu'en temps normal.
 */
export function isAuthBypassEnabled(): boolean {
  if (isProduction) return false
  return process.env.AUTH_DISABLED === 'true'
}

// ---------------------------------------------------------------------------
// Source de données
// ---------------------------------------------------------------------------

export type DataSource = 'drive' | 'local'

/**
 * `local` lit des fixtures synthétiques au lieu d'appeler Google Drive.
 * Réservé au développement : la valeur est ignorée en production, pour qu'une
 * variable oubliée ne puisse jamais servir de fausses données à un dirigeant.
 */
export function getDataSource(): DataSource {
  if (isProduction) return 'drive'
  return raw('DATA_SOURCE') === 'local' ? 'local' : 'drive'
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

export type WorkbookKey = 'pilotage' | 'crc' | 'kpi'

export interface DriveEnv {
  clientId: string
  clientSecret: string
  refreshToken: string
  fileIds: Record<WorkbookKey, string>
  timeoutMs: number
  maxFileBytes: number
}

const DRIVE_FILE_ID_VARS: Record<WorkbookKey, string> = {
  pilotage: 'DRIVE_FILE_ID_PILOTAGE',
  crc: 'DRIVE_FILE_ID_CRC',
  kpi: 'DRIVE_FILE_ID_KPI',
}

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024

function positiveInt(name: string, fallback: number, max: number): number {
  const v = raw(name)
  if (!v) return fallback
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0 || n > max) return fallback
  return Math.round(n)
}

let driveEnvCache: DriveEnv | null = null

export function getDriveEnv(): DriveEnv {
  if (driveEnvCache) return driveEnvCache

  const problems: { name: string; hint: string }[] = []

  const clientId = raw('GOOGLE_CLIENT_ID')
  const clientSecret = raw('GOOGLE_CLIENT_SECRET')
  const refreshToken = raw('GOOGLE_REFRESH_TOKEN')

  if (!clientId) {
    problems.push({
      name: 'GOOGLE_CLIENT_ID',
      hint: 'absent. Identifiant client OAuth « Web application ».',
    })
  }
  if (!clientSecret) {
    problems.push({ name: 'GOOGLE_CLIENT_SECRET', hint: 'absent.' })
  }
  if (!refreshToken) {
    problems.push({
      name: 'GOOGLE_REFRESH_TOKEN',
      hint: 'absent. Exécuter `npm run drive:authorize` pour en émettre un.',
    })
  }

  const fileIds = {} as Record<WorkbookKey, string>
  for (const [key, varName] of Object.entries(DRIVE_FILE_ID_VARS) as [
    WorkbookKey,
    string,
  ][]) {
    const id = raw(varName)
    if (!id) {
      problems.push({
        name: varName,
        hint: 'absent. Segment `/file/d/<ID>/view` de l\'URL Drive.',
      })
    } else {
      fileIds[key] = id
    }
  }

  if (problems.length > 0) fail(problems)

  driveEnvCache = {
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    fileIds,
    timeoutMs: positiveInt('DRIVE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 120_000),
    maxFileBytes: positiveInt(
      'DRIVE_MAX_FILE_BYTES',
      DEFAULT_MAX_FILE_BYTES,
      200 * 1024 * 1024,
    ),
  }
  return driveEnvCache
}

/** Durée de vie du cache serveur des données parsées, en secondes. */
export function getDataCacheTtlSeconds(): number {
  return positiveInt('DATA_CACHE_TTL_SECONDS', 900, 86_400)
}

/**
 * Diagnostic de configuration sans lever d'exception : utilisé par l'endpoint
 * de santé. Ne renvoie **que** des noms de variables et des booléens — jamais
 * une valeur, même tronquée.
 */
export function describeConfig(): {
  auth: { ok: boolean; missing: string[] }
  drive: { ok: boolean; missing: string[] }
  dataSource: DataSource
} {
  const check = (fn: () => unknown) => {
    try {
      fn()
      return { ok: true, missing: [] as string[] }
    } catch (error) {
      if (error instanceof ConfigError) {
        return { ok: false, missing: error.variables }
      }
      return { ok: false, missing: ['(erreur inattendue)'] }
    }
  }

  return {
    auth: check(getAuthEnv),
    drive: getDataSource() === 'local'
      ? { ok: true, missing: [] }
      : check(getDriveEnv),
    dataSource: getDataSource(),
  }
}

/** Réinitialise les caches — réservé aux tests. */
export function __resetEnvCacheForTests(): void {
  authEnvCache = null
  driveEnvCache = null
}
