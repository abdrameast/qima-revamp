import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AppError } from '../src/lib/errors'
import { cellNumber, cellText, loadWorkbook, sheet } from '../src/lib/workbook'
import {
  buildCrcRows,
  buildCustomWorkbook,
  buildKpiRows,
  buildPilotageRows,
  buildPilotageWorkbook,
} from './fixtures/build-workbooks'

/** Exécute `fn` et renvoie l'`AppError` levée. Échoue si rien n'est levé. */
function captureAppError(fn: () => unknown): AppError {
  try {
    fn()
  } catch (error) {
    assert.ok(error instanceof AppError, `attendu AppError, reçu ${String(error)}`)
    return error
  }
  assert.fail('aucune erreur levée')
}

describe('lecture de cellules', () => {
  test('texte : trim, null et dates', () => {
    assert.equal(cellText('  Sérum  '), 'Sérum')
    assert.equal(cellText(null), '')
    assert.equal(cellText(42), '42')
  })

  test('nombres : formats français tolérés', () => {
    assert.equal(cellNumber(1234.5), 1234.5)
    assert.equal(cellNumber('1234,5'), 1234.5)
    assert.equal(cellNumber('1 234'), 1234)
    assert.equal(cellNumber(true), 1)
  })

  test('nombres : absence distinguée du zéro', () => {
    assert.equal(cellNumber(null), null)
    assert.equal(cellNumber(''), null)
    assert.equal(cellNumber('non renseigné'), null)
    assert.equal(cellNumber(0), 0)
  })

  test('valeurs non finies rejetées', () => {
    assert.equal(cellNumber(Number.POSITIVE_INFINITY), null)
    assert.equal(cellNumber(Number.NaN), null)
  })
})

describe('chargement d’un classeur valide', () => {
  test('les six onglets de pilotage sont présents', () => {
    const loaded = loadWorkbook('pilotage', buildPilotageWorkbook())
    assert.equal(loaded.key, 'pilotage')
    assert.ok(sheet(loaded, '📊 DATA_MENSUELLE').length > 0)
    assert.ok(sheet(loaded, '⚖️ BFR').length > 0)
    assert.ok(sheet(loaded, '💧 TRESORERIE_PILOTAGE').length > 0)
  })

  test('le nom d’onglet est retrouvé malgré un émoji différent', () => {
    // La résolution compare le noyau alphanumérique : un changement d'émoji
    // ou d'espace ne doit pas casser toute la synchronisation.
    const rows = buildPilotageRows()
    const renamed: Record<string, typeof rows[string]> = {}
    for (const [name, value] of Object.entries(rows)) {
      renamed[name.replace(/^\S+\s/, '★ ')] = value
    }
    const loaded = loadWorkbook('pilotage', buildCustomWorkbook(renamed))
    assert.ok(sheet(loaded, '📊 DATA_MENSUELLE').length > 0)
  })
})

describe('validation structurelle', () => {
  test('onglet manquant : erreur explicite et non bloquante à interpréter', () => {
    const rows = buildPilotageRows()
    delete rows['⚖️ BFR']

    const error = captureAppError(() => loadWorkbook('pilotage', buildCustomWorkbook(rows)))
    assert.equal(error.kind, 'workbook_invalid')
    assert.match(error.message, /BFR/)
    // Le message destiné à l'utilisateur nomme le classeur, pas un chemin interne.
    assert.match(error.userMessage + (error.detail ?? ''), /Honeylang_PF_v3\.xlsx/)
  })

  test('marqueur structurel disparu : on refuse de deviner', () => {
    // Si la ligne « Cat. » n'existe plus, les index de colonnes ne veulent
    // plus rien dire : mieux vaut échouer que produire des chiffres faux.
    const rows = buildPilotageRows()
    rows['📊 DATA_MENSUELLE'] = [
      ['Journal', null],
      ['Poste', 'Catégorie', 'janv-26'],
      ['CA Shopify', 'CA_Shopify', 1000],
    ]

    const error = captureAppError(() => loadWorkbook('pilotage', buildCustomWorkbook(rows)))
    assert.equal(error.kind, 'workbook_invalid')
    assert.match(error.message, /Cat\./)
  })

  test('onglet vide', () => {
    const rows = buildCrcRows()
    rows['⚙️ PARAMÈTRES'] = []

    const error = captureAppError(() => loadWorkbook('crc', buildCustomWorkbook(rows)))
    assert.equal(error.kind, 'workbook_invalid')
  })

  test('plusieurs onglets fautifs sont tous signalés', () => {
    const rows = buildKpiRows()
    delete rows['📥 PARAMS_MANUELS']
    delete rows['⚙️ CALCULS_AUTO']
    // SheetJS refuse d'écrire un classeur sans aucun onglet : on en laisse un
    // hors périmètre, ce qui correspond d'ailleurs au cas réel d'un fichier
    // dont les onglets attendus ont été renommés.
    rows['Feuil1'] = [['sans rapport']]

    const error = captureAppError(() => loadWorkbook('kpi', buildCustomWorkbook(rows)))
    assert.match(error.message, /PARAMS_MANUELS/)
    assert.match(error.message, /CALCULS_AUTO/)
  })

  test('fichier illisible : erreur typée, jamais une exception brute', () => {
    const garbage = Buffer.from('ceci n’est pas un classeur', 'utf8')
    const error = captureAppError(() => loadWorkbook('pilotage', garbage))
    assert.equal(error.kind, 'workbook_invalid')
    assert.equal(error.status, 422)
  })

  test('classeur sans aucun onglet attendu', () => {
    const error = captureAppError(() =>
      loadWorkbook('pilotage', buildCustomWorkbook({ Feuil1: [['sans rapport']] })),
    )
    assert.equal(error.kind, 'workbook_invalid')
    assert.match(error.message, /DATA_MENSUELLE/)
  })
})

describe('confidentialité des messages d’erreur', () => {
  test('aucun chemin de fichier ni détail interne dans le message utilisateur', () => {
    const rows = buildPilotageRows()
    delete rows['📦 STOCK_ROTATION']
    const error = captureAppError(() => loadWorkbook('pilotage', buildCustomWorkbook(rows)))

    const publicPayload = JSON.stringify(error.toPublicJSON('req-123'))
    assert.ok(!publicPayload.includes('src/'), 'chemin source exposé')
    assert.ok(!publicPayload.includes('node_modules'), 'chemin interne exposé')
    assert.ok(!publicPayload.includes('stack'), 'pile exposée')
    assert.match(publicPayload, /req-123/)
  })
})
