/**
 * Contrôles du système de design.
 *
 *     npm run design:contrast
 *
 * 1. Contraste WCAG 2.2 de chaque paire texte/fond.
 * 2. Toute variable CSS référencée est bien définie.
 *
 * Le second contrôle existe à cause d'un bug réel : quatre variables
 * (`--color-or`, `--color-beige-light`, `--color-vert-signal`, `--color-ambre`)
 * étaient utilisées dans quatre pages sans avoir jamais été déclarées. Le
 * navigateur les résolvait silencieusement en « invalide », et les textes
 * concernés héritaient d'une couleur arbitraire. Rien ne le signalait — ni le
 * typage, ni le lint, ni la compilation.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Contraste
// ═══════════════════════════════════════════════════════════════════════════

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function relativeLuminance([r, g, b]: RGB): number {
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * Compose une couche translucide sur un fond opaque.
 *
 * Indispensable ici : les surfaces de données sont en verre. La couleur
 * réellement perçue derrière un texte n'est pas la teinte du verre, mais son
 * mélange avec le fond. Vérifier le contraste sur la teinte nominale
 * surestimerait la lisibilité de plusieurs points.
 */
export function composite(layer: string, alpha: number, backdrop: string): string {
  const [lr, lg, lb] = hexToRgb(layer)
  const [br, bg, bb] = hexToRgb(backdrop)
  const mix = (l: number, b: number) => Math.round(alpha * l + (1 - alpha) * b)
  return (
    '#' +
    [mix(lr, br), mix(lg, bg), mix(lb, bb)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

export function contrast(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a))
  const lb = relativeLuminance(hexToRgb(b))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Palette de marque — doit rester alignée sur `src/app/globals.css`. */
const C = {
  // Identité (valeurs imposées par la charte)
  bordeaux: '#23161E',
  gold: '#C5A76A',
  mauve: '#9C7D8C',

  // Surfaces sombres dérivées du bordeaux
  canvas: '#1B1016',
  canvasRaised: '#23161E',
  surface1: '#2C1D26',
  surface2: '#36242F',
  surface3: '#412C38',

  // Surfaces claires opaques (impression, replis)
  paper: '#FAF7F8',
  paperAlt: '#F1EAED',

  // Verre : blanc à très faible opacité (voir GLASS_ALPHA).
  glassTint: '#FFFFFF',
  // Halo le plus lumineux — c'est LUI le pire cas pour du texte clair.
  haloGold: '#C5A76A',

  // Texte sur fond sombre
  onDark: '#F7F1F3',
  onDarkMuted: '#C6AEB8',
  onDarkFaint: '#A98F9B',

  // Texte sur verre — CLAIR, le verre étant transparent sur coque sombre.
  onGlass: '#F7F1F3',
  onGlassMuted: '#CCB4BE',
  onGlassFaint: '#BCA1AD',

  // Encre foncée — impression uniquement.
  onPrint: '#23161E',
  onPrintMuted: '#5E4A55',

  // Or : variantes d'interaction
  goldBright: '#D8BE8C',
  // Accent sur verre transparent : clair, pour ressortir sur fond sombre.
  goldDeep: '#D5BC8A',
  goldPrint: '#755928',

  // Sémantique — fond sombre
  greenOnDark: '#7CC08D',
  amberOnDark: '#E0B25C',
  redOnDark: '#EE8A8A',

  // Sémantique — fond clair
  greenOnLight: '#2F6B3F',
  amberOnLight: '#6E4B0C',
  redOnLight: '#9B2626',
} as const

/**
 * Opacité du verre, reprise de `--color-glass`.
 *
 * Le verre est un voile blanc à 8 % sur la coque sombre. Le texte étant
 * clair, le **pire cas** n'est plus le fond le plus sombre mais le plus
 * **lumineux** : le verre posé au-dessus du halo doré.
 */
const GLASS_ALPHA = 0.08
const HALO_ALPHA = 0.11

/** Fond le plus lumineux qu'un texte de données puisse rencontrer. */
const GLASS_BG = composite(
  C.glassTint,
  GLASS_ALPHA,
  composite(C.haloGold, HALO_ALPHA, C.canvas),
)

/** Verre au-dessus de la coque nue — cas le plus favorable, vérifié aussi. */
const GLASS_BG_PLAIN = composite(C.glassTint, GLASS_ALPHA, C.canvas)

interface Pair {
  fg: string
  bg: string
  label: string
  min: number
}

const PAIRS: Pair[] = [
  // Texte courant sur fond sombre — AA corps de texte
  { label: 'texte principal / canvas', fg: C.onDark, bg: C.canvas, min: 4.5 },
  { label: 'texte principal / surface1', fg: C.onDark, bg: C.surface1, min: 4.5 },
  { label: 'texte principal / surface2', fg: C.onDark, bg: C.surface2, min: 4.5 },
  { label: 'texte secondaire / canvas', fg: C.onDarkMuted, bg: C.canvas, min: 4.5 },
  { label: 'texte secondaire / surface1', fg: C.onDarkMuted, bg: C.surface1, min: 4.5 },
  { label: 'texte discret / canvas', fg: C.onDarkFaint, bg: C.canvas, min: 4.5 },
  { label: 'texte discret / surface1', fg: C.onDarkFaint, bg: C.surface1, min: 4.5 },
  { label: 'or / canvas', fg: C.gold, bg: C.canvas, min: 4.5 },
  { label: 'or / surface1', fg: C.gold, bg: C.surface1, min: 4.5 },
  { label: 'or / surface2', fg: C.gold, bg: C.surface2, min: 4.5 },
  { label: 'or vif / surface2', fg: C.goldBright, bg: C.surface2, min: 4.5 },

  // Texte sur fond clair
  { label: 'encre / paper (repli opaque)', fg: C.onPrint, bg: C.paper, min: 4.5 },
  { label: 'encre secondaire / paper', fg: C.onPrintMuted, bg: C.paper, min: 4.5 },

  // Sémantique sur fond sombre
  { label: 'vert / surface1', fg: C.greenOnDark, bg: C.surface1, min: 4.5 },
  { label: 'ambre / surface1', fg: C.amberOnDark, bg: C.surface1, min: 4.5 },
  { label: 'rouge / surface1', fg: C.redOnDark, bg: C.surface1, min: 4.5 },
  { label: 'vert / canvas', fg: C.greenOnDark, bg: C.canvas, min: 4.5 },
  { label: 'ambre / canvas', fg: C.amberOnDark, bg: C.canvas, min: 4.5 },
  { label: 'rouge / canvas', fg: C.redOnDark, bg: C.canvas, min: 4.5 },

  // Sémantique sur fond clair
  { label: 'vert imprimé / paper', fg: C.greenOnLight, bg: C.paper, min: 4.5 },
  { label: 'ambre imprimé / paper', fg: C.amberOnLight, bg: C.paper, min: 4.5 },
  { label: 'rouge imprimé / paper', fg: C.redOnLight, bg: C.paper, min: 4.5 },

  // Boutons : texte sombre sur aplat or
  { label: 'bordeaux / aplat or', fg: C.bordeaux, bg: C.gold, min: 4.5 },
  { label: 'bordeaux / aplat or vif', fg: C.bordeaux, bg: C.goldBright, min: 4.5 },

  // Éléments non textuels (bordures actives, focus) — seuil 3:1
  { label: 'anneau de focus or / canvas', fg: C.gold, bg: C.canvas, min: 3 },
  { label: 'mauve (décor) / canvas', fg: C.mauve, bg: C.canvas, min: 3 },

  // ── VERRE : fond réellement composé, pire cas ─────────────────────────
  // Ce sont ces paires qui comptent vraiment : les données vivent sur du
  // verre, pas sur un aplat. Vérifier la teinte nominale surestimerait
  // la lisibilité de deux à trois points de ratio.
  { label: 'texte principal / VERRE (pire cas)', fg: C.onGlass, bg: GLASS_BG, min: 4.5 },
  { label: 'texte secondaire / VERRE (pire cas)', fg: C.onGlassMuted, bg: GLASS_BG, min: 4.5 },
  { label: 'texte discret / VERRE (pire cas)', fg: C.onGlassFaint, bg: GLASS_BG, min: 4.5 },
  { label: 'or / VERRE (pire cas)', fg: C.goldDeep, bg: GLASS_BG, min: 4.5 },
  { label: 'vert / VERRE (pire cas)', fg: C.greenOnDark, bg: GLASS_BG, min: 4.5 },
  { label: 'ambre / VERRE (pire cas)', fg: C.amberOnDark, bg: GLASS_BG, min: 4.5 },
  { label: 'rouge / VERRE (pire cas)', fg: C.redOnDark, bg: GLASS_BG, min: 4.5 },

  // Verre sur coque nue — cas favorable, vérifié plutôt que supposé.
  { label: 'texte discret / VERRE sur coque nue', fg: C.onGlassFaint, bg: GLASS_BG_PLAIN, min: 4.5 },

  // Impression : le verre redevient blanc opaque, l'encre redevient foncée.
  { label: 'encre / papier imprimé', fg: C.onPrint, bg: '#FFFFFF', min: 4.5 },
  { label: 'encre secondaire / papier imprimé', fg: C.onPrintMuted, bg: '#FFFFFF', min: 4.5 },
  { label: 'or imprimé / papier imprimé', fg: C.goldPrint, bg: '#FFFFFF', min: 4.5 },

  // ── VERRE SOMBRE : navigation et en-tête ──────────────────────────────
  { label: 'texte principal / VERRE SOMBRE', fg: C.onDark, bg: composite(C.surface1, 0.72, C.canvas), min: 4.5 },
  { label: 'texte secondaire / VERRE SOMBRE', fg: C.onDarkMuted, bg: composite(C.surface1, 0.72, C.canvas), min: 4.5 },
  { label: 'texte discret / VERRE SOMBRE', fg: C.onDarkFaint, bg: composite(C.surface1, 0.72, C.canvas), min: 4.5 },
  { label: 'or / VERRE SOMBRE', fg: C.gold, bg: composite(C.surface1, 0.72, C.canvas), min: 4.5 },
]

function checkContrast(): number {
  let failures = 0

  console.log('\n  Contraste WCAG 2.2 — jetons de couleur\n')
  console.log('  ratio    seuil  état  paire')
  console.log('  ' + '─'.repeat(66))

  for (const pair of PAIRS) {
    const ratio = contrast(pair.fg, pair.bg)
    const pass = ratio >= pair.min
    if (!pass) failures++
    console.log(
      `  ${ratio.toFixed(2).padStart(5)}   ${pair.min.toFixed(1).padStart(4)}   ` +
        `${pass ? ' ok ' : 'ÉCHEC'}  ${pair.label}`,
    )
  }

  console.log('  ' + '─'.repeat(66))
  console.log(
    failures > 0
      ? `\n  ${failures} paire(s) sous le seuil.`
      : `\n  ${PAIRS.length} paires conformes.`,
  )

  return failures
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Variables CSS référencées mais non définies
// ═══════════════════════════════════════════════════════════════════════════

const GLOBALS = path.join('src', 'app', 'globals.css')

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) collectSourceFiles(full, out)
    else if (/\.(tsx?|css)$/.test(entry) && full !== GLOBALS) out.push(full)
  }
  return out
}

function checkTokenDefinitions(): number {
  const css = readFileSync(GLOBALS, 'utf8')
  const defined = new Set(
    [...css.matchAll(/^[ \t]*(--[a-z0-9-]+)[ \t]*:/gm)].map((match) => match[1]),
  )

  const referenced = new Map<string, Set<string>>()
  const record = (token: string, file: string): void => {
    if (!referenced.has(token)) referenced.set(token, new Set())
    referenced.get(token)!.add(file)
  }

  for (const file of collectSourceFiles('src')) {
    const source = readFileSync(file, 'utf8')
    // `var(--x)` classique…
    for (const match of source.matchAll(/var\((--[a-z0-9-]+)\)/g)) record(match[1], file)
    // …et valeur arbitraire Tailwind, ex. `shadow-[--shadow-card]`.
    for (const match of source.matchAll(/\[(--[a-z0-9-]+)\]/g)) record(match[1], file)
  }

  const missing = [...referenced.keys()].filter((token) => !defined.has(token))

  console.log('\n  Définition des jetons\n')
  console.log('  ' + '─'.repeat(66))
  console.log(`  Jetons définis dans globals.css : ${defined.size}`)
  console.log(`  Jetons référencés ailleurs      : ${referenced.size}`)

  if (missing.length > 0) {
    console.log('\n  Variables référencées mais NON DÉFINIES :')
    for (const token of missing) {
      console.log(`    ${token}  →  ${[...referenced.get(token)!].join(', ')}`)
    }
  } else {
    console.log('  Toutes les variables référencées sont définies.')
  }

  console.log('  ' + '─'.repeat(66) + '\n')
  return missing.length
}

// ═══════════════════════════════════════════════════════════════════════════

const contrastFailures = checkContrast()
const undefinedTokens = checkTokenDefinitions()

if (contrastFailures > 0 || undefinedTokens > 0) {
  console.error('  Contrôles du système de design en échec.\n')
  process.exitCode = 1
}
