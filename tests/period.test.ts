import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  lastRealisedMonthIndex,
  periodOptions,
  resolvePeriod,
  sumOrNull,
  sumOverPeriod,
  variation,
} from '../src/lib/period'

const MONTHS = [
  'janv-26', 'févr-26', 'mars-26', 'avr-26', 'mai-26', 'juin-26',
  'juil-26', 'août-26', 'sept-26', 'oct-26', 'nov-26', 'déc-26',
]

describe('résolution de période', () => {
  test('exercice complet couvre les douze mois', () => {
    const period = resolvePeriod({ mode: 'year', index: 0 }, MONTHS)
    assert.deepEqual(period.months, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    assert.equal(period.label, 'Exercice 2026')
  })

  test('trimestre : bornes exactes', () => {
    assert.deepEqual(resolvePeriod({ mode: 'quarter', index: 0 }, MONTHS).months, [0, 1, 2])
    assert.deepEqual(resolvePeriod({ mode: 'quarter', index: 1 }, MONTHS).months, [3, 4, 5])
    assert.deepEqual(resolvePeriod({ mode: 'quarter', index: 3 }, MONTHS).months, [9, 10, 11])
    assert.equal(resolvePeriod({ mode: 'quarter', index: 1 }, MONTHS).label, 'T2 2026')
  })

  test('un index de trimestre hors bornes est ramené dans la plage', () => {
    assert.deepEqual(resolvePeriod({ mode: 'quarter', index: 9 }, MONTHS).months, [9, 10, 11])
    assert.deepEqual(resolvePeriod({ mode: 'quarter', index: -3 }, MONTHS).months, [0, 1, 2])
  })

  test('mois isolé', () => {
    const period = resolvePeriod({ mode: 'month', index: 5 }, MONTHS)
    assert.deepEqual(period.months, [5])
    assert.equal(period.label, 'Juin 2026')
  })

  test('cumul à date s’arrête au dernier mois réalisé', () => {
    // Le budget déclare « RÉALISÉ » jusqu'en mai : le cumul ne doit pas
    // englober les mois futurs, qui écraseraient toutes les moyennes.
    const period = resolvePeriod({ mode: 'ytd', index: 0 }, MONTHS, 'mai-26')
    assert.deepEqual(period.months, [0, 1, 2, 3, 4])
  })

  test('cumul à date sans statut : dernier mois porteur de valeurs', () => {
    const series = [100, 200, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const period = resolvePeriod({ mode: 'ytd', index: 0 }, MONTHS, null, series)
    assert.deepEqual(period.months, [0, 1, 2])
  })

  test('exercice sans mois : période vide, jamais d’exception', () => {
    const period = resolvePeriod({ mode: 'year', index: 0 }, [])
    assert.deepEqual(period.months, [])
    assert.equal(period.label, '—')
    assert.equal(period.previousMonths, null)
  })
})

describe('période de comparaison', () => {
  test('même longueur, immédiatement avant', () => {
    const period = resolvePeriod({ mode: 'quarter', index: 2 }, MONTHS)
    assert.deepEqual(period.previousMonths, [3, 4, 5])
  })

  test('refusée si elle déborde de l’exercice', () => {
    // Comparer T1 à un « T0 » inexistant produirait une variation tronquée,
    // donc trompeuse : on préfère ne rien proposer.
    assert.equal(resolvePeriod({ mode: 'quarter', index: 0 }, MONTHS).previousMonths, null)
    assert.equal(resolvePeriod({ mode: 'year', index: 0 }, MONTHS).previousMonths, null)
  })

  test('mois précédent disponible dès février', () => {
    assert.deepEqual(resolvePeriod({ mode: 'month', index: 1 }, MONTHS).previousMonths, [0])
    assert.equal(resolvePeriod({ mode: 'month', index: 0 }, MONTHS).previousMonths, null)
  })
})

describe('agrégation sur période', () => {
  const series = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]

  test('somme simple', () => {
    assert.equal(sumOverPeriod(series, [0, 1, 2]), 60)
    assert.equal(sumOverPeriod(series, []), 0)
    assert.equal(sumOverPeriod(undefined, [0, 1]), 0)
  })

  test('sumOrNull distingue « zéro » de « non saisi »', () => {
    // Toute la logique d'affichage repose sur cette distinction.
    assert.equal(sumOrNull([null, null, null], [0, 1, 2]), null)
    assert.equal(sumOrNull([0, 0, 0], [0, 1, 2]), 0)
    assert.equal(sumOrNull([10, null, 20], [0, 1, 2]), 30)
    assert.equal(sumOrNull(undefined, [0]), null)
  })
})

describe('variation relative', () => {
  test('calcul standard', () => {
    assert.equal(variation(110, 100), 0.1)
    assert.equal(variation(90, 100), -0.1)
  })

  test('non calculable si une borne manque ou si la base est nulle', () => {
    assert.equal(variation(100, null), null)
    assert.equal(variation(null, 100), null)
    assert.equal(variation(100, 0), null)
  })

  test('base négative : on rapporte à la valeur absolue', () => {
    // Sinon une perte qui se réduit afficherait une variation négative.
    assert.equal(variation(-50, -100), 0.5)
  })
})

describe('options du sélecteur', () => {
  test('les trimestres hors exercice sont marqués indisponibles', () => {
    const options = periodOptions(MONTHS.slice(0, 5))
    assert.equal(options.quarters.filter((q) => q.available).length, 2)
    assert.equal(options.months.length, 5)
  })
})

describe('dernier mois réalisé', () => {
  test('le statut budgétaire prime sur la détection par valeurs', () => {
    assert.equal(lastRealisedMonthIndex(MONTHS, 'mars-26', [1, 1, 1, 1, 1, 1]), 2)
  })

  test('repli sur le dernier mois non nul', () => {
    assert.equal(lastRealisedMonthIndex(MONTHS, null, [5, 5, 0, 0]), 1)
  })

  test('repli final sur le dernier mois de l’exercice', () => {
    assert.equal(lastRealisedMonthIndex(MONTHS, null), 11)
  })
})
