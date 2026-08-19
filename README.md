# Tableau de bord Honeylang — Mission Qima

Tableau de bord financier privé. Lit trois classeurs Excel depuis Google Drive
en lecture seule, les valide, en dérive les indicateurs de pilotage, et les
restitue en français à un lectorat de direction.

**Accès strictement privé. Aucune donnée n'est publique, aucune n'est modifiée
à la source.**

---

## Démarrage

```bash
npm install
cp .env.example .env.local     # puis renseigner les variables
npm run fixtures:generate      # classeurs synthétiques pour le développement
npm run dev
```

Sans identifiants Google, travailler sur des données synthétiques :

```bash
# dans .env.local
DATA_SOURCE=local
```

Ce mode est **ignoré en production** : une variable oubliée ne peut pas servir
de fausses données à un dirigeant. L'interface affiche en permanence un bandeau
« Fixtures synthétiques — pas des chiffres réels ».

Pour parcourir l'interface sans écran de connexion :

```bash
# dans .env.local
AUTH_DISABLED=true
```

Inopérant en production — voir [`SECURITY.md §5`](./SECURITY.md). Un bandeau
rouge signale l'état actif sur chaque écran.

---

## Commandes

| Commande | Rôle |
|----------|------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, sans émission |
| `npm test` | Suite de tests (`node:test`, sans dépendance supplémentaire) |
| `npm run design:contrast` | Contrôle WCAG des jetons de couleur |
| `npm run verify` | Enchaîne lint, typecheck, contraste, tests et build |
| `npm run fixtures:generate` | Régénère les classeurs synthétiques |
| `npm run drive:authorize` | Émet un refresh token Drive en lecture seule |

`npm run fixtures:generate -- --partial` et `-- --empty` produisent des jeux
dégradés, pour vérifier les états « données partielles » et « en attente du
grand livre ».

---

## Documentation

| Document | Contenu |
|----------|---------|
| [`SECURITY.md`](./SECURITY.md) | Posture de sécurité et **rotations d'identifiants restant à faire** |
| [`docs/GOOGLE_DRIVE.md`](./docs/GOOGLE_DRIVE.md) | Modèle d'authentification, mise en place Google, diagnostic |
| [`docs/DESIGN.md`](./docs/DESIGN.md) | Jetons, primitives, accessibilité, impression |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Déploiement Vercel |
| [`.env.example`](./.env.example) | Toutes les variables, par leur nom |

---

## Architecture

```
Google Drive  ──►  drive.ts      récupération, validation, réessais
                        │
                        ▼
                   workbook.ts   lecture unique, validation structurelle
                        │
                        ▼
                 parse-excel.ts  extraction (pur, testable)
                        │
                        ▼
                   compute.ts    calculs financiers (pur, testable)
                        │
                        ▼
                 data-cache.ts   cache serveur, déduplication
                        │
                        ▼
                /api/data        session vérifiée, réponse `no-store`
                        │
                        ▼
                 DataProvider    contexte client
                        │
                        ▼
                   7 pages       présentation
```

Chaque couche ignore celle du dessus. Les pages n'ont aucune notion de Google
Drive ; `compute.ts` n'a aucune notion de HTTP ; `parse-excel.ts` ne fait pas
d'entrée-sortie.

### Modules

| Fichier | Rôle |
|---------|------|
| `lib/env.ts` | Validation typée de la configuration, messages actionnables |
| `lib/drive.ts` | Client Drive : métadonnées, téléchargement, traduction des erreurs |
| `lib/retry.ts` | Politique de réessai (repli exponentiel, gigue) |
| `lib/workbook.ts` | Résolution des onglets, validation structurelle |
| `lib/parse-excel.ts` | Extraction métier — **fonctions pures** |
| `lib/compute.ts` | Calculs financiers — **fonctions pures** |
| `lib/period.ts` | Période d'analyse — **fonctions pures** |
| `lib/alerts.ts` | Moteur d'alertes — **fonctions pures** |
| `lib/format.ts` | Formatage `fr-FR` — **fonctions pures** |
| `lib/csv.ts` | Export CSV — **fonctions pures** |
| `lib/auth.ts` | Sessions et identifiants, indépendant de Next |
| `lib/session.ts` | Lecture du cookie de session (seul module liant `next/headers`) |
| `lib/http.ts` | En-têtes de cache, CSRF, redirections sûres |
| `lib/logger.ts` | Journalisation structurée, redaction, corrélation |
| `lib/data-cache.ts` | Cache serveur, déduplication des requêtes |

Les fonctions marquées **pures** sont sans état ni entrée-sortie : c'est ce qui
rend la couche métier testable avec des fixtures synthétiques, sans réseau.

---

## Fonctionnalités

**Vue d'ensemble** — chiffre d'affaires, marge brute, trésorerie, BFR sur la
période choisie ; évolution mensuelle réalisé/budget ; centre d'alertes.

**Canaux** — rentabilité comparée du DTC, de TikTok Shop et de la pharmacie :
ROI, coût par euro de chiffre d'affaires, délai de règlement.

**Shopify** — taux de réachat, panier moyen, coût d'acquisition, ratio LTV/CAC,
références les plus contributives.

**Produits & Marges** — catalogue triable, filtrable et recherchable ;
concentration 80/20 ; répartition des charges fixes ; export CSV.

**Trésorerie** — runway, cycle de conversion par canal, facteurs de tension.

**Simulations** — remise commerciale, campagne publicitaire, nouveau produit.
Scénarios nommés et comparaison côte à côte, **en mémoire de page uniquement**.

**Budget vs Réel** — écarts par poste et convention de signe explicite.

Transversal : sélecteur de période partagé et persistant, provenance et
fraîcheur des données visibles en permanence, rafraîchissement manuel, export
CSV, impression PDF, états vides distincts de zéro.

---

## Principes tenus dans tout le code

**Une valeur manquante n'est jamais un zéro.** L'absence s'affiche « — », et
les états vides expliquent *pourquoi* la donnée manque. Un tableau de bord de
direction qui affiche « 0 € » là où la donnée n'existe pas est plus dangereux
qu'un tableau de bord en erreur.

**En cas de doute, échouer.** Un onglet renommé ou une colonne déplacée
interrompt la synchronisation avec un message explicite, plutôt que de produire
des chiffres plausibles mais faux.

**Les données authentifiées ne sont jamais mises en cache partagé.** Le cache
vit côté serveur ; les réponses HTTP sont `private, no-store`.

**Les alertes sont des signaux, pas des avis.** Chaque alerte expose la règle
qui l'a déclenchée et la source de la donnée, pour pouvoir être contestée.

**La couleur n'est jamais le seul porteur d'information.**

---

## Tests

219 tests, exécutés par le lanceur intégré de Node — aucune dépendance de test
n'a été ajoutée.

```bash
npm test
```

Couverture : invariants financiers (additivité des périodes, bornes de marge,
cohérence montant/pourcentage), parsing et validation de structure, valeurs
manquantes / nulles / malformées, classification des erreurs Drive, validation
des métadonnées, discordance de type MIME, réessais et délais, en-têtes de
cache, CSRF, redirections ouvertes, limitation d'abus, sessions, injection de
formule CSV, règles d'alerte.

Les fixtures sont **entièrement synthétiques** (`tests/fixtures/`). Aucun
classeur confidentiel ni donnée de production n'est versionné.
