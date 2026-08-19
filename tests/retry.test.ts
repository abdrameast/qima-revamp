import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { backoffDelay, withRetry, type RetryPolicy } from '../src/lib/retry'

const FAST: RetryPolicy = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 }

/** Attente instantanée : les tests ne doivent pas dormir réellement. */
const noSleep = async () => {}

describe('repli exponentiel', () => {
  test('le plafond double à chaque tentative', () => {
    const alwaysMax = () => 1
    assert.equal(backoffDelay(1, FAST, alwaysMax), 100)
    assert.equal(backoffDelay(2, FAST, alwaysMax), 200)
    assert.equal(backoffDelay(3, FAST, alwaysMax), 400)
  })

  test('le plafond est borné', () => {
    const alwaysMax = () => 1
    assert.equal(backoffDelay(20, FAST, alwaysMax), FAST.maxDelayMs)
  })

  test('gigue : le délai est tiré dans [0, plafond]', () => {
    // Sans gigue, plusieurs requêtes ayant échoué ensemble réessaieraient
    // simultanément et reproduiraient la surcharge.
    assert.equal(backoffDelay(2, FAST, () => 0), 0)
    assert.equal(backoffDelay(2, FAST, () => 0.5), 100)
    assert.equal(backoffDelay(2, FAST, () => 1), 200)
  })
})

describe('boucle de réessai', () => {
  test('succès immédiat : une seule tentative', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls++
        return 'ok'
      },
      { isRetryable: () => true, sleep: noSleep },
    )
    assert.equal(result, 'ok')
    assert.equal(calls, 1)
  })

  test('succès après deux échecs récupérables', async () => {
    let calls = 0
    const result = await withRetry(
      async (attempt) => {
        calls++
        if (attempt < 3) throw new Error('temporaire')
        return 'ok'
      },
      { isRetryable: () => true, sleep: noSleep, policy: FAST },
    )
    assert.equal(result, 'ok')
    assert.equal(calls, 3)
  })

  test('les tentatives sont bornées', async () => {
    let calls = 0
    await assert.rejects(
      withRetry(
        async () => {
          calls++
          throw new Error('toujours en échec')
        },
        { isRetryable: () => true, sleep: noSleep, policy: FAST },
      ),
    )
    assert.equal(calls, FAST.maxAttempts, 'la boucle doit s’arrêter au plafond')
  })

  test('une erreur non récupérable n’est jamais réessayée', async () => {
    let calls = 0
    await assert.rejects(
      withRetry(
        async () => {
          calls++
          throw new Error('403')
        },
        { isRetryable: () => false, sleep: noSleep, policy: FAST },
      ),
      /403/,
    )
    assert.equal(calls, 1, 'un refus définitif ne doit pas être réessayé')
  })

  test('l’erreur d’origine est propagée telle quelle', async () => {
    const original = new Error('cause précise')
    await assert.rejects(
      withRetry(
        async () => {
          throw original
        },
        { isRetryable: () => false, sleep: noSleep },
      ),
      (error: unknown) => error === original,
    )
  })

  test('le rappel onRetry reçoit chaque tentative et son délai', async () => {
    const seen: { attempt: number; delayMs: number }[] = []
    await assert.rejects(
      withRetry(
        async () => {
          throw new Error('échec')
        },
        {
          isRetryable: () => true,
          sleep: noSleep,
          policy: FAST,
          random: () => 1,
          onRetry: ({ attempt, delayMs }) => seen.push({ attempt, delayMs }),
        },
      ),
    )
    // Deux attentes pour trois tentatives : aucune attente après la dernière.
    assert.deepEqual(seen, [
      { attempt: 1, delayMs: 100 },
      { attempt: 2, delayMs: 200 },
    ])
  })

  test('les délais sont effectivement attendus, dans l’ordre', async () => {
    const slept: number[] = []
    await assert.rejects(
      withRetry(
        async () => {
          throw new Error('échec')
        },
        {
          isRetryable: () => true,
          sleep: async (ms) => {
            slept.push(ms)
          },
          policy: FAST,
          random: () => 1,
        },
      ),
    )
    assert.deepEqual(slept, [100, 200])
  })
})
