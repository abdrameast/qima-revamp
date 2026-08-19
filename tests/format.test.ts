import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MISSING,
  formatMois,
  formatRoas,
  formatBytes,
  formatDelta,
  formatEuro,
  formatEuroCompact,
  formatJours,
  formatMonth,
  formatMultiple,
  formatNumber,
  formatPercent,
  formatRelative,
  margeSignal,
} from '../src/lib/format'

/** Neutralise les espaces insécables produits par Intl, pour des assertions lisibles. */
function plain(value: string): string {
  return value.replace(/[  ]/g, ' ')
}

describe('valeurs manquantes', () => {
  // Règle centrale du projet : une valeur absente s'affiche « — », jamais 0.
  // C'est ce qui empêche de lire « 0 € de trésorerie » là où la donnée
  // n'a simplement pas encore été saisie.
  test('null, undefined et NaN donnent le tiret cadratin', () => {
    for (const fn of [formatEuro, formatNumber, formatJours, formatMultiple, formatEuroCompact]) {
      assert.equal(fn(null), MISSING)
      assert.equal(fn(undefined), MISSING)
      assert.equal(fn(Number.NaN), MISSING)
    }
    assert.equal(formatPercent(null), MISSING)
    assert.equal(formatDelta(null), MISSING)
  })

  test('zéro est une valeur, pas une absence', () => {
    assert.equal(plain(formatEuro(0)), '0 €')
    assert.equal(formatNumber(0), '0')
    assert.notEqual(formatEuro(0), MISSING)
  })
})

describe('formatage monétaire', () => {
  test('conventions fr-FR : espace de milliers et symbole suffixé', () => {
    assert.equal(plain(formatEuro(16548)), '16 548 €')
    assert.equal(plain(formatEuro(1234567)), '1 234 567 €')
  })

  test('décimales explicites', () => {
    assert.equal(plain(formatEuro(16548.5, 2)), '16 548,50 €')
  })

  test('valeurs négatives conservées', () => {
    assert.ok(formatEuro(-1500).includes('1 500') || formatEuro(-1500).includes('1 500'))
    assert.ok(formatEuro(-1500).startsWith('-'))
  })

  test('format compact au-delà du millier', () => {
    assert.equal(formatEuroCompact(16548), '16,5 k€')
    assert.equal(formatEuroCompact(1234567), '1,2 M€')
    assert.equal(plain(formatEuroCompact(842)), '842 €')
  })
})

describe('pourcentages', () => {
  test('un ratio est converti, un pourcentage ne l’est pas', () => {
    assert.equal(plain(formatPercent(0.6931, { isRatio: true })), '69,3 %')
    assert.equal(plain(formatPercent(69.31)), '69,3 %')
  })

  test('décimales paramétrables', () => {
    assert.equal(plain(formatPercent(0.6931, { isRatio: true, decimals: 0 })), '69 %')
  })
})

describe('deltas signés', () => {
  test('le signe distingue hausse et baisse', () => {
    assert.ok(formatDelta(0.123, { isRatio: true }).startsWith('+'))
    // Signe moins typographique (U+2212), pas le trait d'union.
    assert.ok(formatDelta(-0.041, { isRatio: true }).startsWith('−'))
  })

  test('une variation nulle n’est pas signée', () => {
    assert.ok(!formatDelta(0).startsWith('+'))
  })
})

describe('libellés de mois', () => {
  // Régression : « juin » et « juil » partagent leurs trois premières lettres.
  // Un découpage à trois caractères faisait afficher « Juil. » pour juin,
  // décalant d'un mois tous les axes de graphique.
  test('juin et juillet ne se confondent pas', () => {
    assert.equal(formatMonth('juin-26'), 'Juin 2026')
    assert.equal(formatMonth('juil-26'), 'Juil. 2026')
  })

  test('les douze mois de l’exercice sont distincts', () => {
    const labels = [
      'janv-26', 'févr-26', 'mars-26', 'avr-26', 'mai-26', 'juin-26',
      'juil-26', 'août-26', 'sept-26', 'oct-26', 'nov-26', 'déc-26',
    ]
    const rendered = labels.map(formatMonth)
    assert.equal(new Set(rendered).size, 12, `doublon détecté : ${rendered.join(', ')}`)
  })

  test('accents et casse indifférents', () => {
    assert.equal(formatMonth('FEVR-26'), 'Févr. 2026')
    assert.equal(formatMonth('août-26'), 'Août 2026')
    assert.equal(formatMonth('aout-26'), 'Août 2026')
  })

  test('année sur quatre chiffres conservée telle quelle', () => {
    assert.equal(formatMonth('janv-2026'), 'Janv. 2026')
  })

  test('libellé vide ou inconnu', () => {
    assert.equal(formatMonth(''), MISSING)
    assert.equal(formatMonth('inconnu-26'), 'inconnu 2026')
  })
})

describe('fraîcheur relative', () => {
  test('paliers successifs', () => {
    assert.equal(formatRelative(5), "à l'instant")
    assert.ok(formatRelative(300).includes('minute'))
    assert.ok(formatRelative(7200).includes('heure'))
    assert.ok(formatRelative(432_000).includes('jour'))
  })

  test('les formulations idiomatiques de l’option « auto » sont conservées', () => {
    // `numeric: 'auto'` fait produire à Intl « hier » et « avant-hier » plutôt
    // que « il y a 1 jour ». C'est le rendu voulu : plus naturel à la lecture.
    assert.equal(formatRelative(86_400), 'hier')
    assert.equal(formatRelative(172_800), 'avant-hier')
  })

  test('valeur absente', () => {
    assert.equal(formatRelative(null), MISSING)
  })
})

describe('tailles de fichier', () => {
  test('unités binaires', () => {
    assert.equal(plain(formatBytes(512)), '512 o')
    assert.equal(plain(formatBytes(46_053)), '45,0 Kio')
    assert.equal(plain(formatBytes(5 * 1024 * 1024)), '5,0 Mio')
  })
})

describe('seuils de marge', () => {
  // Seuils repris de l'existant : ≥ 60 % sain, 45–60 % limite, < 45 % fragile.
  test('classement aux bornes', () => {
    assert.equal(margeSignal(0.6, true), 'green')
    assert.equal(margeSignal(0.599, true), 'amber')
    assert.equal(margeSignal(0.45, true), 'amber')
    assert.equal(margeSignal(0.449, true), 'red')
  })

  test('valeur absente : aucun signal, pas de signal rouge par défaut', () => {
    assert.equal(margeSignal(null), null)
  })
})

describe('durées et multiplicateurs', () => {
  test('les mois utilisent la virgule décimale française', () => {
    // `toFixed()` produit « 3.2 », illisible en français. Ces formateurs
    // existent pour qu'aucun point décimal n'atteigne l'interface.
    assert.equal(plain(formatMois(3.2)), '3,2 mois')
    assert.equal(plain(formatMois(12)), '12,0 mois')
    assert.equal(formatMois(null), MISSING)
  })

  test('le ROAS aussi', () => {
    assert.equal(plain(formatRoas(3.1)), '×3,1')
    assert.equal(formatRoas(null), MISSING)
  })

  test('aucun point décimal ne subsiste', () => {
    for (const rendered of [formatMois(3.25), formatRoas(2.75), formatEuro(1234.5, 2)]) {
      assert.ok(!rendered.includes('.'), `point décimal dans « ${rendered} »`)
    }
  })
})
