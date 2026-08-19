import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AppError } from '../src/lib/errors'
import { parseAllWorkbooks, type WorkbookInput } from '../src/lib/parse-excel'
import {
  parseBFR,
  parseCanauxParams,
  parseFichesCRC,
  parseStockRotation,
  parseTresoreriePilotage,
} from '../src/lib/parse-excel'
import type { Grid } from '../src/lib/workbook'
import type { AllData } from '../src/lib/data-types'
import {
  buildAllWorkbooks,
  buildCustomWorkbook,
  buildPilotageRows,
  type FixtureOptions,
} from './fixtures/build-workbooks'

function inputs(options: FixtureOptions = {}): Record<'pilotage' | 'crc' | 'kpi', WorkbookInput> {
  const workbooks = buildAllWorkbooks(options)
  const provenance = (fileName: string) => ({
    fileName,
    modifiedTime: '2026-08-18T10:00:00.000Z',
    sizeBytes: 1024,
    contentHash: 'test',
    exported: false,
  })

  return {
    pilotage: { buffer: workbooks.pilotage, provenance: provenance('pilotage.xlsx') },
    crc: { buffer: workbooks.crc, provenance: provenance('crc.xlsx') },
    kpi: { buffer: workbooks.kpi, provenance: provenance('kpi.xlsx') },
  }
}

function parse(options: FixtureOptions = {}): AllData {
  return parseAllWorkbooks(inputs(options))
}

describe('extraction complète', () => {
  const data = parse()

  test('douze mois d’exercice', () => {
    assert.equal(data.dataMensuelle.months.length, 12)
    assert.equal(data.dataMensuelle.months[0], 'janv-26')
  })

  test('les catégories de compte sont indexées par leur code', () => {
    assert.ok(data.dataMensuelle.lines['CA_Shopify'])
    assert.ok(data.dataMensuelle.lines['COGS_Packaging'])
    assert.equal(data.dataMensuelle.lines['CA_Shopify'].monthly.length, 12)
  })

  test('le total d’une ligne égale la somme de ses mois', () => {
    for (const line of Object.values(data.dataMensuelle.lines)) {
      const sum = line.monthly.reduce((a, b) => a + b, 0)
      assert.equal(line.total, sum, `total incohérent pour ${line.category}`)
    }
  })

  test('BFR : douze mois alignés sur l’exercice', () => {
    assert.equal(data.bfr.months.length, 12)
    assert.equal(data.bfr.stocks.length, 12)
    assert.equal(data.bfr.bfrTotal[0], 61_500)
  })

  test('fiches CRC et détection des coûts incomplets', () => {
    assert.equal(data.fichesCRC.length, 10)
    assert.equal(data.fichesCRC.filter((sku) => sku.coutsIncomplets).length, 2)
  })

  test('paramètres canaux par colonne', () => {
    assert.equal(data.canauxParams.commission.dtc, 0.029)
    assert.equal(data.canauxParams.commission.pharmacie, 0.35)
    // La RFA n'existe que pour la pharmacie : les deux autres restent nulles.
    assert.equal(data.canauxParams.rfaPharmacie.dtc, null)
    assert.equal(data.canauxParams.rfaPharmacie.pharmacie, 0.05)
  })

  test('seuil de sécurité repris du classeur', () => {
    assert.equal(data.canauxParams.seuilSecuriteTreso, 5000)
  })

  test('trésorerie de pilotage lue par coordonnées fixes', () => {
    assert.equal(data.tresoreriePilotage.soldeActuel, 61_200)
    assert.equal(data.tresoreriePilotage.runwayMois, 3.2)
    assert.equal(data.tresoreriePilotage.statutRunway, 'Vigilance')
    assert.equal(data.tresoreriePilotage.cccPharmacie, 74)
  })

  test('budget : dernier mois réalisé détecté', () => {
    assert.equal(data.budget.realisedUntil, 'mai-26')
  })

  test('charges fixes détaillées et totalisées', () => {
    assert.equal(data.paramsCRC.chargesFixesMensuelles, 18_900)
    assert.equal(Object.keys(data.paramsCRC.chargesFixesDetail).length, 7)
    // Le total du classeur doit correspondre au détail, sinon l'un des deux ment.
    const sum = Object.values(data.paramsCRC.chargesFixesDetail).reduce((a, b) => a + b, 0)
    assert.equal(sum, data.paramsCRC.chargesFixesMensuelles)
  })

  test('métadonnées de provenance transmises telles quelles', () => {
    assert.equal(data.meta.sources.pilotage.fileName, 'pilotage.xlsx')
    assert.equal(data.meta.sources.crc.modifiedTime, '2026-08-18T10:00:00.000Z')
  })
})

describe('états dégradés', () => {
  test('journal vide : structure préservée, drapeau à false', () => {
    const data = parse({ emptyJournal: true, emptyKpi: true })
    assert.equal(data.meta.hasMonthlyData, false)
    assert.equal(data.meta.hasKpiData, false)
    // Les lignes existent toujours : c'est leur contenu qui est à zéro.
    assert.ok(Object.keys(data.dataMensuelle.lines).length > 0)
  })

  test('cohortes de stock non saisies : aucune ligne fantôme', () => {
    // Une cohorte entièrement à zéro n'est pas une cohorte à zéro euro,
    // c'est une cohorte non renseignée : elle ne doit pas être remontée.
    const data = parse({ emptyStockRotation: true })
    assert.equal(data.stockRotation.length, 0)
  })

  test('BFR vide : des null, jamais des zéros', () => {
    const data = parse({ emptyBfr: true })
    assert.ok(data.bfr.bfrTotal.every((value) => value === null))
    assert.ok(data.bfr.stocks.every((value) => value === null))
  })

  test('coûts incomplets : toutes les fiches sont marquées', () => {
    const data = parse({ incompleteCosts: true })
    assert.equal(data.fichesCRC.length, 10)
    assert.ok(data.fichesCRC.every((sku) => sku.coutsIncomplets))
  })

  test('journal sans colonne de mois : échec explicite', () => {
    // Plutôt que de rendre un tableau de bord vide et rassurant.
    const rows = buildPilotageRows()
    rows['📊 DATA_MENSUELLE'] = [
      ['Journal', null],
      ['Poste', 'Cat.'],
    ]

    const workbooks = buildAllWorkbooks()
    assert.throws(
      () =>
        parseAllWorkbooks({
          pilotage: {
            buffer: buildCustomWorkbook(rows),
            provenance: {
              fileName: 'p',
              modifiedTime: '',
              sizeBytes: 0,
              contentHash: '',
              exported: false,
            },
          },
          crc: {
            buffer: workbooks.crc,
            provenance: {
              fileName: 'c',
              modifiedTime: '',
              sizeBytes: 0,
              contentHash: '',
              exported: false,
            },
          },
          kpi: {
            buffer: workbooks.kpi,
            provenance: {
              fileName: 'k',
              modifiedTime: '',
              sizeBytes: 0,
              contentHash: '',
              exported: false,
            },
          },
        }),
      (error: unknown) => error instanceof AppError && error.kind === 'workbook_invalid',
    )
  })
})

describe('robustesse des extracteurs unitaires', () => {
  test('grille vide : structures neutres, pas d’exception', () => {
    assert.deepEqual(parseStockRotation([]), [])
    assert.deepEqual(parseFichesCRC([]), [])
    assert.deepEqual(parseBFR([]).months, [])
    assert.equal(parseCanauxParams([]).commission.dtc, null)
    assert.equal(parseTresoreriePilotage([]).soldeActuel, null)
  })

  test('lignes malformées ignorées sans faire échouer la lecture', () => {
    const grid: Grid = [
      ['PRODUIT', 'PV TTC', 'PV HT', 'Volume'],
      ['Produit valide', 24, 20, 100, 5, 2, 1, 0.4, 0.6, 3, null, null, 12, 8, 0.4, 1, 7, 0.35, '✅ OK'],
      ['Ligne sans prix', null, null, null],
      [null, null, null],
      ['Autre valide', 12, 10, 50, 2, 1, 1, 0.2, 0.3, 1.5, null, null, 6, 4, 0.4, 0.5, 3.5, 0.35, '✅ OK'],
    ]
    const result = parseFichesCRC(grid)
    assert.equal(result.length, 2)
    assert.equal(result[0].produit, 'Produit valide')
  })

  test('rotation des stocks : les lignes de contrôle ne sont pas des cohortes', () => {
    const grid: Grid = [
      ['Trimestre', 'Actif', 'Lent', 'Dormant', 'Total'],
      ['T1 2026', 100, 50, 25, 175],
      ['Contrôle écart', 0, 0, 0, 0],
      ['% dormant', 0.14, null, null, null],
      ['Synthèse', 1, 1, 1, 3],
    ]
    const result = parseStockRotation(grid)
    assert.equal(result.length, 1)
    assert.equal(result[0].trimestre, 'T1 2026')
  })

  test('total de stock recalculé s’il est absent', () => {
    const grid: Grid = [
      ['Trimestre', 'Actif', 'Lent', 'Dormant', 'Total'],
      ['T1 2026', 100, 50, 25, null],
    ]
    assert.equal(parseStockRotation(grid)[0].totalStock, 175)
  })
})
