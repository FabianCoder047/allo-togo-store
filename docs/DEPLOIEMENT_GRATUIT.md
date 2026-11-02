# Déploiement gratuit — Render + Neon

Ce guide décrit le déploiement de démonstration **à coût zéro** de la boutique, de l’API et de
Socket.IO. Il ne remplace pas une infrastructure de production payante.

## 1. Architecture retenue

| Brique | Fournisseur gratuit | Rôle |
| --- | --- | --- |
| Application complète | **Render Free Web Service (Docker)** | Sert le SPA Vite, l’API Express et Socket.IO sur une seule origine |
| Base PostgreSQL | **Neon Free** | Données Prisma, migrations et sauvegardes ponctuelles |
| Code source | **GitHub** | Déclenche les déploiements Render |
| E-mail transactionnel | **API Gmail** | Envoi HTTPS OAuth, sans port SMTP |

Le frontend et l’API partagent la même origine. C’est volontaire : les cookies de rafraîchissement
sont `SameSite=Lax`, et Socket.IO se connecte sans configuration d’URL supplémentaire. Un frontend
séparé sur Vercel/Cloudflare nécessiterait des cookies `SameSite=None` et une URL Socket.IO dédiée.

## 2. Pourquoi Neon plutôt que le PostgreSQL gratuit de Render ?

Le PostgreSQL gratuit de Render est supprimé **30 jours après sa création**. Neon Free est
permanent, avec 1 Go de stockage, 100 CU-hours par projet et une mise en veille automatique après
5 minutes d’inactivité. Le réveil est transparent pour Prisma.

Render Free suffit pour le calcul ; Neon conserve les données.

## 3. Créer la base Neon

1. Créer un compte sur <https://neon.com> puis un projet PostgreSQL.
2. Dans **Connect**, récupérer :
   - l’URL **pooled** pour `DATABASE_URL` ;
   - l’URL **directe** pour `DIRECT_URL`.
3. Ajouter les paramètres SSL nécessaires :

```text
DATABASE_URL=postgresql://UTILISATEUR:MOT_DE_PASSE@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15
DIRECT_URL=postgresql://UTILISATEUR:MOT_DE_PASSE@ep-xxx.REGION.aws.neon.tech/neondb?sslmode=require&connect_timeout=15
```

Ne jamais versionner ces URLs : elles contiennent le mot de passe de la base.

## 4. Créer le service Render

### Option A — Blueprint `render.yaml` (recommandée)

1. Pousser le dépôt sur GitHub.
2. Dans Render : **New → Blueprint**.
3. Sélectionner le dépôt `FabianCoder047/allo-togo-store`.
4. Render détecte `render.yaml`, crée le service Docker gratuit et demande les variables secrètes.
5. Renseigner les valeurs demandées (`sync: false`) :
   - `DATABASE_URL`, `DIRECT_URL` : URLs Neon ;
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` : compte Directeur initial ;
   - `SEED_IT_ADMIN_EMAIL`, `SEED_IT_ADMIN_PASSWORD` : compte informaticien initial.
6. Pour `PUBLIC_APP_URL` et `CORS_ORIGINS`, mettre temporairement l’URL Render prévue, par exemple
   `https://allo-togo-store.onrender.com`, puis corriger après la création si Render attribue un
   autre nom. Les deux variables doivent contenir exactement la même origine, sans slash final.

### Option B — Service manuel

1. **New → Web Service**, connecter le dépôt GitHub.
2. Language : **Docker**.
3. Dockerfile : `./Dockerfile`, contexte : racine du dépôt.
4. Instance : **Free**, région : **Frankfurt**.
5. Health check : `/api/health`.
6. Ajouter les variables du fichier `render.yaml`.

## 5. Premier démarrage

Le conteneur exécute automatiquement :

```text
npx prisma migrate deploy
node dist/prisma/seed.js --bootstrap
node dist/src/server.js
```

`--bootstrap` ne s’exécute qu’une seule fois. Il crée :

- les comptes Directeur et informaticien avec les mots de passe `SEED_*` ;
- les catégories et le catalogue initial ;
- un marqueur `system.bootstrap.completed` dans `StoreSettings`.

Après le premier déploiement réussi :

1. se connecter sur `/admin` avec le compte Directeur ;
2. changer le mot de passe depuis **Paramètres** ;
3. supprimer si possible `SEED_ADMIN_PASSWORD` et `SEED_IT_ADMIN_PASSWORD` des variables Render ;
4. créer les autres comptes depuis **Personnel**.

Le marqueur empêche le seed de réécrire le catalogue aux redémarrages suivants.

## 6. Variables minimales

```text
NODE_ENV=production
PUBLIC_APP_URL=https://VOTRE-SERVICE.onrender.com
CORS_ORIGINS=https://VOTRE-SERVICE.onrender.com
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://.../neondb?sslmode=require
JWT_ACCESS_SECRET=<généré>
JWT_REFRESH_SECRET=<généré>
SEED_ADMIN_EMAIL=...
SEED_ADMIN_PASSWORD=...
SEED_IT_ADMIN_EMAIL=...
SEED_IT_ADMIN_PASSWORD=...
SEED_DEMO_STAFF=false
WHATSAPP_PROVIDER=simulated
WHATSAPP_SIMULATION=true
EMAIL_PROVIDER=google
GMAIL_CLIENT_ID=<identifiant-client-oauth>
GMAIL_CLIENT_SECRET=<secret-client-oauth>
GMAIL_REFRESH_TOKEN=<jeton-de-rafraichissement>
MAIL_USERNAME=votre-adresse@gmail.com
MAIL_FROM_NAME=Allo-Togo Shop
BICTORYS_ENABLED=false
BICTORYS_MOCK=false
```

`JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` sont générés par le Blueprint. Ils doivent rester
secrets et différents l’un de l’autre.

## 7. E-mail via l’API Gmail (OAuth)

Cette méthode envoie les emails depuis un compte Gmail par HTTPS. Elle ne requiert ni abonnement
email ni port SMTP, mais le mot de passe d’application Gmail ne suffit pas : il faut créer un client
OAuth et un jeton de rafraîchissement.

1. Dans [Google Cloud Console](https://console.cloud.google.com/), crée un projet et active
   **Gmail API**.
2. Configure l’écran de consentement OAuth et ajoute ton compte Gmail comme utilisateur de test.
   Crée un identifiant OAuth de type **Application Web** et ajoute
   `https://developers.google.com/oauthplayground` comme URI de redirection autorisée ; conserve son
   ID et son secret.
3. Dans [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/), ouvre les paramètres
   (roue dentée), coche **Use your own OAuth credentials**, puis saisis l’ID et le secret du client.
   Sélectionne le scope `https://www.googleapis.com/auth/gmail.send`, autorise l’accès avec le compte
   qui enverra les emails, échange le code, puis copie le **Refresh token**. Ne partage ni le secret
   client ni ce jeton.

```text
EMAIL_PROVIDER=google
GMAIL_CLIENT_ID=<identifiant-client-oauth>
GMAIL_CLIENT_SECRET=<secret-client-oauth>
GMAIL_REFRESH_TOKEN=<jeton-de-rafraichissement>
MAIL_USERNAME=votre-adresse@gmail.com
MAIL_FROM_NAME=Allo-Togo Shop
```

Dans **Render → service → Environment**, renseigne `EMAIL_PROVIDER`, `GMAIL_CLIENT_ID`,
`GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `MAIL_USERNAME` et `MAIL_FROM_NAME`.
`MAIL_USERNAME` doit être le compte Google qui a accordé l’autorisation. Le fichier `.env` local
n’est pas chargé par Render ; ne publie jamais le secret client ni le refresh token dans Git.
Redéploie ensuite le service.

Important : un client OAuth externe laissé en mode **Testing** peut voir son refresh token expirer
après 7 jours. Pour un fonctionnement durable, vérifie les exigences de publication et de
vérification de l’écran de consentement Google avant de considérer la configuration terminée.
Une fois déployé, vérifie l’état email dans l’API d’administration puis envoie un essai à une adresse
que tu contrôles.

## 8. Limites à connaître

| Limite | Conséquence |
| --- | --- |
| Render Free s’endort après 15 min d’inactivité | Premier chargement lent (environ 1 minute) |
| 750 heures d’instance par mois | Suffisant pour un seul service ; un ping permanent consomme presque tout le quota |
| Système de fichiers éphémère | Les médias téléversés dans `backend/uploads/` sont perdus au redéploiement ou au réveil |
| PostgreSQL Neon Free | 1 Go, 100 CU-hours, pas de sauvegarde planifiée |
| WhatsApp simulé | Aucun message réel n’est envoyé |
| Bictorys désactivé | Les paiements en ligne réels restent indisponibles |
| Render peut redémarrer le service | Les sessions en mémoire sont perdues ; les sessions sont en base, donc les comptes restent valides |

Pour les médias produits, utiliser des URLs externes (Cloudinary, Supabase Storage, S3) ou prévoir
un disque persistant Render payant. Le reste des données est dans Neon et survit aux redémarrages.

## 9. Vérifications après déploiement

```text
GET https://VOTRE-SERVICE.onrender.com/api/health
```

Réponse attendue : `status: "ok"` avec `environment: "production"`.

Parcours à tester :

1. ouverture de la boutique ;
2. connexion `/admin` ;
3. création d’un produit ou d’un membre du personnel ;
4. commande client et suivi par code ;
5. paiement en espèces et validation par le chef d’équipe ;
6. rapport de paiement par le commercial ou le Directeur ;
7. audit dans le back-office.

## 10. Alternatives gratuites

| Fournisseur | Avantage | Limite |
| --- | --- | --- |
| **Render + Neon** | Sans carte bancaire, Docker, WebSocket, origine unique | Réveil lent après 15 min |
| **Koyeb + Neon** | Un service gratuit 512 Mo, réveil rapide | Carte bancaire requise, mise en veille après 1 h |
| **Cloudflare Pages + Render API** | Frontend statique très rapide | Cookies et Socket.IO à configurer en cross-origin |
| **Supabase Free** | PostgreSQL + stockage dans le même service | Projet mis en pause après une semaine d’inactivité |
| **Render Free Postgres** | Intégration Render | Base supprimée après 30 jours |

Le couple Render + Neon est retenu car il ne nécessite aucune carte et conserve les données.
