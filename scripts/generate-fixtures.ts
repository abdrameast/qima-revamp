/**
 * Génère les classeurs synthétiques utilisés par `DATA_SOURCE=local`.
 *
 *     npm run fixtures:generate
 *
 * Les fichiers produits contiennent uniquement des valeurs inventées. Ils sont
 * volontairement exclus du dépôt (voir .gitignore) puisqu'ils se régénèrent.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildAllWorkbooks, type FixtureOptions } from '../tests/fixtures/build-workbooks'

const OUT_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'generated')

/**
 * Variante pilotée par argument :
 *   npm run fixtures:generate -- --partial   → données partielles
 *   npm run fixtures:generate -- --empty     → journal comptable vide
 */
function optionsFromArgv(): { label: string; options: FixtureOptions } {
  const argv = process.argv.slice(2)
  if (argv.includes('--empty')) {
    return {
      label: 'journal vide (attente du grand livre)',
      options: {
        emptyJournal: true,
        emptyStockRotation: true,
        emptyKpi: true,
        emptyBfr: true,
      },
    }
  }
  if (argv.includes('--partial')) {
    return {
      label: 'données partielles (stocks et KPI non saisis)',
      options: { emptyStockRotation: true, emptyKpi: true },
    }
  }
  return { label: 'jeu complet', options: {} }
}

async function main(): Promise<void> {
  const { label, options } = optionsFromArgv()
  const workbooks = buildAllWorkbooks(options)

  await mkdir(OUT_DIR, { recursive: true })

  for (const [key, buffer] of Object.entries(workbooks)) {
    const file = path.join(OUT_DIR, `${key}.xlsx`)
    await writeFile(file, buffer)
    console.log(`  ✓ ${key}.xlsx  (${(buffer.length / 1024).toFixed(1)} Kio)`)
  }

  console.log(`\nFixtures générées — ${label}`)
  console.log(`Répertoire : ${OUT_DIR}`)
  console.log('\n⚠️  Valeurs entièrement synthétiques. Activer avec DATA_SOURCE=local.')
}

main().catch((error: unknown) => {
  console.error('Échec de génération des fixtures :', error)
  process.exitCode = 1
})
