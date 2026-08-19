/**
 * Génère les déclarations `@font-face` de Lufga — uniquement pour les fichiers
 * réellement présents.
 *
 * Exécuté automatiquement avant `dev` et `build` (scripts `predev` / `prebuild`).
 *
 * ## Pourquoi générer plutôt que déclarer en dur
 *
 * Déclarer les cinq graisses en dur dans `globals.css` fonctionne — le
 * navigateur bascule sur la police de repli si un fichier manque — mais il
 * émet une requête 404 par graisse, à chaque chargement de page. Cinq erreurs
 * dans la console à chaque navigation, sur une application qu'on veut soignée.
 *
 * Ce script ne déclare que ce qui existe : zéro requête inutile sans Lufga,
 * activation complète dès que les fichiers sont déposés. Aucune modification
 * de code n'est requise dans les deux cas.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')
const OUTPUT = path.join(process.cwd(), 'src', 'app', 'lufga.generated.css')

/** Graisses attendues, dans l'ordre où elles sont déclarées. */
const WEIGHTS: { file: string; weight: number }[] = [
  { file: 'Lufga-Light.woff2', weight: 300 },
  { file: 'Lufga-Regular.woff2', weight: 400 },
  { file: 'Lufga-Medium.woff2', weight: 500 },
  { file: 'Lufga-SemiBold.woff2', weight: 600 },
  { file: 'Lufga-Bold.woff2', weight: 700 },
]

const HEADER = `/* ============================================================================
 * FICHIER GÉNÉRÉ — ne pas modifier à la main.
 * Produit par \`scripts/generate-font-css.ts\`, exécuté avant dev et build.
 * Pour activer Lufga : déposer les .woff2 dans public/fonts/ (voir son README).
 * ============================================================================ */
`

function build(): { css: string; found: number } {
  const present = WEIGHTS.filter(({ file }) => existsSync(path.join(FONT_DIR, file)))

  if (present.length === 0) {
    return {
      css:
        HEADER +
        `\n/* Aucun fichier Lufga dans public/fonts/ — repli sur Outfit.\n` +
        `   Aucune déclaration @font-face émise, donc aucune requête 404. */\n`,
      found: 0,
    }
  }

  const faces = present
    .map(
      ({ file, weight }) => `@font-face {
  font-family: "Lufga";
  src: url("/fonts/${file}") format("woff2");
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
}`,
    )
    .join('\n\n')

  return { css: `${HEADER}\n${faces}\n`, found: present.length }
}

function main(): void {
  const { css, found } = build()

  mkdirSync(path.dirname(OUTPUT), { recursive: true })

  // N'écrit que si le contenu change : évite de déclencher le rechargement à
  // chaud du serveur de développement à chaque exécution.
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : ''
  if (current !== css) writeFileSync(OUTPUT, css, 'utf8')

  console.log(
    found === 0
      ? '  Lufga absente — repli sur Outfit (aucune requête émise).'
      : `  Lufga active — ${found} graisse(s) sur ${WEIGHTS.length} déclarée(s).`,
  )
}

main()
