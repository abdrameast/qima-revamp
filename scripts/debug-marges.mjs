/**
 * Diagnostic direct — affiche margeVariablePct et margeNettePct
 * tels que retournés par parseFichesCRC sur le fichier Drive réel.
 * Usage : node scripts/debug-marges.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'
import { google } from 'googleapis'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const envLines = readFileSync(resolve(root, '.env.local'), 'utf-8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth })

const res = await drive.files.get(
  { fileId: process.env.DRIVE_FILE_ID_CRC, alt: 'media' },
  { responseType: 'arraybuffer' }
)
const wb = XLSX.read(Buffer.from(res.data), { type: 'buffer' })
const ws = wb.Sheets[wb.SheetNames.find(n => n.includes('FICHES CRC'))]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true })

// Trouver la ligne d'en-tête (col A = "PRODUIT")
const headerIdx = rows.findIndex(r => r && String(r[0]).toUpperCase() === 'PRODUIT')

console.log(`\nEn-tête trouvée à la ligne ${headerIdx + 1} (0-based: ${headerIdx})`)
console.log(`  row[14] = "${rows[headerIdx][14]}"  ← margeVariablePct source`)
console.log(`  row[17] = "${rows[headerIdx][17]}"  ← margeNettePct source`)
console.log('\n─'.repeat(70))
console.log('PRODUIT'.padEnd(45) + 'row[14] (mVarPct)   row[17] (mNettePct)  coutsIncomplets')
console.log('─'.repeat(100))

let count = 0
for (let i = headerIdx + 1; i < rows.length; i++) {
  const row = rows[i] || []
  const produit = row[0] ? String(row[0]).trim() : ''
  if (!produit) continue
  const pvHt = row[2]
  if (pvHt === null || pvHt === undefined || pvHt === '') continue

  const coutLabo = row[4]
  const incomplet = coutLabo === null || coutLabo === 0
  const mVarPct = row[14]
  const mNettePct = row[17]

  const mVarDisplay = mVarPct !== null ? `${(mVarPct * 100).toFixed(1)}%` : 'null'
  const mNetteDisplay = mNettePct !== null ? `${(mNettePct * 100).toFixed(1)}%` : 'null'

  console.log(
    produit.substring(0, 44).padEnd(45) +
    String(mVarPct ?? 'null').padEnd(12) + ` → ${mVarDisplay.padEnd(10)}` +
    String(mNettePct ?? 'null').padEnd(12) + ` → ${mNetteDisplay.padEnd(10)}` +
    (incomplet ? '⚠️ INCOMPLET' : '✅')
  )
  count++
}
console.log(`\nTotal : ${count} SKUs`)
