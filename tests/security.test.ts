import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSessionToken,
  verifyCredentials,
  verifySessionToken,
  sessionCookie,
  clearedSessionCookie,
} from '../src/lib/auth'
import {
  AUTH_BYPASS_EMAIL,
  ConfigError,
  __resetEnvCacheForTests,
  getAuthEnv,
  isAuthBypassEnabled,
  normalizeEmail,
} from '../src/lib/env'
import { NO_STORE_HEADERS, assertSameOrigin, safeRedirectPath } from '../src/lib/http'
import { AppError } from '../src/lib/errors'
import { LOGIN_POLICY, __resetAllForTests, consume, reset } from '../src/lib/rate-limit'

const SECRET = 'secret-de-test-suffisamment-long-pour-passer-32'
const PASSWORD = 'mot-de-passe-de-test-long'

function setValidEnv(): void {
  process.env.SESSION_SECRET = SECRET
  process.env.ALLOWED_EMAILS = 'Alice@Exemple.FR, bob@exemple.fr'
  process.env.DASHBOARD_PASSWORD = PASSWORD
  delete process.env.NEXTAUTH_SECRET
  delete process.env.AUTH_SESSION_MAX_AGE_HOURS
  __resetEnvCacheForTests()
}

beforeEach(() => {
  setValidEnv()
  __resetAllForTests()
})

// ═══════════════════════════════════════════════════════════════════════════
// Validation de configuration
// ═══════════════════════════════════════════════════════════════════════════

describe('validation des variables d’environnement', () => {
  test('un secret absent fait échouer explicitement', () => {
    // Sans ce garde-fou, `TextEncoder().encode(undefined)` produisait une clé
    // HMAC dérivée de la chaîne « undefined » : des sessions forgeables.
    delete process.env.SESSION_SECRET
    __resetEnvCacheForTests()

    assert.throws(getAuthEnv, (error: unknown) => {
      assert.ok(error instanceof ConfigError)
      assert.ok(error.variables.includes('SESSION_SECRET'))
      return true
    })
  })

  test('un secret trop court est refusé', () => {
    process.env.SESSION_SECRET = 'trop-court'
    __resetEnvCacheForTests()
    assert.throws(getAuthEnv, ConfigError)
  })

  test('un mot de passe trop court est refusé', () => {
    process.env.DASHBOARD_PASSWORD = 'court'
    __resetEnvCacheForTests()
    assert.throws(getAuthEnv, ConfigError)
  })

  test('une liste d’adresses vide est refusée', () => {
    process.env.ALLOWED_EMAILS = '   '
    __resetEnvCacheForTests()
    assert.throws(getAuthEnv, ConfigError)
  })

  test('NEXTAUTH_SECRET reste accepté comme alias hérité', () => {
    delete process.env.SESSION_SECRET
    process.env.NEXTAUTH_SECRET = SECRET
    __resetEnvCacheForTests()
    assert.equal(getAuthEnv().sessionSecret, SECRET)
  })

  test('les adresses sont normalisées à la lecture', () => {
    assert.deepEqual(getAuthEnv().allowedEmails, ['alice@exemple.fr', 'bob@exemple.fr'])
  })

  test('durée de session par défaut : 12 heures', () => {
    assert.equal(getAuthEnv().sessionMaxAgeSeconds, 12 * 3600)
  })

  test('une durée aberrante retombe sur la valeur par défaut', () => {
    process.env.AUTH_SESSION_MAX_AGE_HOURS = '-5'
    __resetEnvCacheForTests()
    assert.equal(getAuthEnv().sessionMaxAgeSeconds, 12 * 3600)
  })
})

describe('normalisation des adresses', () => {
  test('casse, espaces et normalisation Unicode', () => {
    assert.equal(normalizeEmail('  Alice@Exemple.FR '), 'alice@exemple.fr')
    assert.equal(normalizeEmail('ALICE@EXEMPLE.FR'), 'alice@exemple.fr')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Identifiants
// ═══════════════════════════════════════════════════════════════════════════

describe('vérification des identifiants', () => {
  test('couple valide accepté', () => {
    const result = verifyCredentials('alice@exemple.fr', PASSWORD)
    assert.equal(result.ok, true)
    assert.equal(result.email, 'alice@exemple.fr')
  })

  test('la casse de l’adresse est indifférente', () => {
    assert.equal(verifyCredentials('  ALICE@Exemple.FR  ', PASSWORD).ok, true)
  })

  test('mot de passe erroné refusé', () => {
    assert.equal(verifyCredentials('alice@exemple.fr', 'mauvais').ok, false)
  })

  test('adresse hors liste refusée', () => {
    assert.equal(verifyCredentials('intrus@ailleurs.fr', PASSWORD).ok, false)
  })

  test('types inattendus refusés sans exception', () => {
    // Un corps JSON arbitraire ne doit pas faire tomber la route.
    assert.equal(verifyCredentials(null, PASSWORD).ok, false)
    assert.equal(verifyCredentials('alice@exemple.fr', undefined).ok, false)
    assert.equal(verifyCredentials({ toString: () => 'alice@exemple.fr' }, PASSWORD).ok, false)
    assert.equal(verifyCredentials(['alice@exemple.fr'], PASSWORD).ok, false)
  })

  test('aucune information n’est renvoyée en cas d’échec', () => {
    // Le résultat d'un échec est indistinguable, qu'il s'agisse d'une adresse
    // inconnue ou d'un mot de passe faux : pas d'énumération possible.
    assert.deepEqual(verifyCredentials('intrus@ailleurs.fr', PASSWORD), { ok: false })
    assert.deepEqual(verifyCredentials('alice@exemple.fr', 'mauvais'), { ok: false })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Sessions
// ═══════════════════════════════════════════════════════════════════════════

describe('jetons de session', () => {
  test('aller-retour émission / vérification', async () => {
    const token = await createSessionToken('alice@exemple.fr')
    const session = await verifySessionToken(token)
    assert.equal(session?.email, 'alice@exemple.fr')
  })

  test('l’adresse est normalisée dans le jeton', async () => {
    const token = await createSessionToken('  ALICE@Exemple.FR ')
    assert.equal((await verifySessionToken(token))?.email, 'alice@exemple.fr')
  })

  test('un jeton falsifié est rejeté', async () => {
    const token = await createSessionToken('alice@exemple.fr')
    const tampered = token.slice(0, -4) + 'AAAA'
    assert.equal(await verifySessionToken(tampered), null)
  })

  test('un jeton signé avec une autre clé est rejeté', async () => {
    const token = await createSessionToken('alice@exemple.fr')

    process.env.SESSION_SECRET = 'une-tout-autre-cle-de-signature-32-caracteres'
    __resetEnvCacheForTests()

    assert.equal(await verifySessionToken(token), null)
  })

  test('retirer une adresse de la liste coupe l’accès immédiatement', async () => {
    // Le jeton reste cryptographiquement valide : c'est la revérification de
    // la liste blanche qui doit fermer la porte, sans attendre l'expiration.
    const token = await createSessionToken('alice@exemple.fr')
    assert.ok(await verifySessionToken(token))

    process.env.ALLOWED_EMAILS = 'bob@exemple.fr'
    __resetEnvCacheForTests()

    assert.equal(await verifySessionToken(token), null)
  })

  test('une valeur qui n’est pas un jeton est rejetée sans exception', async () => {
    for (const value of ['', 'pas-un-jeton', 'a.b.c', '{}']) {
      assert.equal(await verifySessionToken(value), null)
    }
  })

  test('le jeton porte une expiration bornée', async () => {
    const token = await createSessionToken('alice@exemple.fr')
    const session = await verifySessionToken(token)
    const ttl = session!.exp - Math.floor(Date.now() / 1000)
    assert.ok(ttl > 0 && ttl <= 12 * 3600 + 5, `durée inattendue : ${ttl}s`)
  })
})

describe('cookie de session', () => {
  test('drapeaux de sécurité', () => {
    const cookie = sessionCookie('jeton')
    assert.equal(cookie.httpOnly, true)
    assert.equal(cookie.sameSite, 'lax')
    assert.equal(cookie.path, '/')
    assert.ok(cookie.maxAge > 0)
  })

  test('la déconnexion expire immédiatement le cookie', () => {
    const cookie = clearedSessionCookie()
    assert.equal(cookie.maxAge, 0)
    assert.equal(cookie.value, '')
    assert.equal(cookie.httpOnly, true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// En-têtes HTTP
// ═══════════════════════════════════════════════════════════════════════════

describe('en-têtes de cache', () => {
  test('aucune réponse authentifiée n’est mise en cache partagé', () => {
    // Régression : l'API renvoyait `public, s-maxage=3600` sur des données
    // financières authentifiées, qu'un CDN pouvait servir à un tiers.
    const cacheControl = NO_STORE_HEADERS['Cache-Control']
    assert.match(cacheControl, /private/)
    assert.match(cacheControl, /no-store/)
    assert.match(cacheControl, /max-age=0/)
    assert.ok(!cacheControl.includes('public'), 'directive « public » réintroduite')
    assert.ok(!/s-maxage/.test(cacheControl), 'directive « s-maxage » réintroduite')
  })

  test('la réponse varie selon le cookie', () => {
    assert.equal(NO_STORE_HEADERS['Vary'], 'Cookie')
  })
})

describe('protection CSRF', () => {
  const request = (headers: Record<string, string>) =>
    new Request('https://app.exemple.fr/api/data', { method: 'POST', headers })

  test('Sec-Fetch-Site same-origin accepté', () => {
    assert.doesNotThrow(() => assertSameOrigin(request({ 'sec-fetch-site': 'same-origin' })))
  })

  test('requête inter-sites refusée', () => {
    assert.throws(
      () => assertSameOrigin(request({ 'sec-fetch-site': 'cross-site' })),
      (error: unknown) => error instanceof AppError && error.kind === 'forbidden',
    )
  })

  test('sous-domaine refusé malgré SameSite=Lax', () => {
    assert.throws(
      () => assertSameOrigin(request({ 'sec-fetch-site': 'same-site' })),
      (error: unknown) => error instanceof AppError && error.kind === 'forbidden',
    )
  })

  test('repli sur Origin quand Sec-Fetch-Site est absent', () => {
    assert.doesNotThrow(() => assertSameOrigin(request({ origin: 'https://app.exemple.fr' })))
    assert.throws(
      () => assertSameOrigin(request({ origin: 'https://malveillant.fr' })),
      (error: unknown) => error instanceof AppError && error.kind === 'forbidden',
    )
  })

  test('sans aucun en-tête d’origine : refus par défaut', () => {
    assert.throws(
      () => assertSameOrigin(request({})),
      (error: unknown) => error instanceof AppError && error.kind === 'forbidden',
    )
  })
})

describe('redirections', () => {
  test('les chemins internes sont conservés', () => {
    assert.equal(safeRedirectPath('/dashboard/produits'), '/dashboard/produits')
    assert.equal(safeRedirectPath('/dashboard?a=1'), '/dashboard?a=1')
  })

  test('les redirections ouvertes sont neutralisées', () => {
    const fallback = '/dashboard'
    // `//evil.tld` passerait un simple test `startsWith('/')`.
    assert.equal(safeRedirectPath('//malveillant.fr'), fallback)
    assert.equal(safeRedirectPath('https://malveillant.fr'), fallback)
    assert.equal(safeRedirectPath('http://malveillant.fr'), fallback)
    assert.equal(safeRedirectPath('/\\malveillant.fr'), fallback)
    assert.equal(safeRedirectPath('javascript:alert(1)'), fallback)
    assert.equal(safeRedirectPath(null), fallback)
    assert.equal(safeRedirectPath('dashboard'), fallback)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Limitation d'abus
// ═══════════════════════════════════════════════════════════════════════════

describe('limitation d’abus', () => {
  test('les tentatives sous la limite passent', () => {
    for (let i = 0; i < LOGIN_POLICY.limit; i++) {
      assert.equal(consume('test:ip:1', LOGIN_POLICY).allowed, true, `tentative ${i + 1}`)
    }
  })

  test('le dépassement bloque et annonce un délai', () => {
    for (let i = 0; i < LOGIN_POLICY.limit; i++) consume('test:ip:2', LOGIN_POLICY)

    const blocked = consume('test:ip:2', LOGIN_POLICY)
    assert.equal(blocked.allowed, false)
    assert.ok(blocked.retryAfterSeconds > 0)
  })

  test('les compartiments sont indépendants', () => {
    for (let i = 0; i <= LOGIN_POLICY.limit; i++) consume('test:ip:3', LOGIN_POLICY)
    assert.equal(consume('test:ip:3', LOGIN_POLICY).allowed, false)
    // Changer d'IP ne doit pas débloquer l'email visé, et réciproquement.
    assert.equal(consume('test:email:autre', LOGIN_POLICY).allowed, true)
  })

  test('une authentification réussie libère le compteur', () => {
    for (let i = 0; i <= LOGIN_POLICY.limit; i++) consume('test:ip:4', LOGIN_POLICY)
    assert.equal(consume('test:ip:4', LOGIN_POLICY).allowed, false)

    reset('test:ip:4')
    assert.equal(consume('test:ip:4', LOGIN_POLICY).allowed, true)
  })

  test('le nombre de tentatives restantes décroît', () => {
    const first = consume('test:ip:5', LOGIN_POLICY)
    const second = consume('test:ip:5', LOGIN_POLICY)
    assert.equal(second.remaining, first.remaining - 1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Contournement d'authentification (développement)
// ═══════════════════════════════════════════════════════════════════════════

describe('contournement d’authentification', () => {
  test('inactif par défaut', () => {
    delete process.env.AUTH_DISABLED
    assert.equal(isAuthBypassEnabled(), false)
  })

  test('requiert la valeur exacte « true »', () => {
    // Aucune activation par approximation : « 1 », « yes » ou « TRUE » ne
    // doivent pas suffire à ouvrir un tableau de bord financier.
    for (const value of ['1', 'yes', 'oui', 'TRUE', 'True', '', ' true ']) {
      process.env.AUTH_DISABLED = value
      assert.equal(isAuthBypassEnabled(), false, `valeur « ${value} » acceptée à tort`)
    }

    process.env.AUTH_DISABLED = 'true'
    assert.equal(isAuthBypassEnabled(), true)
  })

  test('la valeur est relue à chaque appel, jamais mémoïsée', () => {
    process.env.AUTH_DISABLED = 'true'
    assert.equal(isAuthBypassEnabled(), true)

    delete process.env.AUTH_DISABLED
    assert.equal(isAuthBypassEnabled(), false, 'état résiduel après désactivation')
  })

  test('l’adresse factice est reconnaissable et non routable', () => {
    // `.invalid` est un TLD réservé (RFC 2606) : cette adresse ne peut
    // correspondre à aucun destinataire réel, et se repère dans les logs.
    assert.ok(AUTH_BYPASS_EMAIL.endsWith('.invalid'))
  })
})
