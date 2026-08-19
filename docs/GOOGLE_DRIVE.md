# Intégration Google Drive

Comment le tableau de bord lit les trois classeurs sources, pourquoi ce modèle
d'authentification a été retenu, et ce qu'il reste à configurer côté Google.

---

## 1. Décision : OAuth 2.0 avec compte dédié et refresh token

**Le modèle existant est conservé et durci, pas remplacé.**

### Options examinées

| Option | Retenue | Pourquoi |
|--------|:-------:|----------|
| **OAuth 2.0 « Web server » + refresh token** | ✅ | Déjà en place et fonctionnel. Le jeton est révocable en un clic depuis la page « Applications tierces » du compte Google, sans passer par la console Cloud. Il n'accorde d'accès qu'aux fichiers déjà visibles par ce compte. |
| Compte de service + partage explicite des fichiers | ❌ | Un compte de service ne peut pas *posséder* de fichier dans un Drive grand public, et n'accède à un fichier que s'il lui est explicitement partagé. Surtout, sa clé est un secret **à durée de vie illimitée** hébergé chez un tiers (Netlify) : pire profil de risque qu'un refresh token révocable. La délégation à l'échelle du domaine, qui simplifierait les choses, exige Google Workspace — non applicable à un compte Gmail. |
| Compte de service sans clé (fédération d'identité) | ❌ | Netlify Functions ne fournit pas de jeton OIDC exploitable par Workload Identity Federation. Cette option deviendrait la meilleure sur un hébergeur qui le propose ; elle est notée ici pour le jour où l'hébergement changerait. |

Un seul chemin d'authentification est implémenté. Il n'existe **aucune** bascule
compte de service dans le code : maintenir deux chemins ambigus en production
serait une source d'erreur bien plus coûteuse que le gain de flexibilité.

### Scope : `drive.readonly`, et il est bien nécessaire

`drive.file` — non sensible — serait préférable, mais il ne fonctionne pas ici.
Il ne donne accès qu'aux fichiers **créés par l'application** ou **explicitement
ouverts par l'utilisateur via Google Picker**. Or :

- les classeurs sont créés et maintenus par le propriétaire dans Drive, pas par
  cette application ;
- la synchronisation est **non assistée**, côté serveur : il n'y a pas de
  session utilisateur pour ouvrir un sélecteur de fichiers.

`drive.readonly` est donc le scope minimal qui permette l'accès. Google le
classe **restreint** : voir §4 pour ce que cela implique.

### ⚠️ Le scope se fixe à l'autorisation, pas à l'exécution

L'implémentation précédente passait `scope` à `setCredentials()` avec ce
commentaire : « SCOPE STRICTEMENT EN LECTURE SEULE — aucune écriture possible ».

**C'était faux.** Le scope réel d'un refresh token est figé au moment du
consentement. Ce qui est passé à `setCredentials()` n'est qu'une annotation
locale : un jeton émis avec le scope `drive` complet conserve le droit
d'écriture, quoi qu'on écrive dans le code.

La lecture seule est désormais garantie par trois moyens réels :

1. `npm run drive:authorize` est le seul chemin d'émission documenté, et il
   demande `drive.readonly` ;
2. `src/lib/drive.ts` n'expose aucune opération d'écriture ;
3. `GET /api/health` appelle `verifyReadOnlyScope()`, qui interroge Google sur
   le scope **réellement** attaché au jeton et signale un jeton sur-privilégié.

> **Action propriétaire.** Si le refresh token en production a été émis avant
> ce durcissement, son scope est inconnu. Vérifier via `/api/health`
> (`driveScope.status`). S'il ressort `over_privileged`, le révoquer sur
> https://myaccount.google.com/permissions et le réémettre.

---

## 2. Ce que fait la synchronisation

```
GET /api/data
   └── session vérifiée (signature, expiration, liste blanche)
   └── cache serveur          si frais (< 15 min) → réponse immédiate
   └── sinon : synchronisation
         ├── les 3 classeurs sont récupérés EN PARALLÈLE
         │     pour chacun :
         │       1. files.get (métadonnées)     ← avant tout téléchargement
         │       2. validation : id · corbeille · type MIME · taille
         │       3. files.get?alt=media          (.xlsx binaire)
         │          ou files.export              (Google Sheets natif)
         │       4. signature ZIP « PK\x03\x04 »
         │       5. md5 comparé à celui de Drive
         ├── chaque classeur est lu UNE fois, et ses onglets validés
         └── parsing → calculs
   └── réponse `private, no-store`
```

Points notables :

- **Métadonnées d'abord.** Un fichier trop volumineux, d'un type inattendu ou
  mis à la corbeille est rejeté sans consommer de bande passante.
- **`files.export` uniquement pour les Google Sheets natifs.** Pour un vrai
  `.xlsx`, `files.get` + `alt=media` est la seule méthode correcte. Les deux
  cas sont gérés, et l'export est signalé dans la provenance affichée.
- **Échec groupé.** Les trois récupérations sont attendues ensemble
  (`allSettled`) : un diagnostic complet est produit en une tentative, plutôt
  qu'une erreur à la fois.
- **Réessais ciblés.** Seuls 429, 5xx, timeouts et coupures réseau sont
  réessayés — 3 tentatives, repli exponentiel avec gigue. Un 403 ou un 404 est
  remonté immédiatement : réessayer ne ferait que retarder le diagnostic.
- **Drive partagés.** `supportsAllDrives: true` : un classeur déplacé dans un
  Drive partagé continue d'être trouvé.
- **Jamais de zéro inventé.** Si un onglet requis manque ou si un marqueur
  structurel a disparu, la synchronisation échoue avec un message explicite.
  Afficher « 0 € » à la place d'une donnée illisible serait le pire résultat.

---

## 3. Variables d'environnement

Noms uniquement — les valeurs vivent chez l'hébergeur.

| Variable | Rôle |
|----------|------|
| `GOOGLE_CLIENT_ID` | Identifiant client OAuth, type « Application Web » |
| `GOOGLE_CLIENT_SECRET` | Secret client associé |
| `GOOGLE_REFRESH_TOKEN` | Jeton émis par `npm run drive:authorize` |
| `DRIVE_FILE_ID_PILOTAGE` | Identifiant de `Honeylang_PF_v3.xlsx` |
| `DRIVE_FILE_ID_CRC` | Identifiant de `QIMA_Honeylang_Fiches_CRC_v5.xlsx` |
| `DRIVE_FILE_ID_KPI` | Identifiant de `Honeylang_KPI_DTC_v1.xlsx` |
| `DRIVE_TIMEOUT_MS` | Optionnel. Défaut 20 000. |
| `DRIVE_MAX_FILE_BYTES` | Optionnel. Défaut 25 Mio. |
| `DATA_CACHE_TTL_SECONDS` | Optionnel. Défaut 900. |

L'identifiant d'un fichier est le segment de son URL Drive :
`https://drive.google.com/file/d/`**`<IDENTIFIANT>`**`/view`

L'application refuse de servir des données si l'une des variables obligatoires
manque, avec un message nommant précisément la variable — plutôt que d'échouer
plus loin sur une erreur incompréhensible.

---

## 4. Mise en place côté Google — ACTION PROPRIÉTAIRE

Ces étapes exigent l'accès au compte Google et à la console Cloud. Elles
**n'ont pas été effectuées** et ne peuvent pas l'être depuis le dépôt.

### Étape 1 — Projet et API

1. Ouvrir https://console.cloud.google.com/ et sélectionner (ou créer) le projet.
2. « APIs & Services » → « Library » → activer **Google Drive API**.

### Étape 2 — Écran de consentement OAuth

1. « APIs & Services » → « OAuth consent screen ».
2. Type d'utilisateur : **External** (un compte Gmail ne peut pas choisir Internal).
3. Renseigner nom de l'application, adresse de support, coordonnées du développeur.
4. Ajouter le scope `https://www.googleapis.com/auth/drive.readonly`.
5. Ajouter le compte Google concerné comme utilisateur de test.
6. **Passer l'application « En production » (Publish app).**

> ### 🔴 Point critique : le statut « Test » fait expirer le jeton en 7 jours
>
> La documentation Google est explicite : un projet dont l'écran de consentement
> est de type externe et en statut **« Testing »** reçoit un refresh token
> **expirant au bout de 7 jours**.
>
> Pour une synchronisation non assistée, cela signifie un tableau de bord qui
> tombe en panne chaque semaine. **L'application doit être publiée.**
>
> Publier une application demandant un scope restreint affiche un écran
> d'avertissement « Google n'a pas vérifié cette application » ; le propriétaire
> peut passer outre via « Paramètres avancés » puisqu'il s'agit de son propre
> compte. La vérification formelle Google n'est requise que pour distribuer
> l'application à des tiers — ce qui n'est pas le cas ici.
>
> À noter également : un refresh token inutilisé pendant **six mois** est
> révoqué. La synchronisation quotidienne du tableau de bord suffit à l'éviter.

### Étape 3 — Identifiants OAuth

1. « APIs & Services » → « Credentials » → « Create Credentials » →
   « OAuth client ID ».
2. Type : **Web application**.
3. Ajouter en URI de redirection autorisée :
   `http://localhost:53682/oauth2callback`
   (utilisée uniquement par le script d'autorisation, en local).
4. Noter le Client ID et le Client Secret.

### Étape 4 — Accès aux fichiers

Vérifier que le compte Google utilisé pour l'autorisation a bien accès en
lecture aux trois classeurs — soit qu'il en soit propriétaire, soit qu'ils lui
aient été partagés.

### Étape 5 — Émission du refresh token

En local :

```bash
npm run drive:authorize
```

Le script affiche une URL de consentement, reçoit la redirection sur la boucle
locale, puis affiche le refresh token. Rien n'est écrit sur disque.

### Étape 6 — Publication des variables

Renseigner les six variables du §3 dans les variables d'environnement Netlify,
puis redéployer.

### Étape 7 — Vérification

Se connecter au tableau de bord et ouvrir `/api/health` (session requise) :

```json
{
  "healthy": true,
  "dataSource": "drive",
  "configuration": {
    "auth":  { "ok": true, "missingVariables": [] },
    "drive": { "ok": true, "missingVariables": [] }
  },
  "driveScope": { "status": "ok", "readOnlyOnly": true },
  "cache": { "populated": true, "stale": false }
}
```

`driveScope.status` doit valoir `ok`. Toute autre valeur :

| Valeur | Signification | Action |
|--------|---------------|--------|
| `over_privileged` | Le jeton donne des droits d'écriture | Révoquer et réémettre |
| `missing` | Le scope `drive.readonly` n'a pas été accordé | Réémettre |
| `error` | Jeton invalide ou Drive injoignable | Voir le détail du champ `kind` |

---

## 5. Diagnostic des erreurs

Chaque erreur porte un `kind` et un identifiant de corrélation permettant de
retrouver la trace serveur correspondante.

| `kind` | Cause probable | Action |
|--------|----------------|--------|
| `config` | Variable d'environnement manquante | Le champ `missingVariables` de `/api/health` la nomme |
| `drive_auth` | Refresh token expiré, révoqué, ou identifiants client erronés | `npm run drive:authorize`. Si le jeton a moins de 7 jours, vérifier que l'écran de consentement est publié |
| `drive_permission` | Classeur non partagé avec le compte de synchronisation | Vérifier les partages dans Drive |
| `drive_not_found` | Identifiant erroné, fichier renommé, déplacé ou à la corbeille | Vérifier les `DRIVE_FILE_ID_*` |
| `drive_quota` | Quota Drive atteint | Temporaire ; réessayer |
| `drive_unavailable` | 5xx, timeout, réseau | Temporaire ; réessayé automatiquement |
| `workbook_invalid` | Onglet renommé, colonne déplacée, fichier corrompu | Comparer la structure du classeur au schéma de `src/lib/workbook.ts` |

---

## 6. Journalisation

Les journaux serveur sont structurés en JSON et portent un `correlationId`
propagé sur toute la requête — repris de `x-nf-request-id` sur Netlify, pour
relier les traces applicatives à celles de la plateforme.

Ne figurent **jamais** dans un journal :

- jetons, secrets client, clés d'API (filtrés par motif sur la sortie sérialisée) ;
- identifiants de fichiers Drive (réduits à une empreinte courte) ;
- adresses email (réduites à une empreinte) ;
- contenu des classeurs et valeurs financières.

Exemple d'une synchronisation réussie :

```json
{"level":"info","msg":"drive.sync.start","correlationId":"…","workbooks":3}
{"level":"info","msg":"drive.workbook.fetched","file":"pilotage:a1b2c3d4e5","sizeBytes":46053,"durationMs":412}
{"level":"info","msg":"drive.sync.done","durationMs":1284,"totalBytes":88931}
{"level":"info","msg":"data.sync.parsed","parseMs":96,"months":12,"skus":10}
```
