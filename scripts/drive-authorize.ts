/**
 * Émission d'un refresh token Google Drive en lecture seule.
 *
 *     npm run drive:authorize
 *
 * ## Pourquoi un script plutôt qu'une page
 *
 * L'autorisation est une opération ponctuelle, faite par le propriétaire du
 * compte Google, sur sa machine. Elle n'a rien à faire dans l'application
 * déployée : y exposer un flux OAuth ajouterait une surface d'attaque pour
 * une action réalisée une fois par an.
 *
 * ## Ce que fait ce script
 *
 * 1. ouvre un serveur local éphémère sur http://localhost:53682 ;
 * 2. affiche l'URL de consentement Google, restreinte à `drive.readonly` ;
 * 3. reçoit le code d'autorisation sur la boucle locale ;
 * 4. l'échange contre un refresh token, puis l'affiche ;
 * 5. s'arrête. Rien n'est écrit sur disque : c'est au propriétaire de coller
 *    la valeur dans son gestionnaire de secrets.
 *
 * ⚠️ Le scope est fixé **ici**, au moment du consentement. C'est le seul
 * endroit où il l'est réellement : le passer à `setCredentials()` à
 * l'exécution ne restreint rien.
 */

import { createServer } from 'node:http'
import { google } from 'googleapis'

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const PORT = 53_682
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`\n  ✗ Variable ${name} absente.\n`)
    console.error('    Renseigner GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env.local,')
    console.error('    ou les fournir en ligne de commande :\n')
    console.error('        GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run drive:authorize\n')
    process.exit(1)
  }
  return value
}

/** Charge `.env.local` sans dépendance : quelques lignes suffisent. */
async function loadLocalEnv(): Promise<void> {
  try {
    const { readFile } = await import('node:fs/promises')
    const content = await readFile('.env.local', 'utf8')

    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key]) continue
      process.env[key] = rawValue.replace(/^["']|["']$/g, '')
    }
  } catch {
    // Absence de .env.local : les variables viennent de l'environnement.
  }
}

async function main(): Promise<void> {
  await loadLocalEnv()

  const clientId = requireEnv('GOOGLE_CLIENT_ID')
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET')

  const auth = new google.auth.OAuth2({ clientId, clientSecret, redirectUri: REDIRECT_URI })

  const authUrl = auth.generateAuthUrl({
    // `offline` est indispensable : sans lui, Google ne délivre pas de
    // refresh token et l'accès expirerait au bout d'une heure.
    access_type: 'offline',
    scope: [SCOPE],
    // Force l'écran de consentement : sans cela, une réautorisation renvoie
    // un access token sans refresh token, l'utilisateur ayant déjà consenti.
    prompt: 'consent',
    include_granted_scopes: false,
  })

  console.log('\n  Autorisation Google Drive — lecture seule')
  console.log('  ' + '─'.repeat(66))
  console.log(`\n  Scope demandé : ${SCOPE}`)
  console.log(`  Redirection   : ${REDIRECT_URI}`)
  console.log('\n  1. Ouvrir cette URL dans un navigateur connecté au compte Google')
  console.log('     qui a accès aux trois classeurs :\n')
  console.log(`     ${authUrl}\n`)
  console.log('  2. Accorder l\'accès en lecture seule.')
  console.log('  3. Le refresh token s\'affichera ici.\n')
  console.log('  En attente de la redirection…\n')

  const code = await waitForCode()
  const { tokens } = await auth.getToken(code)

  if (!tokens.refresh_token) {
    console.error('\n  ✗ Aucun refresh token renvoyé.\n')
    console.error('    Cause la plus fréquente : le compte a déjà autorisé cette application.')
    console.error('    Révoquer l\'accès sur https://myaccount.google.com/permissions')
    console.error('    puis relancer ce script.\n')
    process.exit(1)
  }

  // Confirme le scope réellement accordé, qui peut différer de celui demandé
  // si l'utilisateur a décoché une case sur l'écran de consentement.
  const granted = tokens.scope?.split(' ') ?? []
  const readOnly = granted.every(
    (scope) => !scope.startsWith('https://www.googleapis.com/auth/drive') || scope.endsWith('.readonly'),
  )

  console.log('\n  ' + '─'.repeat(66))
  console.log('\n  ✓ Refresh token obtenu.\n')
  console.log(`  Scopes accordés : ${granted.join(', ') || '(non communiqué)'}`)
  console.log(`  Lecture seule   : ${readOnly ? 'oui' : '⚠️  NON — jeton sur-privilégié'}\n`)

  if (!readOnly) {
    console.warn('  ⚠️  Le jeton dispose de droits en écriture sur Drive.')
    console.warn('      Le révoquer et recommencer en ne cochant que la lecture.\n')
  }

  console.log('  Copier cette valeur dans les variables d\'environnement de l\'hébergeur,')
  console.log('  sous le nom GOOGLE_REFRESH_TOKEN :\n')
  console.log(`      ${tokens.refresh_token}\n`)
  console.log('  ⚠️  Ne pas committer cette valeur. Ne pas la transmettre par messagerie.')
  console.log('  ⚠️  L\'écran de consentement OAuth doit être « En production » : en statut')
  console.log('      « Test », Google fait expirer ce jeton au bout de 7 jours.\n')
}

/** Serveur local éphémère recevant la redirection OAuth. */
function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', `http://localhost:${PORT}`)

      if (url.pathname !== '/oauth2callback') {
        response.writeHead(404).end()
        return
      }

      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(
        `<!doctype html><meta charset="utf-8"><title>Autorisation Qima</title>` +
          `<body style="font-family:system-ui;background:#23161E;color:#F7F1F3;` +
          `display:grid;place-items:center;height:100vh;margin:0">` +
          `<div style="text-align:center"><p style="color:#C5A76A;font-size:14px;` +
          `letter-spacing:.12em;text-transform:uppercase">Qima × Honeylang</p>` +
          `<h1 style="font-weight:500">${error ? 'Autorisation refusée' : 'Autorisation accordée'}</h1>` +
          `<p style="opacity:.7">${error ? 'Vous pouvez fermer cet onglet.' : 'Retournez au terminal pour récupérer le jeton.'}</p>` +
          `</div></body>`,
      )

      server.close()
      if (error) reject(new Error(`consentement refusé : ${error}`))
      else if (!code) reject(new Error('aucun code d’autorisation reçu'))
      else resolve(code)
    })

    server.on('error', reject)
    server.listen(PORT)

    // Filet de sécurité : ne pas laisser le script suspendu indéfiniment.
    setTimeout(
      () => {
        server.close()
        reject(new Error('délai dépassé — aucune redirection reçue en 5 minutes'))
      },
      5 * 60_000,
    ).unref()
  })
}

main().catch((error: unknown) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
