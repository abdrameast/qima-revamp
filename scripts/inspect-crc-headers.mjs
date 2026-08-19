/**
 * Script de diagnostic — imprime les en-têtes (lignes 1-3) de l'onglet 📊 FICHES CRC
 * Usage : node scripts/inspect-crc-headers.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'
import { google } from 'googleapis'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Charger le .env.local manuellement
const envPath = resolve(root, '.env.local')
const envLines = readFileSync(envPath, 'utf-8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN
const FILE_ID       = process.env.DRIVE_FILE_ID_CRC

if (!FILE_ID) {
  console.error('❌ DRIVE_FILE_ID_CRC manquant dans .env.local')
  process.exit(1)
}

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
auth.setCredentials({ refresh_token: REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth })

console.log('📥 Téléchargement du fichier CRC depuis Google Drive…')
const res = await drive.files.get({ fileId: FILE_ID, alt: 'media' }, { responseType: 'arraybuffer' })
const buf = Buffer.from(res.data)

const wb = XLSX.read(buf, { type: 'buffer' })

// Trouver l'onglet FICHES CRC
const sheetName = wb.SheetNames.find(n => n.includes('FICHES CRC') || n.includes('CRC'))
if (!sheetName) {
  console.log('Onglets disponibles :', wb.SheetNames)
  process.exit(1)
}

const ws = wb.Sheets[sheetName]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

// Colonnes A à T = index 0 à 19
const COLS = 'ABCDEFGHIJKLMNOPQRST'.split('')

console.log(`\nOnglet : "${sheetName}"`)
console.log('─'.repeat(80))

for (let r = 0; r < Math.min(5, rows.length); r++) {
  const row = rows[r] || []
  console.log(`\nLigne ${r + 1} :`)
  COLS.forEach((letter, i) => {
    const v = row[i]
    if (v !== null && v !== undefined && v !== '') {
      // Pour les nombres : afficher valeur brute + format si cellule formatée
      const cellAddr = letter + (r + 1)
      const cell = ws[cellAddr]
      const fmt = cell?.z ? ` [format: ${cell.z}]` : ''
      console.log(`  ${letter} (col ${i}) : ${JSON.stringify(v)}${fmt}`)
    }
  })
}

// Afficher aussi les valeurs brutes d'une ligne de données (ligne après en-tête)
// pour voir si margeVariablePct est 0.36 ou 36
const headerRowIdx = rows.findIndex(r => r && String(r[0]).toUpperCase() === 'PRODUIT')
if (headerRowIdx >= 0 && rows[headerRowIdx + 1]) {
  const dataRow = rows[headerRowIdx + 1]
  console.log('\n─'.repeat(80))
  console.log(`\nPremière ligne de données (ligne ${headerRowIdx + 2}) :`)
  COLS.forEach((letter, i) => {
    const v = dataRow[i]
    if (v !== null && v !== undefined && v !== '') {
      const cellAddr = letter + (headerRowIdx + 2)
      const cell = ws[cellAddr]
      const fmt = cell?.z ? ` [format: ${cell.z}]` : ''
      console.log(`  ${letter} (col ${i}) : ${JSON.stringify(v)}${fmt}`)
    }
  })
}
