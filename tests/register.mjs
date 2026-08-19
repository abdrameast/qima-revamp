// Enregistre le hook de résolution avant le chargement des tests.
// Utilisé via `node --import ./tests/register.mjs`.
import { register } from 'node:module'
register('./ts-resolve-hook.mjs', import.meta.url)
