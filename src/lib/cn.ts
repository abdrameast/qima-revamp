/**
 * Concatène des classes conditionnelles.
 *
 * Volontairement minimal — pas de fusion de classes Tailwind concurrentes.
 * Les primitives de `components/ui` sont écrites pour que la classe passée par
 * l'appelant s'ajoute, sans avoir à en écraser une existante.
 */
export function cn(...values: unknown[]): string {
  // `unknown` plutôt qu'une union stricte : les appelants écrivent souvent
  // `cond && 'classe'` où `cond` est un ReactNode, donc potentiellement `0`
  // ou `0n`. Ne garder que les chaînes non vides évite qu'un « 0 » se
  // retrouve dans l'attribut class.
  return values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ')
}
