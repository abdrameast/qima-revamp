import 'server-only'
import { randomUUID } from 'node:crypto'

/**
 * Journalisation serveur structurée.
 *
 * Règles non négociables sur ce projet :
 *  - aucun secret, jeton ou identifiant de fichier Drive en clair ;
 *  - aucun contenu de classeur ni valeur financière ;
 *  - aucune PII inutile — l'email de l'utilisateur est réduit à une empreinte
 *    courte et stable, suffisante pour corréler des requêtes sans stocker
 *    l'adresse elle-même.
 *
 * La redaction est appliquée en dernier ressort sur la sortie sérialisée : même
 * si un objet d'erreur googleapis contient un jeton, il ne franchit pas ce filtre.
 */

import { createHash } from 'node:crypto'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const MIN_LEVEL: LogLevel =
  process.env.LOG_LEVEL === 'debug'
    ? 'debug'
    : process.env.NODE_ENV === 'production'
      ? 'info'
      : 'debug'

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Motifs de valeurs qui ne doivent jamais apparaître dans un log.
 * Appliqués sur la chaîne JSON finale.
 */
const REDACTION_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Jetons OAuth Google (access + refresh) et clés API
  { pattern: /ya29\.[A-Za-z0-9_\-]+/g, replacement: '«access_token»' },
  { pattern: /1\/\/[A-Za-z0-9_\-]{20,}/g, replacement: '«refresh_token»' },
  { pattern: /AIza[A-Za-z0-9_\-]{20,}/g, replacement: '«api_key»' },
  { pattern: /re_[A-Za-z0-9_\-]{10,}/g, replacement: '«api_key»' },
  // Clé privée PEM
  {
    pattern: /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
    replacement: '«private_key»',
  },
  // Champs sensibles dans une charge JSON
  {
    pattern:
      /("(?:refresh_token|access_token|client_secret|id_token|password|authorization|cookie)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi,
    replacement: '$1"«masqué»"',
  },
  // Adresses email
  {
    pattern: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
    replacement: '«email»',
  },
]

function redact(serialized: string): string {
  let out = serialized
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/**
 * Empreinte courte et stable d'une valeur identifiante.
 * Permet de corréler sans conserver la valeur (email, identifiant de fichier).
 */
export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10)
}

/**
 * Référence non sensible à un fichier Drive : jamais l'identifiant réel, qui
 * est une capacité d'accès s'il est combiné à un lien de partage.
 */
export function fileRef(workbookKey: string, fileId: string): string {
  return `${workbookKey}:${fingerprint(fileId)}`
}

// ---------------------------------------------------------------------------
// Émission
// ---------------------------------------------------------------------------

export type LogFields = Record<string, unknown>

function emit(level: LogLevel, message: string, fields: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return

  const record = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...fields,
  }

  let line: string
  try {
    line = JSON.stringify(record, jsonReplacer)
  } catch {
    line = JSON.stringify({ level, time: record.time, msg: message, serializationError: true })
  }

  const safe = redact(line)

  if (level === 'error') console.error(safe)
  else if (level === 'warn') console.warn(safe)
  else console.log(safe)
}

/** Sérialise les erreurs sans exposer la pile en production. */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(process.env.NODE_ENV !== 'production' && value.stack
        ? { stack: value.stack.split('\n').slice(0, 4) }
        : {}),
    }
  }
  if (typeof value === 'bigint') return value.toString()
  return value
}

// ---------------------------------------------------------------------------
// Logger contextuel
// ---------------------------------------------------------------------------

export interface Logger {
  /** Identifiant de corrélation propagé sur toute la requête. */
  readonly correlationId: string
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Dérive un logger enfant en ajoutant des champs permanents. */
  child(fields: LogFields): Logger
}

function makeLogger(correlationId: string, base: LogFields): Logger {
  const withBase = (fields?: LogFields): LogFields => ({
    correlationId,
    ...base,
    ...fields,
  })

  return {
    correlationId,
    debug: (m, f) => emit('debug', m, withBase(f)),
    info: (m, f) => emit('info', m, withBase(f)),
    warn: (m, f) => emit('warn', m, withBase(f)),
    error: (m, f) => emit('error', m, withBase(f)),
    child: (fields) => makeLogger(correlationId, { ...base, ...fields }),
  }
}

/**
 * Crée un logger de requête.
 *
 * Réutilise un identifiant de corrélation fourni par l'amont (`x-request-id`,
 * `x-nf-request-id` sur Netlify) pour relier les logs applicatifs à ceux de
 * la plateforme ; en génère un sinon.
 */
export function createRequestLogger(
  headers: Headers | undefined,
  base: LogFields = {},
): Logger {
  // Reprend l'identifiant de la plateforme pour relier les traces
  // applicatives à celles de l'hébergeur.
  const inbound =
    headers?.get('x-vercel-id') ?? // Vercel
    headers?.get('x-nf-request-id') ?? // Netlify
    headers?.get('x-request-id') ??
    headers?.get('x-correlation-id')

  // `x-vercel-id` contient des « :: » (ex. « cdg1::abc123-… ») : on élargit
  // le motif accepté tout en bornant la longueur, pour qu'une valeur forgée
  // ne puisse pas polluer les journaux.
  const correlationId =
    inbound && /^[A-Za-z0-9_:.\-]{6,120}$/.test(inbound) ? inbound : randomUUID()

  return makeLogger(correlationId, base)
}

/** Logger hors requête (tâches de fond, démarrage). */
export function createLogger(base: LogFields = {}): Logger {
  return makeLogger(randomUUID(), base)
}
