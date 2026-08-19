# Déploiement — Vercel

---

## 1. Importer le projet

1. https://vercel.com/new → **Import Git Repository**
2. Sélectionner le dépôt et la branche à déployer.
3. Vercel détecte Next.js automatiquement. **Ne rien changer** aux réglages de
   build : `npm run build` déclenche le hook `prebuild` qui génère les
   `@font-face` de Lufga.
4. Ne pas déployer tout de suite — renseigner d'abord les variables ci-dessous,
   sinon le premier déploiement échouera à la première requête.

`vercel.json` fixe deux choses :

- **région `cdg1` (Paris)** — les fonctions s'exécutent au plus près des
  utilisateurs et de l'API Drive européenne ;
- **`no-store` sur `/api/*`**, y compris `CDN-Cache-Control` et
  `Vercel-CDN-Cache-Control`. C'est une ceinture de sécurité : le code pose
  déjà ces en-têtes, mais les redéclarer au niveau de la plateforme garantit
  qu'aucune donnée financière authentifiée ne peut être mise en cache par le
  CDN, même si une route future oubliait de le faire.

---

## 2. Variables d'environnement

Vercel → **Settings** → **Environment Variables**.

Toutes sont **strictement serveur** : aucune n'est préfixée `NEXT_PUBLIC_`,
donc aucune n'atteint le navigateur.

### Obligatoires — authentification

| Variable | Valeur | Environnements |
|----------|--------|----------------|
| `SESSION_SECRET` | fournie séparément (44 caractères) | Production, Preview |
| `ALLOWED_EMAILS` | adresses autorisées, séparées par des virgules | Production, Preview |
| `DASHBOARD_PASSWORD` | fourni séparément | Production, Preview |

### Obligatoires — Google Drive

| Variable | Où l'obtenir |
|----------|--------------|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | idem |
| `GOOGLE_REFRESH_TOKEN` | `npm run drive:authorize`, en local |
| `DRIVE_FILE_ID_PILOTAGE` | segment `/file/d/<ID>/view` de l'URL Drive |
| `DRIVE_FILE_ID_CRC` | idem |
| `DRIVE_FILE_ID_KPI` | idem |

Procédure complète : [`docs/GOOGLE_DRIVE.md §4`](./GOOGLE_DRIVE.md).

### Recommandée

| Variable | Valeur |
|----------|--------|
| `APP_ORIGIN` | URL exacte du site, ex. `https://qima-revamp.vercel.app` |

Sans elle, l'application retombe sur `VERCEL_PROJECT_PRODUCTION_URL`, injectée
automatiquement — le domaine de production **stable**.

> ⚠️ Ne jamais utiliser `VERCEL_URL` comme origine : cette variable pointe sur
> le déploiement courant, dont l'URL est unique par commit. La vérification
> CSRF échouerait sur chaque aperçu. Le code privilégie déjà
> `VERCEL_PROJECT_PRODUCTION_URL` pour cette raison.

### À ne JAMAIS définir en production

| Variable | Pourquoi |
|----------|----------|
| `DATA_SOURCE=local` | sert des données **synthétiques**. Ignorée si `NODE_ENV=production`, mais elle n'a rien à faire dans la configuration d'un site en ligne. |
| `AUTH_DISABLED=true` | contourne l'authentification. Même garde-fou, même remarque. |

Ces deux verrous ont été vérifiés empiriquement : un serveur de production
lancé **avec** `AUTH_DISABLED=true` redirige toujours vers `/login`.

---

## 3. Mise en service

1. Effectuer les rotations d'identifiants de [`SECURITY.md §1`](../SECURITY.md).
2. Suivre [`docs/GOOGLE_DRIVE.md §4`](./GOOGLE_DRIVE.md) — **dont la
   publication de l'écran de consentement OAuth**, sans laquelle le refresh
   token expire au bout de 7 jours.
3. Renseigner les variables ci-dessus.
4. Déployer.
5. Se connecter, puis ouvrir `/api/health`.

---

## 4. Vérification après déploiement

```bash
SITE=https://votre-site.vercel.app

# 1. La racine redirige vers l'authentification
curl -sI $SITE/ | head -1

# 2. Les données sont refusées sans session
curl -s $SITE/api/data
#    → {"kind":"auth","error":"Votre session a expiré…"}

# 3. Aucune mise en cache partagée sur les données authentifiées
curl -sI $SITE/api/data | grep -i "cache-control\|cdn-cache"
#    → private, no-store, … et no-store sur les deux en-têtes CDN.
#    Toute apparition de « public » ou « s-maxage » est une régression grave.

# 4. En-têtes de sécurité présents
curl -sI $SITE/login | grep -iE "content-security-policy|x-frame|strict-transport"
```

Puis, connecté, sur `/api/health` :

```json
{
  "healthy": true,
  "dataSource": "drive",
  "configuration": { "auth": { "ok": true }, "drive": { "ok": true } },
  "driveScope": { "status": "ok", "readOnlyOnly": true }
}
```

`driveScope.status` doit valoir `ok`. Toute autre valeur est expliquée dans
[`docs/GOOGLE_DRIVE.md §7`](./GOOGLE_DRIVE.md).

---

## 5. Limites propres à la plateforme

**Limitation d'abus par instance.** `src/lib/rate-limit.ts` conserve son état
en mémoire. Les fonctions Vercel sont réparties sur plusieurs instances
éphémères : la limite s'applique **par instance**, pas globalement. Elle
décourage le bourrage d'identifiants naïf sans constituer une protection
distribuée.

Pour une protection réelle : **Vercel Firewall** (Attack Challenge Mode ou
règles de rate limiting) au niveau du edge, ou un magasin partagé (Vercel KV /
Upstash Redis) — ce dernier ajoute une dépendance externe et une latence à
chaque tentative de connexion. Aucun des deux n'est implémenté ici.

**Cache de données par instance.** Même remarque pour `src/lib/data-cache.ts`.
Sans conséquence de sécurité — les données sont identiques pour tous les
utilisateurs autorisés — mais le taux de succès du cache baisse, donc le
nombre d'appels Drive augmente. Si le quota Drive devenait contraignant,
Vercel KV serait la première option à considérer.

**Démarrages à froid.** La première requête après inactivité subit un
démarrage à froid, plus une synchronisation Drive si le cache est vide :
compter quelques secondes. Les écrans de chargement sont conçus pour cela.

**Durée maximale d'exécution.** Le plan Hobby limite les fonctions à 10 s.
Une synchronisation Drive prend typiquement 1 à 3 s pour les trois classeurs,
téléchargés en parallèle — la marge est confortable. Si les classeurs
grossissaient beaucoup, passer au plan Pro (60 s) ou augmenter
`DATA_CACHE_TTL_SECONDS` pour espacer les synchronisations.

---

## 6. Revenir à Netlify

L'application ne dépend d'aucune primitive propriétaire. `clientIp()` et le
logger reconnaissent déjà les en-têtes Vercel, Netlify et Cloudflare, et
`getAppOrigin()` accepte `URL` (Netlify) comme `VERCEL_PROJECT_PRODUCTION_URL`.

Il suffirait de recréer un `netlify.toml` :

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

`vercel.json` est ignoré par Netlify, et réciproquement : les deux peuvent
coexister sans conflit.
