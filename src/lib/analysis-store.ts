import { DEFAULT_PERIOD, type ComparisonBasis, type PeriodSelection } from './period'

/**
 * Magasin externe de la sélection d'analyse (période + base de comparaison).
 *
 * Implémenté comme un magasin externe plutôt qu'un simple `useState`, pour
 * deux raisons :
 *
 *  1. **Hydratation.** La valeur est lue dans `sessionStorage`, indisponible
 *     au rendu serveur. Un initialiseur paresseux produirait un HTML serveur
 *     différent du premier rendu client. `useSyncExternalStore` fournit un
 *     `getServerSnapshot` distinct, précisément pour ce cas.
 *
 *  2. **Effets.** Rapatrier la valeur stockée via `useEffect` + `setState`
 *     provoque un rendu en cascade, que le compilateur React signale à juste
 *     titre. Ici, aucun effet n'est nécessaire.
 *
 * Ce qui est stocké se limite à `{ mode, index, comparison }`. Aucune donnée
 * financière n'est écrite dans le navigateur.
 */

const STORAGE_KEY = 'qima.analysis.v1'

export interface AnalysisState {
  selection: PeriodSelection
  comparison: ComparisonBasis
}

const DEFAULT_STATE: AnalysisState = {
  selection: DEFAULT_PERIOD,
  comparison: 'previous',
}

const VALID_MODES = new Set<PeriodSelection['mode']>(['year', 'ytd', 'quarter', 'month'])
const VALID_BASES = new Set<ComparisonBasis>(['none', 'previous', 'budget'])

// ---------------------------------------------------------------------------
// État courant et abonnés
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>()

/**
 * Instantané mis en cache.
 *
 * `getSnapshot` doit renvoyer une valeur **référentiellement stable** tant que
 * rien n'a changé : renvoyer un objet fraîchement construit à chaque appel
 * ferait boucler React indéfiniment.
 */
let snapshot: AnalysisState = DEFAULT_STATE
let hydrated = false

function parse(raw: string | null): AnalysisState | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as {
      mode?: unknown
      index?: unknown
      comparison?: unknown
    }

    const mode = parsed.mode as PeriodSelection['mode']
    if (!VALID_MODES.has(mode)) return null

    const comparison = parsed.comparison as ComparisonBasis

    return {
      selection: {
        mode,
        index: Number.isInteger(parsed.index) ? (parsed.index as number) : 0,
      },
      comparison: VALID_BASES.has(comparison) ? comparison : 'previous',
    }
  } catch {
    // Valeur corrompue ou illisible : on repart des réglages par défaut.
    return null
  }
}

/** Instantané client — lit le stockage au premier appel seulement. */
export function getSnapshot(): AnalysisState {
  if (!hydrated) {
    hydrated = true
    if (typeof window !== 'undefined') {
      try {
        const stored = parse(window.sessionStorage.getItem(STORAGE_KEY))
        if (stored) snapshot = stored
      } catch {
        // Stockage inaccessible (mode privé, politique de sécurité) : sans effet.
      }
    }
  }
  return snapshot
}

/** Instantané serveur — toujours les valeurs par défaut, donc déterministe. */
export function getServerSnapshot(): AnalysisState {
  return DEFAULT_STATE
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function commit(next: AnalysisState): void {
  snapshot = next

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode: next.selection.mode,
          index: next.selection.index,
          comparison: next.comparison,
        }),
      )
    } catch {
      // Quota atteint ou stockage refusé : la sélection reste valable pour la
      // session en cours, elle ne sera simplement pas rejouée au rechargement.
    }
  }

  for (const listener of listeners) listener()
}

export function setSelection(selection: PeriodSelection): void {
  commit({ ...getSnapshot(), selection })
}

export function setComparison(comparison: ComparisonBasis): void {
  commit({ ...getSnapshot(), comparison })
}

/** Réinitialise le magasin — réservé aux tests. */
export function __resetForTests(): void {
  snapshot = DEFAULT_STATE
  hydrated = false
  listeners.clear()
}
