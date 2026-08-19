# Polices auto-hébergées

## Lufga — activation

Lufga est la police de la charte QIMA. C'est une **fonte commerciale** : elle
n'est pas distribuée dans ce dépôt et n'est pas téléchargée à la volée.

L'application est déjà câblée pour elle. Il suffit de déposer les fichiers
**ici même**, avec exactement ces noms :

```
public/fonts/
  Lufga-Light.woff2       (300)
  Lufga-Regular.woff2     (400)
  Lufga-Medium.woff2      (500)
  Lufga-SemiBold.woff2    (600)
  Lufga-Bold.woff2        (700)
```

Puis relancer le serveur (`npm run dev`) — la génération des `@font-face` se
fait au démarrage. **Aucune modification de code n'est nécessaire** : la pile
de polices place déjà Lufga en premier.

### Comment cela fonctionne

Les déclarations `@font-face` ne sont **pas écrites en dur** : elles sont
générées par `scripts/generate-font-css.ts`, exécuté automatiquement avant
`npm run dev` et `npm run build`. Le script n'émet une déclaration que pour
les fichiers réellement présents.

Conséquence : tant que Lufga est absente, aucune requête n'est émise — donc
aucune erreur 404 dans la console. Dès que les fichiers sont là, les
déclarations apparaissent et la police s'applique. Le repli sur **Outfit**
(auto-hébergée par `next/font`) est automatique et sans écran blanc, grâce à
`font-display: swap`.

Le résultat est écrit dans `src/app/lufga.generated.css`, versionné à dessein :
un `next build` lancé sans passer par `npm run build` sauterait le hook
`prebuild`, et l'import CSS échouerait.

### Où obtenir la licence

Lufga se licencie auprès de son fonderie/distributeur. Prendre une licence
**web (webfont)** couvrant le trafic attendu, et récupérer les fichiers
`.woff2` — c'est le seul format nécessaire : tous les navigateurs visés le
prennent en charge, et il est le plus compact.

Si la licence ne fournit que des `.otf` / `.ttf`, les convertir en `.woff2`
(par exemple avec `woff2_compress`) — un `.otf` brut est deux à trois fois plus
lourd à télécharger.

### Vérifier que Lufga est bien active

Dans la console du navigateur :

```js
[...document.fonts]
  .filter((f) => f.family.replace(/["']/g, '') === 'Lufga')
  .map((f) => `${f.weight} → ${f.status}`)
```

- Liste vide → aucune déclaration : les fichiers ne sont pas dans `public/fonts/`,
  ou le script de génération n'a pas été relancé (`npm run fonts:generate`).
- `→ loaded` → Lufga est active.
- `→ error` → le fichier existe mais n'est pas un `.woff2` valide.

> ⚠️ Ne pas utiliser `document.fonts.check('16px Lufga')` : cette méthode
> renvoie `true` même lorsque Lufga n'est **pas** déclarée, car elle teste la
> capacité à rendre le texte — repli compris. Elle ne prouve rien ici.

---

## Outfit — police de repli

Chargée automatiquement par `next/font/google`, qui l'auto-héberge au moment du
build. Aucun appel réseau vers Google au moment de l'affichage : c'est ce qui
permet à la politique de sécurité de contenu de rester `font-src 'self'`.

Outfit est le sans-serif géométrique libre le plus proche de Lufga —
proportions comparables, même hauteur d'x généreuse, terminaisons nettes. Le
tableau de bord reste cohérent avec ou sans Lufga.
