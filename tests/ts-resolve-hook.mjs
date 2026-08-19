/**
 * Hook de résolution ESM pour exécuter le code source TypeScript sous
 * `node --test --experimental-strip-types`, sans ajouter de dépendance.
 *
 * Node résout les spécificateurs ESM de façon stricte : extension obligatoire,
 * et aucune notion d'alias de chemin. Le code applicatif, lui, est écrit pour
 * le résolveur de Next.js — imports sans extension (`./errors`) et alias
 * `@/*` défini dans tsconfig.json.
 *
 * Ce hook comble exactement cet écart, et rien d'autre : il n'altère ni la
 * compilation ni la sémantique des modules. Le suppression des types reste
 * assurée par Node lui-même.
 */

import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC_ROOT = path.join(PROJECT_ROOT, 'src')

/** Extensions testées pour un spécificateur sans extension, dans l'ordre. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs']

function firstExisting(basePath) {
  if (existsSync(basePath) && statSync(basePath).isFile()) return basePath

  for (const ext of EXTENSIONS) {
    const candidate = basePath + ext
    if (existsSync(candidate)) return candidate
  }

  // Répertoire avec un index
  for (const ext of EXTENSIONS) {
    const candidate = path.join(basePath, 'index' + ext)
    if (existsSync(candidate)) return candidate
  }

  return null
}

export async function resolve(specifier, context, nextResolve) {
  // Alias `@/*` → `src/*`, tel que déclaré dans tsconfig.json.
  if (specifier.startsWith('@/')) {
    const resolved = firstExisting(path.join(SRC_ROOT, specifier.slice(2)))
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true }
    }
  }

  // `server-only` est un marqueur de frontière côté Next : hors du bundler il
  // n'a aucun rôle, et son export par défaut lève volontairement. On le neutralise
  // pour pouvoir tester unitairement les modules serveur.
  if (specifier === 'server-only') {
    return {
      url: pathToFileURL(path.join(PROJECT_ROOT, 'tests', 'stubs', 'server-only.mjs')).href,
      shortCircuit: true,
    }
  }

  // Sous-chemins de Next (`next/server`, `next/headers`…).
  //
  // Le bundler résout ces spécificateurs sans extension ; le résolveur ESM de
  // Node, lui, exige le `.js`. On tente donc le suffixe avant d'abandonner,
  // ce qui permet de tester les modules serveur sans les découper
  // artificiellement pour éviter un import Next.
  if (specifier.startsWith('next/') && !specifier.endsWith('.js')) {
    try {
      return await nextResolve(specifier + '.js', context)
    } catch {
      // Sous-chemin sans fichier `.js` correspondant : on laisse la résolution
      // normale produire son propre message d'erreur.
    }
  }

  // Imports relatifs sans extension.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : PROJECT_ROOT
    const resolved = firstExisting(path.resolve(path.dirname(parentPath), specifier))
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true }
    }
  }

  return nextResolve(specifier, context)
}
