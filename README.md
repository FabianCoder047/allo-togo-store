# Allo Togo Store

Boutique en ligne d'Allo Togo Conciergerie Tech-IA : traceurs GPS, boissons et packs de services.
L'application a été transformée à partir d'une maquette Figma Make en une application complète :

- **Frontend** React 19 + Vite + Tailwind CSS v4 (design d'origine conservé), à la racine du dépôt.
- **Backend** Node.js + TypeScript + Express + PostgreSQL + Prisma, dans `backend/`.
- **Back-office** du Directeur, avec un rôle `ADMIN` dédié à l’informatique (gestion du personnel, infrastructure, audit et PostHog), et **espace intervenant** (technicien / livreur).
- **Suivi public** par code non devinable, **conversation privée** protégée par vérification du téléphone.
- **Messagerie type WhatsApp** : texte, **notes vocales** (120 s max) et **partage de position**, dans un
  tiroir ouvert depuis le panneau commande et sur la page de suivi client.
- **Dashboards responsives** : logo dans la sidebar sur ordinateur ; barre supérieure et navigation basse
  façon boutique sur mobile et tablette.
- **Choix de règlement au démarrage de la livraison** : espèces ou déclaration mobile Flooz / Mixx by Yas.
  Les espèces sont enregistrées par le commercial ou le directeur au retour de l'équipe, avec auteur,
  date, heure et audit. La déclaration mobile est marquée comme payée sans vérification opérateur pour le
  moment; l'intégration Bictorys reste isolée et **non activée** faute de documentation officielle.
- **WhatsApp** : file d'attente (outbox) et fournisseur simulé par défaut ; aucun message n'est prétendu envoyé.
- **Point de livraison précis** : le client partage sa position actuelle ou colle un lien Google Maps.
  Les coordonnées GPS et le lien sont conservés pour l'équipe, sans clé API Google Maps et sans
  exposition de l'adresse dans le suivi public.
- **Comptes du personnel** : créés par le Directeur sans mot de passe. Un mot de passe provisoire de
  6 caractères est généré et envoyé par email ; le membre doit le changer à sa première connexion.
- **Assistant Allo Togo dynamique** : réponses construites à partir du catalogue actif, refus explicite des
  questions hors périmètre et **escalade vers les comptes employés** (notification persistante + alerte
  temps réel et bip sonore).

> Aucun paiement n'est demandé au moment de la commande.
> Pour les espèces, le chef d'équipe confirme la remise sur place puis le commercial ou le directeur
> enregistre le montant au retour de l'équipe. La commande reste ouverte jusqu'au paiement intégral.

---

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Supabase](#supabase)
- [URLs locales](#urls-locales)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Structure du dépôt](#structure-du-dépôt)
- [Scripts](#scripts)
- [Tests](#tests)
- [Règles métier](#règles-métier)
- [Sécurité](#sécurité)
- [Bictorys et WhatsApp](#bictorys-et-whatsapp)
- [Déploiement gratuit (Render + Neon)](#déploiement-gratuit-render--neon)
- [Production](#production)
- [Documentation](#documentation)

---

## Démarrage rapide

### Prérequis

- Node.js 22 (voir `.mise.toml`)
- pnpm pour le frontend (`corepack enable`)
- PostgreSQL 16+, **ou** la base embarquée fournie par le backend (recommandé en local)

### 1. Backend

```bash
cd backend
cp .env.example .env          # renseigner deux secrets JWT de 32+ caractères
npm install
```

Démarrer PostgreSQL. Deux options :

**Option A — base embarquée (aucune installation système)**

```bash
npm run dev:db                # laisse le processus actif, port 5433
```

Puis, dans un autre terminal :

```bash
# .env : DATABASE_URL=postgresql://postgres:postgres@localhost:5433/allotogo?schema=public
npm run db:migrate            # applique les migrations
npm run db:seed               # catalogue + comptes de démonstration
npm run dev                   # API sur http://localhost:4000
```

**Option B — PostgreSQL local ou Docker**

```bash
docker compose up -d db       # depuis la racine du dépôt
# .env : DATABASE_URL=postgresql://allotogo:allotogo@localhost:5432/allotogo?schema=public
cd backend && npm run db:migrate && npm run db:seed && npm run dev
```

### 2. Frontend

```bash
corepack pnpm install
corepack pnpm dev             # http://localhost:8443
```

Vite redirige `/api` et `/socket.io` vers `http://127.0.0.1:4000`
(configurable via `VITE_API_PROXY_TARGET`).

PostHog reste totalement inactif tant que `VITE_POSTHOG_KEY` n'est pas renseignée. Les variables
facultatives sont documentées dans `.env.example` ; aucune donnée d'audience n'est inventée sans clé
réelle.

### 3. Vérifier

- Boutique : <http://localhost:8443>
- Santé API : <http://localhost:4000/api/health>
- Documentation OpenAPI : <http://localhost:4000/api/docs>

---

## Supabase

L'application utilise **Supabase comme PostgreSQL**, via l'API Node.js existante et Prisma. Le
navigateur ne se connecte pas directement à Supabase : les mots de passe et les tables restent
protégés par le backend. Les migrations Prisma créent les tables dans le schéma `public`.

1. Créez un projet Supabase et ouvrez **Project Settings → Database → Connect**.
2. Pour le lancement avec Docker, copiez `.env.example` vers `.env` à la racine. Pour le lancement
   local du backend, copiez `backend/.env.example` vers `backend/.env`.
3. Renseignez `DATABASE_URL` avec l'URL du pooler **Transaction** et `DIRECT_URL` avec l'URL du
   pooler **Session** (ou l'URL directe si votre environnement la prend en charge). Conservez
   `schema=public`; pour le pooler Transaction, ajoutez aussi `pgbouncer=true&connection_limit=1`
   si ces paramètres ne figurent pas déjà dans l'URL. Encodez les caractères spéciaux du mot de
   passe dans les URLs. Générez également deux secrets JWT distincts de 32 caractères minimum.
4. Appliquez les migrations avant de lancer l'API :

   ```bash
   cd backend
   npm install
   npm run db:deploy
   npm run dev
   ```

   Avec Docker, lancez `docker compose up -d --build` après avoir renseigné le `.env` racine ;
   les migrations sont appliquées automatiquement au démarrage de l'API.
5. Pour consulter les tables, ouvrez le projet Supabase puis **Table Editor → public**. Les
   modèles et migrations sont également décrits dans `backend/prisma/`.

Ne mettez jamais une clé `service_role` ou le mot de passe de la base dans `VITE_*`, le code
frontend ou un dépôt versionné. Pour garder les données de démonstration hors de la base réelle,
n'exécutez pas `npm run db:seed` sur Supabase.

---

## URLs locales

| Service | URL |
| --- | --- |
| Boutique | <http://localhost:8443> |
| Administration | <http://localhost:8443/admin> |
| Espace intervenant | <http://localhost:8443/staff> |
| Suivi public | `http://localhost:8443/suivi/<CODE>` |
| API | <http://localhost:4000/api> |
| Swagger UI | <http://localhost:4000/api/docs> |
| PostgreSQL embarqué | `localhost:5433` |

La boutique peut être installée comme application depuis un navigateur compatible. En production,
servez le frontend en HTTPS. La PWA met en cache uniquement la coquille et les ressources statiques :
les appels API, les sessions et les données de commande ne sont pas conservés hors ligne.

---

## Comptes de démonstration

Les comptes de démonstration sont créés par `npm run db:seed` lorsque `SEED_DEMO_STAFF=true`
(jamais en production). Le compte informatique initial (`ADMIN`) est provisionné séparément par le
seed, même lorsque les comptes de démonstration sont désactivés.

| Rôle | Email | Mot de passe |
| --- | --- | --- |
| Directeur | `admin@allotogo.test` | `AdminAlloTogo!2026` |
| Informaticien (`ADMIN`) | `it@allotogo.test` | `InfoAlloTogo!2026` |
| Employé | `employe@allotogo.test` | `EmployeAlloTogo!2026` |
| Agent commercial | `commercial@allotogo.test` | `CommercialAlloTogo!2026` |
| Technicien | `technicien@allotogo.test` | `TechnicienAlloTogo!2026` |
| Livreur | `livreur@allotogo.test` | `LivreurAlloTogo!2026` |

Le provisionnement refuse de créer les comptes Directeur et Informaticien en production sans leurs paramètres
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` et `SEED_IT_ADMIN_EMAIL` / `SEED_IT_ADMIN_PASSWORD`.
Configurez-les uniquement pour le provisionnement initial et choisissez des mots de passe uniques.
**Ne réutilisez pas les valeurs d’exemple en production.**

Pour provisionner les comptes de départ en production, exécutez `npm run db:bootstrap-admin` dans
`backend/` après les migrations, avec les identifiants de seed définis dans l’environnement backend.
Cette commande crée uniquement le Directeur et l’informaticien, sans modifier le catalogue ni
ajouter de comptes de démonstration ; le rôle `ADMIN` informatique n’a ainsi pas besoin d’être créé
par un Directeur déjà connecté. N’exécutez pas le seed complet `npm run db:seed` sur une base réelle.

Le Directeur et l’informaticien (`ADMIN`) peuvent créer un membre depuis
**Administration → Personnel → Ajouter un membre**. Ils ne saisissent pas de mot de passe : l’API
génère un mot de passe provisoire de 6 caractères, crée le compte avec `mustChangePassword=true`,
puis envoie les identifiants par email. À la première
connexion, l’interface impose le changement de mot de passe (8 caractères minimum, majuscule,
minuscule et chiffre) avant d’ouvrir le back-office ou l’espace intervenant.

Chaque membre, quel que soit son rôle, dispose de l’onglet **Paramètres** (back-office et espace
intervenant) pour mettre à jour son prénom, son nom, son téléphone et son mot de passe. L’email
professionnel reste géré par le Directeur. Un changement de mot de passe déconnecte toutes les
sessions et impose une reconnexion.

En développement, `EMAIL_PROVIDER=simulated` journalise l’email dans la console du backend
(`[EMAIL SIMULÉ] …`). Pour un envoi réel, configurer `EMAIL_PROVIDER=smtp` avec `MAIL_HOST`,
`MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` et `MAIL_FROM_NAME` (Gmail : mot de passe
d’application sur le port 465), ou `EMAIL_PROVIDER=http` avec `EMAIL_API_URL` / `EMAIL_API_TOKEN`.

---

## Structure du dépôt

```text
.
├── src/                     # Frontend React (Vite)
│   ├── pages/               # Accueil, catalogue, panier, commande, suivi, admin, staff
│   ├── components/          # Panneau de commande, chat, cartes produit, UI
│   ├── context/             # Catalogue, panier, authentification, toasts
│   ├── lib/                 # Client API typé, formats, libellés
│   └── types.ts             # Types partagés côté client
├── backend/
│   ├── src/
│   │   ├── modules/         # auth, catalog, orders, payments, tracking, messaging,
│   │   │                    # quotes, admin, staff, notifications, audit
│   │   ├── middleware/      # Auth, permissions, validation, erreurs, rate limit
│   │   ├── realtime/        # Socket.IO
│   │   ├── swagger/         # OpenAPI
│   │   └── config/          # Variables d'environnement, logger
│   ├── prisma/              # Schéma, migrations, seed
│   ├── scripts/dev-db.ts    # PostgreSQL embarqué
│   └── tests/               # Tests unitaires et d'intégration (Vitest + Supertest)
├── public/images/
│   ├── banners/             # Bannières locales (GPS, services, suivi, à propos, contact)
│   └── products/            # Visuels produit locaux (Vitalo)
├── docs/                    # Audit, architecture, règles métier, Bictorys
├── docker-compose.yml       # PostgreSQL + API
└── vite.config.ts           # Proxy /api et /socket.io
```

---

## Scripts

### Frontend (racine)

| Commande | Effet |
| --- | --- |
| `corepack pnpm dev` | Serveur de développement Vite (port 8443) |
| `corepack pnpm build` | Build de production dans `dist/` |
| `corepack pnpm preview` | Sert le build (proxy API inclus) |
| `corepack pnpm format` | Formatage oxfmt |

### Backend (`backend/`)

| Commande | Effet |
| --- | --- |
| `npm run dev` | API avec rechargement (tsx watch) |
| `npm run build` | Compilation TypeScript vers `dist/` |
| `npm start` | Démarre le build (`dist/src/server.js`) |
| `npm run dev:db` | PostgreSQL embarqué sur le port 5433 |
| `npm run db:migrate` | Crée/applique une migration de développement |
| `npm run db:deploy` | Applique les migrations (production) |
| `npm run db:seed` | Catalogue et comptes de démonstration |
| `npm run db:studio` | Prisma Studio |
| `npm test` | Tests unitaires + intégration |
| `npm run typecheck` | Vérification TypeScript |

---

## Tests

```bash
cd backend
npm test
```

Les tests utilisent un **schéma PostgreSQL dédié** (`allotogo_test`), recréé et peuplé par
`tests/globalSetup.ts`. Ils ne touchent jamais le schéma `public` et ignorent le rate limiting.

Couverture fonctionnelle :

- séparation panier GPS / boissons en commandes indépendantes ;
- transitions de statut et garde-fou `LIVREE` (intervention terminée + remise confirmée) ;
- encaissement partiel, complément, statut de paiement ;
- affectation technicien / livreur, chef de groupe et permissions ;
- création d’un compte sans mot de passe, email simulé, changement forcé et blocage API tant que le
  mot de passe provisoire n’a pas été remplacé ;
- suivi public, vérification téléphone, messagerie privée, non-exposition des notes internes ;
- demandes de devis et mise à jour de leur statut ;
- assistant : réponses catalogue, relance courte, refus hors périmètre, escalade et notifications
  employés, suivi par code ou numéro de commande ;
- outbox WhatsApp : mise en file puis traitement par le fournisseur simulé ;
- webhooks Bictorys idempotents (fournisseur mock).

```bash
npm run test:unit
npm run test:integration
```

---

## Règles métier

Résumé :

1. **Aucun paiement en ligne au moment de la commande.**
2. Un panier mixte est **scindé** en deux commandes opérationnelles indépendantes (GPS / boissons),
   reliées par un `OrderGroup`. Chaque commande a son propre code de suivi et son propre statut.
3. Le statut de commande, le statut opérationnel, le statut de paiement, le mode de paiement et le mode
   de réception sont **cinq dimensions distinctes**.
4. Le chef d'équipe peut confirmer une livraison en espèces avant l'enregistrement au bureau. Le commercial
   ou le directeur saisit alors le montant remis; le paiement intégral reste nécessaire pour clôturer la commande.
   Les retraits et autres modes de paiement restent soumis au paiement intégral avant remise.
5. Les codes de suivi sont publics mais **non devinables** ; la conversation privée exige le téléphone
   utilisé lors de la commande.
6. Les notes internes et le détail des paiements ne sont **jamais** exposés publiquement. Le choix du mode
   de paiement est disponible dans l'espace de suivi après vérification du téléphone.

Détail complet : [`docs/REGLES_METIER.md`](docs/REGLES_METIER.md).

---

## Sécurité

- Mots de passe hachés avec bcrypt (12 rounds par défaut).
- Jeton d'accès JWT court en mémoire côté client ; **cookie de rafraîchissement httpOnly**, `SameSite=Lax`,
  rotation et révocation en base.
- Aucun jeton dans `localStorage`.
- Autorisation par permissions côté serveur (`DIRECTOR` pour la direction, `ADMIN` pour l’informatique, puis `EMPLOYEE`, `COMMERCIAL`, `TECHNICIAN` et `DELIVERY`).
- Validation systématique des entrées avec Zod.
- Helmet, CORS restrictif (en développement, les origines locales sont tolérées), rate limiting
  (connexion, suivi, vérification téléphonique, commandes).
- Les techniciens/livreurs ne voient que les commandes qui leur sont affectées.
- Journal d'audit des actions métier, visible par le Directeur et l’informaticien. Les logs techniques du code sont séparés, consultables uniquement par le rôle informatique `ADMIN` et conservés 30 jours ; ils ne sont pas visibles du Directeur. L’espace Infrastructure de l’informaticien expose aussi les indicateurs d’affluence et le tableau de bord PostHog.
- Secrets uniquement dans `.env` (ignoré par Git). `.env.example` ne contient aucune valeur réelle.

---

## Assistant Allo Togo

L’assistant flottant (`src/components/ChatWidget.tsx`) appelle `POST /api/assistant`. Le moteur
(`backend/src/modules/assistant/`) interroge le catalogue actif et les paramètres de la boutique à
chaque message : les noms, prix, stocks et liens produits ne sont pas figés dans le frontend.

- **Question couverte** : réponse contextualisée (catalogue, prix, stock, suivi par code de suivi ou
  numéro de commande, livraison, paiement, devis, contact, garantie, installation).
- **Question Allo Togo non couverte** : réponse « je vais faire appel à un employé de Allo Togo »,
  création d’un fil `AssistantThread` lié à la session cliente, notification
  `ASSISTANT_ESCALATION` pour chaque compte `DIRECTOR`/`EMPLOYEE`/`COMMERCIAL` actif, diffusion Socket.IO dans le
  salon `staff:all` et bip Web Audio côté navigateur.
- **Reprise humaine** : depuis le bandeau, la cloche de notifications ou le panneau « Messages
  assistant », un employé ouvre la discussion, lit l’historique et répond au client. La réponse est
  diffusée aux autres employés (`assistant:support-message`) et récupérée par le widget client via
  `GET /api/assistant/thread/:sessionId`. La discussion peut être marquée `ANSWERED` ou `RESOLVED`.
- **Question hors périmètre** (météo, sport, cuisine, programmation, etc.) : refus explicite, sans
  escalade ni notification.
- **Questions de politique, procédure ou litige** : escalade, sauf si un modèle précis est cité.
  Le matching produit ignore les termes génériques (`pack`, `entreprise`, `service`, `GPS`, etc.).
- **Historique court** : le frontend envoie les derniers messages pour résoudre les relances
  (« et pour une moto ? ») ; une nouvelle question complète n’hérite pas du produit précédent.
  Un cache de 60 s par session évite les doublons d’escalade.
- **Rate limit** : 30 messages/minute par client.

Les alertes sont consultables par les employés dans la vue d’ensemble du back-office, panneau
« Messages assistant ». La cloche des dashboards regroupe les alertes assistant et les missions
affectées (`GET /api/staff/notifications`) ; l’état lu est conservé localement dans le navigateur.
Les bannières et visuels sont servis localement depuis `public/images/`.

---

## Bictorys et WhatsApp

- **Bictorys** : l'adaptateur est isolé (`backend/src/modules/payments/bictorys.ts`). Le fournisseur réel
  renvoie volontairement `501 BICTORYS_NOT_CONFIGURED` tant que la documentation officielle (URLs,
  en-têtes, signature, format de webhook) n'est pas fournie. Un fournisseur **mock** permet de tester
  le flux de bout en bout uniquement si `BICTORYS_MOCK=true` et hors production.
- **WhatsApp** : les notifications sont mises en file dans une table `Notification` (outbox). Le
  fournisseur par défaut est `simulated` : le message est journalisé, **jamais envoyé**, et son statut
  reste explicite. Un fournisseur HTTP peut être configuré via `WHATSAPP_PROVIDER=http`.
- **Email** : l’envoi des identifiants de nouveaux comptes utilise le même principe d’isolation.
  `EMAIL_PROVIDER=simulated` journalise le message sans envoi réel ; `EMAIL_PROVIDER=smtp` utilise
  `MAIL_*` (Gmail, port 465) ; `EMAIL_PROVIDER=http` effectue un POST JSON vers `EMAIL_API_URL` avec
  `EMAIL_API_TOKEN`. Le mode simulé est refusé en production.

Voir [`docs/BICTORYS.md`](docs/BICTORYS.md).

---

## Déploiement gratuit (Render + Neon)

Le dépôt contient un `Dockerfile` tout-en-un et un Blueprint `render.yaml` : un seul service Render
Free sert le SPA, l’API et Socket.IO sur la même origine. PostgreSQL est hébergé sur Neon Free.

1. Créer la base Neon et récupérer `DATABASE_URL` (pooled) et `DIRECT_URL` (directe).
2. Pousser le dépôt sur GitHub.
3. Dans Render : **New → Blueprint**, sélectionner le dépôt et renseigner les secrets demandés.
4. Après le premier déploiement, vérifier `/api/health`, changer les mots de passe initiaux et
   supprimer les variables `SEED_*_PASSWORD` de Render.

Guide détaillé, variables, premier bootstrap et limites :
[`docs/DEPLOIEMENT_GRATUIT.md`](docs/DEPLOIEMENT_GRATUIT.md).

---

## Production

```bash
# Base + API
docker compose up -d --build

# Frontend
corepack pnpm build
# Servir dist/ derrière un reverse proxy qui redirige /api et /socket.io vers l'API.
```

Checklist minimale :

- [ ] `NODE_ENV=production`
- [ ] Secrets JWT aléatoires (32+ caractères) et distincts
- [ ] `CORS_ORIGINS` limité au domaine réel
- [ ] `SEED_DEMO_STAFF=false`, mots de passe de démonstration supprimés
- [ ] `SEED_ADMIN_PASSWORD` et `SEED_IT_ADMIN_PASSWORD` uniques pour le provisionnement initial
- [ ] PWA servie en HTTPS en production
- [ ] `BICTORYS_MOCK=false`, `WHATSAPP_SIMULATION=false` uniquement si un vrai fournisseur est configuré
- [ ] `EMAIL_PROVIDER=http` (Resend compatible) ou SMTP hors Render Free, pour les comptes du personnel
- [ ] Sauvegardes PostgreSQL et supervision des webhooks
- [ ] HTTPS et cookies `Secure`
- [ ] Après le bootstrap : retirer `SEED_*_PASSWORD` des variables d’environnement
- [ ] Vérifier `/api/health` et le marqueur `system.bootstrap.completed`

---

## Documentation

- [`docs/AUDIT_INITIAL.md`](docs/AUDIT_INITIAL.md) — état de la maquette, écarts et décisions
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture, modèle de données, API, flux
- [`docs/REGLES_METIER.md`](docs/REGLES_METIER.md) — règles fonctionnelles détaillées
- [`docs/BICTORYS.md`](docs/BICTORYS.md) — intégration paiement et prérequis
- [`docs/DEPLOIEMENT_GRATUIT.md`](docs/DEPLOIEMENT_GRATUIT.md) — déploiement Render + Neon
- Swagger : `http://localhost:4000/api/docs`
