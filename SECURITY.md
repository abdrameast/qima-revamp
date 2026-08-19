# Sécurité — QIMA × Honeylang

Ce document décrit la posture de sécurité de l'application et **les actions de
rotation d'identifiants restant à la charge du propriétaire**.

---

## 1. Identifiants exposés — rotation obligatoire

### Constat

Au moment de l'audit (18 août 2026), deux fichiers **non chiffrés et
distribuables** présents à la racine du dépôt contenaient des identifiants de
production en clair :

| Fichier              | Statut          |
| -------------------- | --------------- |
| `env-config.txt`     | ❌ supprimé     |
| `env-variables.txt`  | ❌ supprimé     |

Le `.gitignore` d'origine ignorait `.env*` mais **pas** les fichiers `.txt` :
ces secrets étaient donc versionnables et livrables tels quels.

### Ce qui a été fait côté dépôt

1. Les valeurs ont été déplacées vers `.secrets-to-rotate.local.txt`, fichier
   **git-ignoré** et **non lu par l'application**, afin que le propriétaire
   conserve de quoi se connecter aux fournisseurs pour effectuer la rotation.
2. Les deux fichiers `.txt` d'origine ont été supprimés.
3. `.gitignore` a été durci : `.env`, `.env.*`, `*.local.txt`, `*.pem`, `*.p12`,
   `*-service-account*.json`, `gcp-*.json`, `*.db`, `*.sqlite` sont désormais
   exclus. `.env.example` reste explicitement autorisé.
4. `.env.example` documente désormais chaque variable **par son nom uniquement**.

### ⚠️ Ce qui reste à faire — ACTION PROPRIÉTAIRE

Ces rotations exigent l'accès à des comptes externes. **Elles n'ont pas été
effectuées et ne peuvent pas l'être depuis le dépôt.** Tant qu'elles ne sont pas
faites, considérer les valeurs concernées comme compromises.

| # | Identifiant | Où le faire | Priorité |
|---|-------------|-------------|----------|
| 1 | **Clé API Resend** (`RESEND_API_KEY`, préfixe `re_`) | Tableau de bord Resend → API Keys → révoquer la clé existante, en créer une nouvelle. La variable n'est plus utilisée par l'application (magic link retiré) : **révoquer sans remplacer**. | 🔴 Immédiate |
| 2 | **Secret de session** (`NEXTAUTH_SECRET`) | Générer `openssl rand -base64 32`, publier sous le nom `SESSION_SECRET` dans les variables d'environnement Vercel. Deux valeurs distinctes existaient dans les deux fichiers : **les deux sont compromises**. La rotation invalide toutes les sessions en cours (comportement voulu). | 🔴 Immédiate |
| 3 | **Mot de passe SMTP** (`EMAIL_SERVER_PASSWORD`) | Console du fournisseur de messagerie → révoquer le mot de passe d'application. Non utilisé par l'application : **révoquer sans remplacer**. | 🔴 Immédiate |
| 4 | **Mot de passe du tableau de bord** (`DASHBOARD_PASSWORD`) | Vercel → Environment Variables. Non présent dans les fichiers exposés, mais à renouveler par précaution (12 caractères minimum, exigé au démarrage). | 🟠 Élevée |
| 5 | **Refresh token Google Drive** (`GOOGLE_REFRESH_TOKEN`) | Non présent dans les fichiers exposés. À révoquer et réémettre **uniquement** s'il a été émis avec un scope plus large que `drive.readonly` — voir `docs/GOOGLE_DRIVE.md`. | 🟠 Élevée |

Après rotation : supprimer `.secrets-to-rotate.local.txt`.

> **Note sur l'historique Git.** Ce dossier n'est pas un dépôt Git à ce jour.
> S'il l'a été, ou s'il est poussé vers un dépôt distant qui contenait déjà ces
> fichiers, la suppression **ne purge pas l'historique** : la rotation reste
> indispensable, et une réécriture d'historique (`git filter-repo`) doit être
> envisagée. Aucune opération Git n'a été effectuée dans le cadre de ce travail.

---

## 2. Cache public de données authentifiées — corrigé

**Avant.** `GET /api/data` renvoyait la totalité des données financières avec :

```
Cache-Control: public, max-age=3600, s-maxage=3600
CDN-Cache-Control: public, max-age=3600
Vercel-CDN-Cache-Control: public, max-age=3600
```

Une réponse authentifiée marquée `public` peut être stockée par n'importe quel
cache intermédiaire (CDN Netlify, proxy d'entreprise, cache navigateur partagé)
puis **servie à un autre utilisateur, y compris non authentifié**. Sur un
tableau de bord financier privé, c'est une fuite de données directe.

**Après.** Toutes les routes `/api/*` répondent désormais avec :

```
Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0
Vary: Cookie
```

La mise en cache est assurée **côté serveur uniquement** (`src/lib/data-cache.ts`),
en mémoire du processus, jamais exposée à un cache partagé, et invalidable
explicitement lors d'un rafraîchissement manuel.

---

## 3. Authentification

| Contrôle | Implémentation |
|----------|----------------|
| Validation des variables d'environnement | `src/lib/env.ts` — l'application refuse de démarrer si `SESSION_SECRET` (< 32 car.), `DASHBOARD_PASSWORD` (< 12 car.) ou `ALLOWED_EMAILS` sont absents/faibles. Évite le cas où un secret non défini produit une clé HMAC devinable. |
| Normalisation des emails | Comparaison insensible à la casse et aux espaces, normalisation Unicode NFKC. |
| Comparaison du mot de passe | `crypto.timingSafeEqual` sur des empreintes SHA-256 de longueur fixe — pas de fuite temporelle, pas de dépendance à la longueur. |
| Anti-énumération | Réponse et délai identiques pour « email inconnu » et « mot de passe faux ». |
| Limitation d'abus | Fenêtre glissante par IP **et** par email, en mémoire (`src/lib/rate-limit.ts`). Voir la limite documentée au §5. |
| Cookies | `HttpOnly`, `SameSite=Lax`, `Secure` en production, `Path=/`, `__Host-` en production. |
| Durée de session | 12 h par défaut (auparavant 30 jours), paramétrable. `iat`/`exp`/`nbf`/`iss`/`aud` vérifiés. |
| Déconnexion | Efface le cookie et renvoie des en-têtes anti-cache. |
| Redirections | Chemins internes uniquement (`/…`), les URL absolues et les `//` protocol-relative sont rejetés. |
| Protection CSRF | Toute route mutative exige `Origin` (ou `Sec-Fetch-Site: same-origin`) correspondant à l'origine de l'application. |
| Endpoint de développement | `/api/auth/dev-login` supprimé. |
| Routes protégées | `proxy.ts` (contrôle optimiste sur cookie) **et** contrôle serveur dans le layout et dans chaque route API — la défense ne repose pas sur le proxy seul. |
| Erreurs API | Messages génériques côté client ; aucune stack trace, aucun identifiant de fichier Drive, aucun secret. Le détail va dans le log serveur avec un identifiant de corrélation. |

---

## 4. En-têtes de sécurité

Appliqués globalement par `src/proxy.ts` :

- `Content-Security-Policy` — `default-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`
- `Strict-Transport-Security` (production, 2 ans, `includeSubDomains`)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` — géolocalisation, micro, caméra, paiement désactivés
- `Cross-Origin-Opener-Policy: same-origin`

Les pages du tableau de bord sont également marquées `noindex, nofollow`.

---

## 5. Limites connues

**Limitation de débit en mémoire.** `src/lib/rate-limit.ts` conserve son état
dans le processus. Sur Vercel comme sur Netlify, les fonctions sont réparties sur plusieurs
instances éphémères : la limite est donc appliquée **par instance**, pas
globalement. Elle décourage le bourrage d'identifiants basique mais ne
constitue pas une protection distribuée.

Pour une protection réellement globale, une des options suivantes est requise —
aucune n'est implémentée ici car elle relève de l'infrastructure :

- **Vercel Firewall** au niveau du edge (configuration côté plateforme) ;
- un magasin partagé (Vercel KV / Upstash Redis) — ajoute une dépendance
  externe et une latence à chaque tentative de connexion ;
- un WAF devant le site.

**Mot de passe partagé.** L'application utilise un mot de passe unique commun à
tous les utilisateurs autorisés, hérité de l'existant. Il n'y a donc ni
imputabilité individuelle ni révocation par utilisateur (seule la liste
`ALLOWED_EMAILS` filtre les accès). Passer à des identifiants individuels ou à
un fournisseur d'identité est une décision produit, hors du périmètre de ce
travail ; le modèle en place a été durci, pas remplacé.

**Contournement d'authentification en développement.** `AUTH_DISABLED=true`
ouvre le tableau de bord sans écran de connexion, pour parcourir l'interface
en local. Trois verrous cumulatifs empêchent qu'il atteigne la production :

1. `NODE_ENV !== 'production'` — `next build` et `next start` imposent
   `production`, le réglage est donc inerte sur tout déploiement ;
2. la valeur doit être exactement `true` ; `1`, `yes`, `TRUE` ou ` true `
   sont refusés (test dédié) ;
3. la variable est relue à chaque requête, jamais mémoïsée.

Vérifié empiriquement : un serveur de production lancé **avec**
`AUTH_DISABLED=true` redirige toujours `/dashboard/*` vers `/login` et renvoie
401 sur `/api/data`. Quand le contournement est actif en local, un bandeau
rouge non masquable l'indique sur chaque écran, et la session porte l'adresse
`acces-local@developpement.invalid` (TLD réservé RFC 2606).

**Cache serveur en mémoire.** Même remarque : le cache de données est par
instance. C'est sans risque de sécurité (aucun partage entre utilisateurs, les
données sont identiques pour tous les utilisateurs autorisés) mais cela réduit
le taux de succès du cache en environnement multi-instances.
