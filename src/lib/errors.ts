/**
 * Erreurs applicatives typées.
 *
 * Chaque erreur porte deux messages distincts :
 *  - `userMessage` — affichable tel quel dans l'interface, en français, sans
 *    aucun détail technique (pas d'identifiant de fichier, pas de trace) ;
 *  - `message` — destiné au log serveur uniquement.
 *
 * Ce module ne dépend pas de `server-only` : les types sont partagés avec le
 * client pour typer les réponses d'API, mais aucune instance n'est sérialisée
 * vers le client autrement que via `toPublicJSON()`.
 */

/** Catégorie d'échec, exposée au client pour choisir l'affichage. */
export type AppErrorKind =
  | 'config' // configuration serveur incomplète
  | 'auth' // session absente / invalide
  | 'forbidden' // authentifié mais non autorisé
  | 'drive_auth' // refresh token invalide ou révoqué
  | 'drive_permission' // 403 — fichier non partagé avec le compte
  | 'drive_not_found' // 404 — identifiant erroné ou fichier supprimé
  | 'drive_quota' // 429 / quota dépassé
  | 'drive_unavailable' // 5xx, timeout, réseau
  | 'workbook_invalid' // fichier illisible, onglet ou colonne manquante
  | 'rate_limited' // trop de tentatives
  | 'internal'

/** Statut HTTP associé à chaque catégorie. */
const STATUS: Record<AppErrorKind, number> = {
  config: 503,
  auth: 401,
  forbidden: 403,
  drive_auth: 503,
  drive_permission: 503,
  drive_not_found: 503,
  drive_quota: 503,
  drive_unavailable: 503,
  workbook_invalid: 422,
  rate_limited: 429,
  internal: 500,
}

/** Message affichable par défaut pour chaque catégorie. */
const USER_MESSAGE: Record<AppErrorKind, string> = {
  config:
    "La configuration serveur est incomplète. Le tableau de bord ne peut pas accéder aux données sources.",
  auth: 'Votre session a expiré. Veuillez vous reconnecter.',
  forbidden: "Vous n'avez pas accès à cette ressource.",
  drive_auth:
    "L'autorisation Google Drive n'est plus valide. Une réautorisation est nécessaire.",
  drive_permission:
    "Le compte de service n'a pas accès à l'un des classeurs sources.",
  drive_not_found:
    "L'un des classeurs sources est introuvable sur Google Drive.",
  drive_quota:
    'Le quota Google Drive est temporairement dépassé. Réessayez dans quelques minutes.',
  drive_unavailable:
    'Google Drive est momentanément injoignable. Réessayez dans quelques instants.',
  workbook_invalid:
    "La structure de l'un des classeurs a changé : les données ne peuvent pas être interprétées de façon fiable.",
  rate_limited: 'Trop de tentatives. Réessayez dans quelques minutes.',
  internal: 'Une erreur inattendue est survenue.',
}

export interface AppErrorOptions {
  /** Message affichable, s'il doit être plus précis que le défaut. */
  userMessage?: string
  /** Détail non sensible, affichable sous le message principal. */
  detail?: string
  /** Erreur d'origine, journalisée mais jamais renvoyée au client. */
  cause?: unknown
  /** `true` si une nouvelle tentative a des chances d'aboutir. */
  retryable?: boolean
}

export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly status: number
  readonly userMessage: string
  readonly detail?: string
  readonly retryable: boolean

  constructor(kind: AppErrorKind, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'AppError'
    this.kind = kind
    this.status = STATUS[kind]
    this.userMessage = options.userMessage ?? USER_MESSAGE[kind]
    this.detail = options.detail
    this.retryable =
      options.retryable ??
      (kind === 'drive_unavailable' || kind === 'drive_quota')
  }

  /**
   * Représentation sûre pour le client. Ne contient jamais `message`,
   * `cause`, ni la pile d'appels.
   */
  toPublicJSON(correlationId?: string): PublicError {
    return {
      kind: this.kind,
      error: this.userMessage,
      ...(this.detail ? { detail: this.detail } : {}),
      retryable: this.retryable,
      ...(correlationId ? { correlationId } : {}),
    }
  }
}

/** Forme exacte de l'objet d'erreur renvoyé par l'API. */
export interface PublicError {
  kind: AppErrorKind
  error: string
  detail?: string
  retryable: boolean
  /** Identifiant à citer au support pour retrouver la trace serveur. */
  correlationId?: string
}

/** Convertit n'importe quelle valeur levée en `AppError`. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Error && error.name === 'ConfigError') {
    return new AppError('config', error.message, { cause: error })
  }
  return new AppError('internal', error instanceof Error ? error.message : String(error), {
    cause: error,
  })
}
