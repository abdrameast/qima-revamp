# Système de design — QIMA × Honeylang

Référence des jetons, des primitives et des règles de composition.
Source de vérité : `src/app/globals.css`.

---

## 1. Principe de composition

**Coque sombre, surfaces de données en verre dépoli clair.**

L'identité de marque — bordeaux profond, or — habille la navigation, les
arrière-plans et les titres. Les chiffres, eux, vivent sur des surfaces claires
« papier ».

Ce n'est pas un compromis esthétique mais une contrainte de lecture : un
tableau de dix colonnes de montants sur fond bordeaux se lit mal, longtemps,
en réunion, sur un vidéoprojecteur. Le texte principal atteint **16,4:1** de
contraste sur papier, contre 15,6:1 sur la coque — et surtout, les aplats
sémantiques (vert, ambre, rouge) restent distinguables.

Corollaire : la palette sémantique est **dédoublée**. Un vert lisible sur
bordeaux est illisible sur papier. Les composants ne devinent pas le support —
`Badge`, `Alert`, `Tooltip`, `SegmentedControl` prennent une prop `surface` ou
`tone` explicite.

### Le verre — transparence réelle, texte clair

Les panneaux de données sont **réellement transparents** : le fond n'est qu'un
voile blanc à **8 %**. Ce qui fait lire « verre » n'est pas l'opacité, mais
quatre éléments combinés :

1. un dégradé diagonal de 11 % à 4 %, qui simule la réfraction ;
2. `backdrop-filter: blur(32px) saturate(165%)` — le flou détache la surface,
   la saturation ravive les halos vus au travers ;
3. une arête blanche à 34 % en `inset box-shadow`, qui donne son épaisseur à
   la tranche ;
4. des halos de fond qui **dérivent lentement** (48 s), pour que le verre ait
   quelque chose de mouvant à réfracter.

**Conséquence directe : le texte des données est CLAIR.** Un voile à 8 % ne
masque pas la coque bordeaux — poser de l'encre foncée dessus la rendrait
illisible. Les jetons `--color-ink-*` résolvent donc vers des tons crème.

### Le pire cas s'est inversé

Avec un verre clair, le pire cas de lisibilité était le fond le plus **sombre**.
Avec un verre transparent et du texte clair, c'est le fond le plus **lumineux** :
le verre posé au-dessus du halo doré.

`npm run design:contrast` compose donc `blanc 8 % → halo doré 11 % → canvas`
et mesure là-dessus. Résultat : texte principal 10,89:1, secondaire 6,27:1,
discret 5,11:1, sémantique de 5,00 à 6,18:1.

Deux séries de jetons coexistent :

| Usage | Jetons | Rendu |
|-------|--------|-------|
| Écran (verre transparent) | `--color-ink`, `--color-positive-ink`… | tons clairs |
| Impression (verre → blanc opaque) | `--color-ink-print`, `--color-positive-print`… | encre foncée |

`@media print` force `color: #000` sur **tout** : sans cela, on imprimerait du
crème sur du blanc, soit une page vierge.

### Halos de fond

`body::before` pose trois nappes radiales très diffuses (or, mauve, bordeaux),
ramenées à 11 % : au-delà, ce sont elles qui dictaient le plancher de
contraste du texte vu au travers du verre.

Elles **dérivent en continu** sur 48 s (`@keyframes drift`), en `transform`
uniquement — donc entièrement sur le compositeur, sans coût sur le fil
principal. Le mouvement est perceptible sans jamais attirer l'œil, et donne au
verre une matière vivante plutôt qu'une texture figée.

### Repli sans `backdrop-filter`

`@supports not (backdrop-filter: blur(1px))` rend le verre quasi opaque.
L'effet se perd, la lisibilité non.

> ⚠️ **Ne jamais écrire `-webkit-backdrop-filter` à la main.** Lightning CSS
> (intégré à Tailwind v4) préfixe selon les cibles ; une double déclaration le
> fait supprimer la propriété standard, et le flou disparaît silencieusement
> sur Chromium. Ce piège s'est produit et n'a été détecté qu'en inspectant le
> CSS compilé.

---

## 2. Couleurs

### Identité — valeurs imposées par la charte

| Jeton | Valeur | Usage |
|-------|--------|-------|
| `--color-bordeaux` | `#23161E` | Fond global, texte sur aplat or |
| `--color-gold` | `#C5A76A` | Accent principal, actions, état actif |
| `--color-mauve` | `#9C7D8C` | Séries secondaires, éléments décoratifs |

### Surfaces sombres — dérivées du bordeaux

| Jeton | Valeur | Usage |
|-------|--------|-------|
| `--color-canvas` | `#1B1016` | Fond de page (référence du calcul de contraste) |
| `--color-surface` | `#2C1D26` | Barre latérale, cartes de contexte |
| `--color-surface-raised` | `#36242F` | Survol, élément de navigation actif |
| `--color-surface-strong` | `#412C38` | Infobulles, sélection |

### Verre — zones de données

| Jeton | Valeur | Usage |
|-------|--------|-------|
| `--color-glass` | `rgb(253 251 252 / .86)` | Cartes, tableaux, graphiques |
| `--color-glass-dark` | `rgb(44 29 38 / .72)` | Navigation, en-tête, tiroir |
| `--color-glass-edge` | `rgb(255 255 255 / .55)` | Arête lumineuse du verre clair |
| `--color-paper` | `#FAF7F8` | Repli opaque et impression uniquement |

### Texte

| Jeton | Sur | Contraste |
|-------|-----|-----------|
| `--color-cream` `#F7F1F3` | canvas | 15,63:1 |
| `--color-cream-muted` `#C6AEB8` | canvas | 8,42:1 |
| `--color-cream-faint` `#A98F9B` | canvas | 5,88:1 |
| `--color-ink` `#23161E` | verre composé | 12,56:1 |
| `--color-ink-muted` `#5E4A55` | verre composé | 5,85:1 |
| `--color-ink-faint` `#6E5A66` | verre composé | 4,56:1 |
| `--color-gold-deep` `#755928` | verre composé | 4,71:1 |

### Sémantique financière

Réservée au sens — favorable, vigilance, risque. **Jamais décorative.**

| Rôle | Sur fond sombre | Sur papier |
|------|-----------------|-----------|
| Favorable | `--color-positive` `#7CC08D` | `--color-positive-ink` `#2F6B3F` |
| Vigilance | `--color-caution` `#E0B25C` | `--color-caution-ink` `#6E4B0C` |
| Risque | `--color-critical` `#EE8A8A` | `--color-critical-ink` `#9B2626` |

Aplats associés sur papier : `--color-positive-soft`, `--color-caution-soft`,
`--color-critical-soft`.

### Contraste — vérifié, pas supposé

```bash
npm run design:contrast
```

41 paires texte/fond sont contrôlées contre WCAG 2.2 AA (4,5:1 pour le corps
de texte, 3:1 pour les éléments non textuels), **dont 12 sur les couleurs
composées derrière le verre**. La même commande vérifie aussi que toute
variable CSS référencée est bien définie — le contrôle qui manquait quand
quatre variables inexistantes traînaient dans quatre pages.

La commande sort en échec si une paire passe sous son seuil. **Toute couleur
ajoutée doit être ajoutée à ce contrôle.**

La couleur n'est jamais le seul porteur d'information : chaque badge de statut
porte un libellé, chaque tendance porte un glyphe et un texte lu par les
lecteurs d'écran, chaque écart budgétaire indique son sens en toutes lettres.

---

## 3. Typographie

### Lufga — prête à être activée

Lufga est la police de la charte. C'est une **fonte commerciale** : elle n'est
ni distribuée dans ce dépôt ni téléchargée à la volée, ce qui serait une
violation de licence.

**Activation : déposer les cinq `.woff2` dans `public/fonts/`, puis relancer
le serveur. Rien d'autre.** Les `@font-face` sont générées par
`scripts/generate-font-css.ts` (hooks `predev` / `prebuild`), qui ne déclare
que les fichiers réellement présents — d'où zéro requête 404 tant que la
police est absente. Voir `public/fonts/README.md`.

La pile déclarée dans `globals.css` la place en premier :

```css
--font-sans: "Lufga", var(--font-outfit), ui-sans-serif, system-ui,
             -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

Aucun composant n'a besoin d'être modifié : tous passent par le jeton
`--font-sans`. Le script de génération se charge des `@font-face`.

### Repli actuel — Outfit

En l'absence de Lufga, **Outfit** prend le relais : geometric sans à licence
ouverte, auto-hébergée par `next/font/google`, et la plus proche de Lufga
parmi les fontes librement redistribuables — mêmes proportions géométriques,
hauteur d'x généreuse, terminaisons nettes. La pile système ferme la marche.

Le tableau de bord est cohérent avec ou sans Lufga : aucune mesure n'en dépend.

### Échelle

| Usage | Taille | Graisse |
|-------|--------|---------|
| Titre de page | 28 px (24 px < 640 px) | 600 |
| Titre de section | 16 px | 600 |
| Titre de carte | 14 px | 600 |
| Valeur d'indicateur | 26 px | 500 |
| Corps | 13 px | 400 |
| Annotation | 11 px | 400 |
| Libellé de section | 10 px, `0.12em`, majuscules | 500 |

### Chiffres

Tout montant porte la classe `.tabular` (`font-variant-numeric: tabular-nums`),
qui aligne les colonnes de chiffres. Sans elle, une colonne de montants
« danse » d'une ligne à l'autre et devient pénible à parcourir.

Formatage centralisé dans `src/lib/format.ts`, conventions `fr-FR` :
espace insécable comme séparateur de milliers, virgule décimale, symbole
suffixé. **Aucun composant ne formate un nombre lui-même.**

---

## 4. Espacement, rayons, ombres, mouvement

**Espacement** : échelle Tailwind par défaut, base 4 px. Gouttière entre cartes :
`gap-3` (12 px). Espacement entre sections : `mt-6` (24 px).

**Rayons** : `--radius-xs` 4 px · `sm` 6 px · `md` 10 px (contrôles, alertes) ·
`lg` 14 px (cartes) · `xl` 18 px.

**Ombres** : `--shadow-subtle`, `--shadow-card` (cartes), `--shadow-raised`
(survol d'élément cliquable), `--shadow-overlay` (modales, tiroir, infobulles).
Profondeur retenue — pas de flou décoratif, pas de verre dépoli marqué.

**Mouvement** : `--duration-instant` 110 ms · `--duration-quick` 180 ms ·
`--duration-calm` 300 ms · `--duration-slow` 520 ms.

Trois courbes, chacune avec un rôle :

| Courbe | Usage |
|--------|-------|
| `--ease-glass` | Mouvement du verre. Décélération longue, sans rebond : c'est elle qui lui donne son poids apparent. |
| `--ease-out-soft` | Fondus et opacités. |
| `--ease-spring` | Micro-rebond, réservé aux icônes au survol. |

### Vocabulaire d'animation

| Classe | Effet | Où |
|--------|-------|-----|
| `.stagger` | Entrée en cascade des enfants, 45 ms d'écart, plafonnée à 315 ms | grilles d'indicateurs et de cartes |
| `.animate-rise` | Montée + léger agrandissement | titres, valeurs, alertes |
| `.animate-glass-in` | Le flou se resserre pendant que l'opacité monte, comme une mise au point | modales, squelettes |
| `.animate-slide-left` | Glissement latéral | tiroir mobile |
| `.lift` | Élévation de 3 px + ombre portée renforcée | cartes **cliquables uniquement** |
| `.press` | Compression à 0,972 | tous les contrôles |
| `.glass-sheen` | Reflet spéculaire qui traverse la surface, 720 ms | boutons, cartes cliquables |
| `.animate-blob` / `-alt` | Nappes colorées au changement de vue | `ViewTransition` |
| `drift` (sur `body::before`) | Dérive continue des halos, 48 s | fond global |
| `.animate-shimmer` | Balayage de chargement | squelettes |

`.lift` est réservé aux cartes qui mènent réellement quelque part : une carte
qui se soulève sans être cliquable promet une action qui n'existe pas.

La pastille active de la barre latérale est **un seul élément** déplacé par
`transform`, pas une pastille par lien : le glissement relie visuellement la
section quittée à celle atteinte. Sa position est calculée arithmétiquement
(index × pas) plutôt que mesurée au DOM — pas de `ResizeObserver`, donc aucun
décalage au premier rendu.

### Fluidité — pourquoi ça tient les 60 ips

Toutes les animations portent sur `transform` et `opacity`, jamais sur une
propriété de mise en page. Le reflet spéculaire va plus loin : son
pseudo-élément est promu en couche de composition (`will-change: transform`
+ `translate3d`), si bien que le navigateur l'anime **sans repasser par le fil
principal**. Le mouvement reste fluide même pendant un recalcul React.

Les `filter: blur()` animés ont été retirés : contrairement à `transform`, ils
forcent une re-rasterisation à chaque image et font chuter la cadence.

### Transition de vue

`ViewTransition` déclenche deux nappes floutées au changement de section.
L'état est ajusté **pendant le rendu** (motif React officiel) plutôt que dans
un `useEffect` : un effet provoquerait un rendu en cascade, que le compilateur
React signale. Les nœuds sont retirés du DOM dès l'animation terminée.

### Garde-fous

`prefers-reduced-motion: reduce` neutralise animations, transitions **et** le
reflet spéculaire — règle globale, aucun composant n'a à s'en préoccuper.

`@media print` fait de même, avec `opacity: 1 !important` et
`transform: none !important`. Ce n'est pas une précaution théorique : les
animations d'entrée démarrent à `opacity: 0` avec `fill-mode: both`, et le
moteur d'impression ne fait pas avancer la timeline. Sans cette règle, la
synthèse exécutive s'imprimerait **vide**.

---

## 5. Primitives

`src/components/ui/`

| Composant | Rôle | Points d'attention |
|-----------|------|--------------------|
| `Button` | Actions | 5 variantes, 3 tailles, état `loading` avec `aria-busy` |
| `Card` | Conteneur | `tone="paper"` pour les données, `"dark"` pour le contexte |
| `Metric` | Indicateur | Valeur **déjà formatée** ; état `unavailable` explicitant *pourquoi* ; `href` pour le forage |
| `Badge` | Statut | `surface` obligatoire ; `srPrefix` pour le contexte oral |
| `Alert` | Message contextuel | `role="status"` seulement si `live` |
| `Table*` | Tableaux | Défilement interne, conteneur focalisable, première colonne collante |
| `Field` / `TextInput` / `SelectInput` / `SliderInput` | Saisie | `<label>` réel, `aria-invalid`, `aria-valuetext` sur les curseurs |
| `SegmentedControl` | Vues exclusives | Motif ARIA « tablist » : une tabulation, puis les flèches |
| `Dialog` | Modale | `<dialog>` natif + `showModal()` — piège de focus et inertie gratuits |
| `Tooltip` | Aide | Déclencheur `<button>`, `aria-describedby`, fermeture par Échap |
| `Skeleton` | Chargement | `aria-hidden` ; c'est `LoadingRegion` qui annonce |
| `EmptyState` | État vide | Distingue `pending` / `filtered` / `none` |
| `PageHeader` | En-tête | Identique sur les sept pages |

`src/components/charts/`

| Composant | Rôle |
|-----------|------|
| `ChartFrame` | Hauteur réservée, légende lisible, **description textuelle** du contenu |
| `ChartTooltip` | Infobulle formatée avec les mêmes fonctions que le reste de l'interface |
| `theme.ts` | Couleurs de séries, pointant vers les jetons CSS |

Les couleurs de graphiques sont des `var(--…)` : une couleur modifiée dans
`globals.css` se propage aux graphiques sans toucher un composant.

---

## 6. Accessibilité

Vérifié dans le navigateur, pas seulement en revue de code :

- **Anneau de focus unique** — `:focus-visible` global, or, décalé de 2 px.
  Jamais supprimé, seulement harmonisé.
- **Lien d'évitement** — première tabulation de chaque page du tableau de bord.
- **Navigation mobile** — `role="dialog"`, `aria-modal`, focus déplacé à
  l'ouverture, Échap ferme et **rend le focus au déclencheur**, défilement de
  fond bloqué.
- **Tableaux** — `aria-sort` sur les colonnes triables ; conteneur de
  défilement focalisable, sans quoi les colonnes masquées sont inatteignables
  au clavier.
- **Graphiques** — un `<svg>` n'est pas interprétable à l'oral. Chaque
  graphique porte un `summary` textuel citant les grandeurs, et le SVG est
  retiré de l'arbre d'accessibilité.
- **Page courante** — `aria-current="page"`, en plus de la couleur.
- **Barres de progression** — `role="img"` + `aria-label` chiffré.
- **États live** — erreur de connexion et échec de rafraîchissement annoncés
  poliment ; les alertes présentes au chargement ne le sont pas (ce serait du
  bruit, pas de l'information).

---

## 7. Impression

`@media print` produit une synthèse exécutive : fond blanc, encre noire, A4
portrait, navigation et commandes masquées.

Attributs de contrôle :

| Attribut | Effet |
|----------|-------|
| `data-print-block` | Bloc encadré, insécable entre deux pages |
| `data-print-full` | Supprime les marges de mise en page |
| `data-print-invert` | Neutralise un aplat sombre |
| `data-print-break-before` | Force un saut de page |
| `.no-print` | Masque à l'impression |

Les en-têtes de tableau se répètent sur chaque page (`display: table-header-group`).

Les vues **Vue d'ensemble**, **Trésorerie** et **Budget vs Réel** portent un
bouton « Imprimer / PDF ». La provenance et l'horodatage des données restent
visibles à l'impression : un PDF qui circule doit dire de quand il date.

---

## 8. Points de rupture

| Largeur | Comportement |
|---------|--------------|
| **360 px** | Colonne unique. Sélecteur de période sur sa propre rangée. Libellé du menu réduit à l'icône sous 380 px. |
| **768 px** | Indicateurs sur deux colonnes. Sélecteur de période remonté dans la barre. |
| **1024 px** | Barre latérale permanente (248 px). Cartes de canal sur trois colonnes. |
| **1440 px** | Indicateurs sur quatre colonnes. Contenu borné à 1360 px — au-delà, les lignes de tableau deviennent difficiles à suivre à l'œil. |

Règle absolue : **la page ne défile jamais horizontalement.** Les contenus
larges (tableaux, graphiques) défilent dans leur propre conteneur.

---

## 9. Ce qui a été retiré

| Élément | Raison |
|---------|--------|
| Variables `--color-or`, `--color-beige-light`, `--color-vert-signal`, `--color-ambre` | **Jamais définies.** Elles apparaissaient dans quatre pages, où le navigateur les résolvait en « invalide » — d'où des textes rendus dans la couleur héritée. Remplacées par des jetons réels. |
| Couleurs en dur (`#E74C3C`, `#C0392B`, `rgba(255,255,255,0.06)`…) | Hors palette, non contrôlées en contraste. |
| Deux langages visuels concurrents | `overview` et `canaux` utilisaient des cartes claires ; `shopify`, `produits`, `budget` et `simulations` des cartes sombres translucides. Unifié. |
| `DataCard`, `KpiCard`, `CaTrimChart`, `PagePlaceholder`, `providers.tsx` | Remplacés ou inutilisés. |
| `/design-preview` | Page publiquement accessible, hors `/dashboard`. Le système est documenté ici et contrôlé par `npm run design:contrast` ; une page de style non liée aurait dérivé. |
| Double rembourrage | Le layout appliquait `px-6 py-6`, puis chaque page ajoutait `p-6 md:p-8`. |
