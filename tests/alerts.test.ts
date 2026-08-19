import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { countBySeverity, evaluateAlerts } from '../src/lib/alerts'
import { parseAllWorkbooks } from '../src/lib/parse-excel'
import type { AllData } from '../src/lib/data-types'
import { buildAllWorkbooks, type FixtureOptions } from './fixtures/build-workbooks'

function load(options: FixtureOptions = {}): AllData {
  const workbooks = buildAllWorkbooks(options)
  const provenance = {
    fileName: 'fixture.xlsx',
    modifiedTime: '2026-08-18T10:00:00.000Z',
    sizeBytes: 0,
    contentHash: '',
    exported: false,
  }
  return parseAllWorkbooks({
    pilotage: { buffer: workbooks.pilotage, provenance },
    crc: { buffer: workbooks.crc, provenance },
    kpi: { buffer: workbooks.kpi, provenance },
  })
}

describe('contrat des alertes', () => {
  const alerts = evaluateAlerts(load())

  test('chaque alerte est complète et inspectable', () => {
    // La règle et la source sont ce qui rend l'alerte contestable : sans
    // elles, le tableau de bord énonce sans justifier.
    assert.ok(alerts.length > 0, 'les fixtures doivent déclencher des règles')

    for (const alert of alerts) {
      assert.ok(alert.id, 'identifiant manquant')
      assert.ok(alert.title.length > 0, `titre manquant sur ${alert.id}`)
      assert.ok(alert.explanation.length > 0, `explication manquante sur ${alert.id}`)
      assert.ok(alert.rule.length > 0, `règle non exposée sur ${alert.id}`)
      assert.ok(alert.source.length > 0, `source non exposée sur ${alert.id}`)
      assert.ok(alert.lead.length > 0, `piste manquante sur ${alert.id}`)
      assert.ok(alert.href.startsWith('/dashboard/'), `lien invalide sur ${alert.id}`)
      assert.ok(alert.metric.label && alert.metric.value, `métrique incomplète sur ${alert.id}`)
    }
  })

  test('les identifiants sont uniques', () => {
    const ids = alerts.map((alert) => alert.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  test('la source nomme un classeur et un onglet réels', () => {
    for (const alert of alerts) {
      assert.match(alert.source, /\.xlsx/, `source imprécise sur ${alert.id}`)
    }
  })

  test('tri par gravité décroissante', () => {
    const rank = { critical: 0, caution: 1, info: 2 } as const
    for (let i = 1; i < alerts.length; i++) {
      assert.ok(
        rank[alerts[i - 1].severity] <= rank[alerts[i].severity],
        'les alertes critiques doivent précéder les autres',
      )
    }
  })

  test('aucune alerte ne se présente comme un avis comptable', () => {
    // Les formulations impératives sont proscrites : ce sont des signaux,
    // pas des instructions.
    const forbidden = /\bvous devez\b|\bil faut absolument\b|\bnous recommandons\b/i
    for (const alert of alerts) {
      const text = `${alert.explanation} ${alert.lead}`
      assert.ok(!forbidden.test(text), `formulation prescriptive sur ${alert.id} : ${text}`)
    }
  })
})

describe('déclenchement des règles', () => {
  test('runway court détecté sur les fixtures (3,2 mois)', () => {
    const alerts = evaluateAlerts(load())
    const runway = alerts.find((alert) => alert.id === 'runway-vigilance')
    assert.ok(runway, 'la règle de runway devrait se déclencher')
    assert.equal(runway.severity, 'caution')
  })

  test('références à coûts incomplets signalées', () => {
    const alerts = evaluateAlerts(load())
    const incomplete = alerts.find((alert) => alert.id === 'crc-incomplets')
    assert.ok(incomplete)
    assert.match(incomplete.metric.value, /2 \/ 10/)
  })

  test('toutes les fiches incomplètes : la règle reste cohérente', () => {
    const alerts = evaluateAlerts(load({ incompleteCosts: true }))
    const incomplete = alerts.find((alert) => alert.id === 'crc-incomplets')
    assert.ok(incomplete)
    assert.match(incomplete.metric.value, /10 \/ 10/)
  })

  test('LTV/CAC sous le repère de ×3', () => {
    const alerts = evaluateAlerts(load())
    assert.ok(alerts.some((alert) => alert.id === 'ltv-cac-faible'))
  })

  test('rotation de stock au-delà de 40 jours', () => {
    const alerts = evaluateAlerts(load())
    const stock = alerts.find((alert) => alert.id === 'stock-rotation-lente')
    assert.ok(stock, '47 jours de stock devrait déclencher la règle')
  })
})

describe('règles silencieuses en l’absence de donnée', () => {
  test('aucune alerte fondée sur une valeur manquante', () => {
    // Une donnée absente n'est pas un risque : la signaler serait un faux positif.
    const alerts = evaluateAlerts(load({ emptyKpi: true, emptyStockRotation: true, emptyBfr: true }))

    assert.ok(!alerts.some((alert) => alert.id === 'ltv-cac-faible'), 'KPI absents')
    assert.ok(!alerts.some((alert) => alert.id === 'stock-dormant'), 'cohortes absentes')
    assert.ok(!alerts.some((alert) => alert.id === 'stock-rotation-lente'), 'BFR absent')
  })

  test('journal vide : aucune alerte de marge ni de trésorerie', () => {
    const alerts = evaluateAlerts(load({ emptyJournal: true }))
    assert.ok(!alerts.some((alert) => alert.id === 'marge-sous-benchmark'))
    assert.ok(!alerts.some((alert) => alert.id === 'treso-sous-seuil'))
  })

  test('l’évaluation ne lève jamais, même sur des données très dégradées', () => {
    assert.doesNotThrow(() =>
      evaluateAlerts(
        load({
          emptyJournal: true,
          emptyKpi: true,
          emptyBfr: true,
          emptyStockRotation: true,
          incompleteCosts: true,
        }),
      ),
    )
  })
})

describe('décompte par gravité', () => {
  test('la somme des gravités égale le nombre d’alertes', () => {
    const alerts = evaluateAlerts(load())
    const counts = countBySeverity(alerts)
    assert.equal(counts.critical + counts.caution + counts.info, alerts.length)
  })

  test('liste vide', () => {
    assert.deepEqual(countBySeverity([]), { critical: 0, caution: 0, info: 0 })
  })
})

describe('localisation des libellés', () => {
  test('aucun point décimal dans les textes générés', () => {
    // Tout nombre affiché doit passer par lib/format : `toFixed()` produit
    // « 3.2 », qui détonne au milieu d'une interface en français.
    const alerts = evaluateAlerts(load())

    for (const alert of alerts) {
      const texts = [alert.title, alert.explanation, alert.metric.value, alert.rule]
      for (const text of texts) {
        assert.ok(
          !/\d\.\d/.test(text),
          `point décimal dans « ${text} » (alerte ${alert.id})`,
        )
      }
    }
  })
})
