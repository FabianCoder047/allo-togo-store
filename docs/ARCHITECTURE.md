# Architecture

## 1. Vue d'ensemble

```text
┌──────────────────────────────────────────────────────────────────┐
│ Navigateur                                                       │
│  React 19 + Vite + Tailwind v4                                   │
│  - Boutique publique (/, /traceurs, /produits/:id, /panier, …)   │
│  - Suivi public (/suivi/:code)                                   │
│  - Back-office (/admin) et espace intervenant (/staff)           │
│  - Client API typé (fetch) + Socket.IO (personnel)               │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ /api (HTTP, cookie httpOnly)   │ /socket.io (WS)
                ▼                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ Reverse proxy / Vite (dev)                                       │
│  - Frontend statique (dist/)                                     │
│  - Proxy /api et /socket.io vers l'API                           │
└───────────────┬──────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ API Node.js + Express + TypeScript                               │
│  Routes → validation Zod → permissions → services → Prisma       │
│  Auth JWT · Rate limiting · Helmet · CORS · Pino · Swagger       │
│  Socket.IO (salons par commande) · Outbox notifications          │
└───────────────┬──────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ PostgreSQL (local ou Supabase)                                   │
│  Catalogue · Commandes · Paiements · Suivi · Messagerie · Audit  │
└──────────────────────────────────────────────────────────────────┘
```

En production, Supabase héberge PostgreSQL. Prisma utilise `DATABASE_URL` pour les connexions
de l'application et `DIRECT_URL` pour les migrations, afin de prendre en charge le pooler
Transaction de Supabase sans faire transiter les migrations par celui-ci. Les tables se
consultent dans le Table Editor Supabase, schéma `public`.

Principes directeurs :

1. **Le serveur est la seule source de vérité** (statuts, prix, permissions, paiements).
2. **Aucun compte client** : le suivi repose sur un code non devinable + vérification téléphonique.
3. **Séparation nette** entre commande commerciale, exécution opérationnelle et encaissement.
4. **Intégrations externes isolées** derrière des interfaces (Bictorys, WhatsApp).
5. **Frontend sans données fictives** : les erreurs API sont affichées, jamais remplacées par des données de démo.

---

## 2. Frontend

### 2.1 Structure

| Élément | Rôle |
| --- | --- |
| `src/App.tsx` | Coquille applicative, routage par `history.pushState`, header/footer |
| `src/pages/HomePage.tsx` | Accueil, mise en avant catalogue et services |
| `src/pages/CatalogPage.tsx` | Catalogue filtrable (GPS, boissons, services) |
| `src/pages/ProductPage.tsx` | Fiche produit, ajout au panier ou demande de devis |
| `src/pages/CartPage.tsx` | Panier persistant (localStorage) |
| `src/pages/CheckoutPage.tsx` | Formulaire de commande, création via API |
| `src/pages/ConfirmationPage.tsx` | Référence de groupe + codes de suivi |
| `src/pages/TrackingPage.tsx` | Suivi public, accès téléphone, messagerie |
| `src/pages/AdminPage.tsx` | Back-office à onglets |
| `src/pages/StaffPage.tsx` | Missions de l'intervenant connecté |
| `src/pages/LoginPage.tsx` | Connexion personnel (admin / intervenant) |
| `src/components/ForcePasswordChange.tsx` | Changement obligatoire du mot de passe provisoire à la première connexion |
| `src/components/AccountSettings.tsx` | Onglet Paramètres commun à tous les profils : prénom, nom, téléphone, mot de passe |
| `src/components/OrderDetailPanel.tsx` | Détail commande, actions, paiements, notes ; bouton Messages ouvrant le tiroir de conversation |
| `src/components/Chat.tsx` | Fil de messages partagé, bulles texte/vocal/image/vidéo/localisation, composeur WhatsApp |
| `src/components/DashboardNav.tsx` | Barre mobile et navigation basse des dashboards |
| `src/components/DashboardNotifications.tsx` | Cloche des dashboards, badge de lecture locale, alertes assistant et missions |
| `src/components/ChatWidget.tsx` | Assistant Allo Togo dynamique (catalogue, escalade employé, hors périmètre, réponses employé) |
| `src/components/StaffAssistantAlerts.tsx` | Bandeau + bip Web Audio des alertes assistant pour DIRECTOR/EMPLOYEE/COMMERCIAL |
| `src/components/AssistantThreadPanel.tsx` | Discussion client, réponse employé et clôture d’une alerte assistant |
| `src/context/StoreContext.tsx` | Catalogue, panier, session, toasts |
| `src/lib/api.ts` | Client HTTP typé, rafraîchissement du jeton, erreurs |
| `src/lib/realtime.ts` | Connexion Socket.IO du personnel |
| `src/lib/useVoiceRecorder.ts` | Enregistrement vocal MediaRecorder (120 s max) |
| `src/lib/format.ts` | Formats monétaires et dates |
| `src/lib/labels.ts` | Libellés français des statuts |

### 2.2 Gestion de session

- Le **jeton d'accès** est conservé **en mémoire** (`src/lib/api.ts`), jamais dans `localStorage`.
- Le **jeton de rafraîchissement** est un cookie `httpOnly` posé par l'API.
- Un cookie lisible `allo_session=1` sert uniquement de marqueur : sans lui, le frontend n’appelle pas
  `/api/auth/refresh` au démarrage et évite un `401` inutile sur les pages publiques.
- Au démarrage, `POST /api/auth/refresh` restaure la session si le cookie est valide.
- Sur `401`, le client tente un rafraîchissement unique, puis déconnecte si nécessaire.
- Les erreurs transitoires `502`/`503`/`504` des GET sont retentées deux fois avec un court délai.
  Un rafraîchissement indisponible ne déconnecte pas immédiatement l’utilisateur.
- Les appels utilisent `credentials: 'include'` et une base relative `/api` (même origine).

### 2.3 Temps réel

`src/lib/realtime.ts` ouvre une connexion Socket.IO authentifiée par le jeton d'accès.
`OrderDetailPanel` rejoint le salon `order:<id>` et recharge la commande à chaque événement
`message:new`. Le serveur vérifie l'affectation avant d'autoriser l'entrée dans le salon.

Les alertes assistant et les réponses d'employé sont diffusées dans `staff:all`
(`assistant:escalation`, `assistant:support-message`, `assistant:support-status`). Le panneau de
discussion et la cloche se resynchronisent à réception.

Le suivi public et le widget client n'utilisent pas Socket.IO : le widget interroge
`GET /api/assistant/thread/:sessionId` lorsqu'il est ouvert pour afficher les réponses d'un employé.
Une extension temps réel publique nécessiterait un jeton de suivi dédié.

### 2.4 Assistant Allo Togo

`ChatWidget` appelle `POST /api/assistant` avec le message courant, un `sessionId` et les derniers
messages. Le backend (`backend/src/modules/assistant/`) construit la réponse à partir du catalogue
actif et des paramètres boutique, sans réponse produit codée en dur.

Trois issues :

1. **Réponse** : intention reconnue (catalogue, prix, stock, suivi par code de suivi ou numéro de
   commande, livraison, paiement, devis, contact, installation/garantie) ou fiche produit pertinente.
2. **Escalade** : question liée à Allo Togo mais non couverte. Un fil `AssistantThread` est créé ou
   réutilisé pour la session cliente, avec l’historique utile. Une notification
   `ASSISTANT_ESCALATION` est créée pour chaque compte `DIRECTOR`/`EMPLOYEE`/`COMMERCIAL` actif, puis
   `assistant:escalation` est diffusé dans `staff:all`. Le frontend affiche un bandeau persistant et
   joue un bip Web Audio ; le back-office liste les alertes dans « Messages assistant » et la cloche
   des dashboards.
3. **Hors périmètre** : sujet étranger aux services (météo, sport, cuisine, programmation, etc.).
   Réponse explicite « je ne suis pas en mesure de répondre », sans notification.

Depuis une alerte, `AssistantThreadPanel` charge le fil, permet à un employé de répondre et de le
marquer résolu. La réponse est enregistrée dans `AssistantThreadMessage`, diffusée aux employés via
`assistant:support-message` et exposée au client par `GET /api/assistant/thread/:sessionId`. Les
alertes antérieures à l’ajout des fils sont rattachées à la demande à partir du payload de la
notification (`ensureAssistantThread`).

Le matching produit ignore les termes génériques (`pack`, `entreprise`, `service`, `GPS`, etc.) pour
éviter les faux positifs. Une question de politique, de procédure ou de litige est escaladée sauf si
elle cite explicitement un modèle précis. L'historique n'est utilisé que pour les relances courtes
(« et pour une moto ? ») : une nouvelle question complète n'hérite pas du produit précédent.

Un cache mémoire de 60 s par `sessionId` + message évite de dupliquer une escalade. Le endpoint est
limité à 30 messages/minute.

### 2.5 Routage et proxy

- Routage côté client sans dépendance externe (`navigate()` + `pushState`).
- En développement, `vite.config.ts` redirige `/api` et `/socket.io` vers `http://127.0.0.1:4000`
  (`VITE_API_PROXY_TARGET`).
- En production, le reverse proxy applique la même redirection ; le frontend peut aussi être servi
  depuis un CDN si `/api` pointe vers l'API.

---

## 3. Backend

### 3.1 Couches

```text
routes.ts        déclaration HTTP + middlewares (auth, permissions, validation)
schemas.ts       schémas Zod (entrée)
service.ts       règles métier, transactions Prisma, journal d'audit
stateMachine.ts  transitions et garde-fous (pur, testé unitairement)
prisma           accès aux données
```

Les routes restent minces ; toute règle métier vit dans les services et la machine à états.

### 3.2 Modules

| Module | Responsabilités |
| --- | --- |
| `auth` | Connexion, rafraîchissement, déconnexion, mot de passe |
| `catalog` | Catégories, produits, services, stock, catalogue admin |
| `orders` | Création, scission GPS/boissons, transitions, affectations, notes, paiements |
| `payments` | Encaissements, tentatives Bictorys, webhooks idempotents |
| `tracking` | Suivi public, accès téléphone, messages client |
| `messaging` | Conversations et messages côté personnel |
| `quotes` | Demandes de devis |
| `admin` | Tableau de bord, utilisateurs, paiements, audit, notifications, paramètres |
| `staff` | Missions de l'intervenant connecté, notifications in-app, alertes et fils assistant des employés |
| `assistant` | Moteur de réponses catalogue, escalade, fils de discussion et notifications employés |
| `notifications` | Outbox WhatsApp et fournisseurs |
| `audit` | Journal des actions sensibles |
| `realtime` | Bus d'événements interne → Socket.IO |

### 3.3 Middlewares

| Middleware | Effet |
| --- | --- |
| `helmet` | En-têtes de sécurité (CSP désactivée car API pure) |
| `cors` | Origines autorisées, credentials, origines locales tolérées en développement |
| `express.json` | Corps JSON limité à 1 Mo, corps brut conservé pour les signatures |
| `cookie-parser` | Lecture du cookie de rafraîchissement |
| `pino-http` | Journalisation structurée |
| `requireAuth` | Vérifie le JWT d'accès et charge l'utilisateur |
| `requirePermission` | Vérifie une permission du rôle |
| `validate` | Valide corps / query / paramètres avec Zod |
| `apiLimiter` | 180 requêtes / minute / IP |
| `loginLimiter` | 10 échecs / 15 minutes |
| `trackingLimiter` | 30 consultations / minute |
| `trackingAccessLimiter` | 12 vérifications téléphoniques / 15 minutes |
| `checkoutLimiter` | 15 commandes / 10 minutes |
| `errorHandler` | Réponse JSON normalisée, sans fuite d'internes en production |

Pino envoie les logs techniques du serveur sur `stdout` et dans des fichiers JSON
quotidiens (`backend/logs/application-YYYY-MM-DD.log`, `/app/logs` dans Docker).
Ils sont distincts du journal d'audit métier (`AuditLog`), conservés 30 jours et
consultables via `GET /api/admin/technical-logs` uniquement par le rôle `ADMIN`
(informaticien). Le rôle `DIRECTOR` n'a pas la permission `technical-logs:read`.

---

## 4. Modèle de données

### 4.1 Entités principales

| Modèle | Rôle |
| --- | --- |
| `User` | Personnel (DIRECTOR, ADMIN informatique, EMPLOYEE, COMMERCIAL, TECHNICIAN, DELIVERY) |
| `RefreshSession` | Sessions de rafraîchissement révocables (hash du jeton) |
| `Category`, `Product`, `ProductImage` | Catalogue |
| `InventoryMovement` | Mouvements de stock |
| `OrderGroup` | Groupe reliant les commandes issues d'un même panier |
| `Order` | Commande opérationnelle (GPS ou boissons) |
| `OrderItem` | Ligne de commande avec instantané produit |
| `OrderStatusHistory` | Historique des changements de statut |
| `OrderNote` | Notes internes (jamais publiques) |
| `DeliveryAssignment` | Affectation technicien / livreur |
| `FulfillmentEvent` | Étapes opérationnelles (départ, arrivée, installation…) |
| `Payment` | Encaissement validé |
| `PaymentAttempt` | Tentative de paiement en ligne (Bictorys) |
| `PaymentWebhookEvent` | Événements webhook traités (idempotence) |
| `TrackingAccess` | Jetons d'accès à la conversation privée (hash) |
| `Conversation`, `ConversationParticipant`, `Message` | Messagerie par commande |
| `AssistantThread`, `AssistantThreadMessage` | Discussion publique de l’assistant reprise par un employé |
| `Notification` | Outbox WhatsApp et notifications in-app (dont alertes assistant) |
| `QuoteRequest` | Demandes de devis |
| `AuditLog` | Traçabilité des actions sensibles |
| `StoreSettings` | Paramètres modifiables (frais de livraison, etc.) |

### 4.2 Relations clés

```text
OrderGroup 1 ── n Order 1 ── n OrderItem
                     │
                     ├── n OrderStatusHistory
                     ├── n OrderNote
                     ├── n DeliveryAssignment n ── 1 User
                     ├── n FulfillmentEvent
                     ├── n Payment
                     ├── n PaymentAttempt
                     └── 1 Conversation n ── n Message

Order 1 ── n TrackingAccess
```

- `Order.groupId` relie les commandes d'un même panier.
- `Order.assignedToId` référence le chef d'équipe désigné lors de l'affectation.
- `Order.paidAmount` est dénormalisé pour les contrôles rapides ; `Payment` reste la source détaillée.
- `Order.total` et `OrderItem.unitPrice` sont en **entiers FCFA**.

### 4.3 Énumérations

| Enum | Valeurs |
| --- | --- |
| `OrderStatus` | `EN_ATTENTE_CONFIRMATION`, `COMMANDE_ACCEPTEE`, `COMMANDE_EN_PREPARATION`, `COMMANDE_EN_COURS_DE_LIVRAISON`, `LIVREE`, `ECHEC_LIVRAISON`, `REJETEE`, `ANNULEE` |
| `OperationalStatus` | Hérité, dérivé de `OrderStatus` ; ne pilote plus aucune décision |
| `PaymentStatus` | `NON_PAYE`, `PAIEMENT_EN_COURS`, `PARTIELLEMENT_PAYE`, `PAYE`, `ECHEC_PAIEMENT`, `REMBOURSE` |
| `PaymentMode` | `PAIEMENT_A_LA_LIVRAISON`, `PAIEMENT_EN_AGENCE`, `BICTORYS`, `AUTRE` |
| `FulfillmentMode` | `LIVRAISON`, `RETRAIT_AGENCE` |
| `AssignmentType` | `TECHNICIAN`, `DELIVERY` |
| `PaymentMethod` | `ESPECES`, `MOBILE_MONEY`, `CARTE_BANCAIRE`, `VIREMENT`, `BICTORYS`, `AUTRE` |
| `QuoteStatus` | `NOUVELLE`, `EN_COURS_DE_TRAITEMENT`, `DEVIS_ENVOYE`, `ACCEPTEE`, `REFUSEE`, `CLOTUREE` |
| `StaffRole` | `DIRECTOR`, `ADMIN` (informaticien), `EMPLOYEE`, `COMMERCIAL`, `TECHNICIAN`, `DELIVERY` |

---

## 5. Flux de commande

### 5.1 Création et scission

1. Le client compose un panier (GPS, boissons, services).
2. `POST /api/orders` valide les données et sépare les lignes :
   - articles `GPS` → commande GPS ;
   - articles `DRINK` → commande boissons ;
   - articles `SERVICE` à devis ne passent pas par la commande (demande de devis).
3. Un `OrderGroup` est créé avec une référence publique (`ATG-…`).
4. Chaque commande reçoit :
   - un numéro (`CMD-GPS-…` / `CMD-DRINK-…`) ;
   - un **code de suivi** aléatoire non devinable ;
   - un mode de réception (`LIVRAISON` ou `RETRAIT_AGENCE`) ;
   - un mode de paiement (`PAIEMENT_A_LA_LIVRAISON` ou `PAIEMENT_EN_AGENCE`) ;
   - un statut `EN_ATTENTE_CONFIRMATION`, paiement `NON_PAYE`.
5. Une conversation client est créée avec un message d'accueil.
6. Une notification WhatsApp est mise en file (simulée par défaut).

Le montant total est calculé **côté serveur** à partir du prix courant des produits ; aucun prix
fourni par le client n'est accepté.

### 5.2 Cycle de vie

```text
EN_ATTENTE_CONFIRMATION ──► COMMANDE_ACCEPTEE ──► COMMANDE_EN_PREPARATION ──► COMMANDE_EN_COURS_DE_LIVRAISON ──► LIVREE
        │                         │                              │
        ├──► REJETEE              ├──► LIVREE (retrait)          ├──► ANNULEE
        └──► ANNULEE              └──► ANNULEE                  └──► ECHEC_LIVRAISON (terminal)
```

Transitions autorisées : voir `backend/src/modules/orders/stateMachine.ts`. Les actions exposées à
l'utilisateur sont calculées côté serveur (`availableActions`) par
`backend/src/modules/orders/actions.ts` selon statut, mode de réception, rôle, permissions et
affectation. Le frontend ne recalcule jamais cette matrice.

`LIVREE` est atteint par « Valider la livraison » (livraison) ou « Confirmer le retrait » (retrait en
agence). La remise est horodatée (`fulfillmentCompletedAt`) et l'auteur conservé dans l'historique.

Le paiement intégral doit être enregistré avant la validation de la livraison ou du retrait : le
backend refuse la transition vers `LIVREE` tant que `paidAmount < total` (`409` avec le solde dû).
Un encaissement partiel reste possible pendant la préparation ou la course, mais ne permet pas de
clôturer. Une commande `LIVREE` issue d'un retrait est affichée « Retirée en agence ».

`ANNULEE` est refusée manuellement si un paiement a été encaissé (remboursement manuel requis).
L'expiration automatique d'un retrait à 72 h est idempotente et s'exécute côté serveur.

### 5.3 Affectation et course

L'affectation est réservée au statut `COMMANDE_ACCEPTEE` et aux rôles disposant d'`orders:assign`
(`DIRECTOR`, `COMMERCIAL`). Le backend déduit les rôles indispensables des données de la commande :
livreur pour une boisson ou un GPS sans assistance, technicien + livreur pour un GPS avec assistance
livré physiquement. Plusieurs intervenants peuvent être affectés ; un seul porte `isLead`.

La validation de l'affectation passe la commande en `COMMANDE_EN_PREPARATION`. Seul le chef
d'équipe actif peut « Démarrer la course » (`COMMANDE_EN_COURS_DE_LIVRAISON`) ; les autres
intervenants affectés en sont refusés. Ensuite, un intervenant affecté peut « Valider la livraison »
(`LIVREE`) ou « Déclarer un échec » (`ECHEC_LIVRAISON`, motif obligatoire).
Toutes les transitions sont contrôlées côté serveur avec mise à jour conditionnelle atomique
(`409` en cas de conflit, `403` si l'action n'est pas autorisée).

`operationalStatus` reste en base comme champ hérité dérivé ; aucune interface ne le pilote.

---

## 6. Authentification et permissions

### 6.1 Flux

1. `POST /api/auth/login` vérifie l'email et le mot de passe (bcrypt).
2. L'API renvoie un jeton d'accès (courte durée) et pose un cookie de rafraîchissement `httpOnly`
   ainsi que le marqueur `allo_session`.
3. Le jeton de rafraîchissement est stocké **haché** dans `RefreshSession` (rotation à chaque usage).
4. `POST /api/auth/logout` révoque la session et efface les cookies.
5. `POST /api/auth/change-password` révoque toutes les sessions et remet `mustChangePassword` à `false`.
6. `PATCH /api/auth/profile` laisse chaque membre modifier son prénom, son nom et son téléphone ;
   `name` (nom complet affiché partout) est recalculé côté serveur.

Lorsqu’un Directeur ou un informaticien autorisé crée un membre (`POST /api/admin/users`), il ne
fournit pas de mot de passe : l’API génère un mot de passe provisoire de 6 caractères, crée le compte avec
`mustChangePassword=true`, envoie les identifiants par email, puis journalise l’action. Si l’email
échoue, le compte est supprimé pour éviter un compte inaccessible. Le frontend bloque l’accès au
back-office et à l’espace intervenant tant que le mot de passe n’a pas été changé. Côté API, les
routes métier protégées par une permission répondent `403` tant que le jeton porte
`mustChangePassword=true` ; seules `/api/auth/me`, `/api/auth/change-password` et
`/api/auth/logout` restent accessibles. Les connexions Socket.IO sont également refusées tant que le
mot de passe provisoire n’a pas été changé.

### 6.2 Matrice des permissions

| Permission | DIRECTOR | ADMIN informatique | EMPLOYEE | COMMERCIAL | TECHNICIAN | DELIVERY |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `dashboard:read` | ✓ | | ✓ | ✓ | | |
| `catalog:read` | ✓ | | ✓ | ✓ | | |
| `catalog:write` | ✓ | | | | | |
| `orders:read` | ✓ | | ✓ | ✓ | | |
| `orders:confirm` | ✓ | | | ✓ | | |
| `orders:assign` | ✓ | | | ✓ | | |
| `orders:status` | ✓ | | | ✓ | | |
| `orders:note` | ✓ | | ✓ | ✓ | | |
| `orders:read:own` | | | | | ✓ | ✓ |
| `orders:update:own` | | | | | ✓ | ✓ |
| `payments:read` | ✓ | | ✓ | ✓ | | |
| `payments:record` | ✓ | | ✓ | ✓ | | |
| `quotes:read` | ✓ | | ✓ | ✓ | | |
| `quotes:write` | ✓ | | ✓ | ✓ | | |
| `users:manage` | ✓ | ✓ | | | | |
| `notifications:manage` | ✓ | | | | | |
| `audit:read` | ✓ | ✓ | | | | |
| `infrastructure:read` | ✓ | ✓ | | | | |
| `technical-logs:read` | | ✓ | | | | |
| `settings:write` | ✓ | | | | | |
| `conversations:read` | ✓ | | ✓ | ✓ | ✓ | ✓ |
| `conversations:write` | ✓ | | ✓ | ✓ | ✓ | ✓ |

Un technicien ou livreur ne peut lire/modifier que les commandes qui lui sont affectées
(`scopedWhere` dans le service commandes).

---

## 7. API HTTP

Toutes les réponses suivent le format `{ "data": … }` ou `{ "error": { code, message, details? } }`.

| Méthode | Chemin | Accès | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | public | Santé, environnement, fournisseurs |
| POST | `/api/auth/login` | public | Connexion personnel |
| POST | `/api/auth/refresh` | cookie | Nouveau jeton d'accès |
| POST | `/api/auth/logout` | cookie | Révocation |
| GET | `/api/auth/me` | authentifié | Profil courant |
| PATCH | `/api/auth/profile` | authentifié | Mise à jour de ses prénom, nom et téléphone |
| POST | `/api/auth/change-password` | authentifié | Changement de mot de passe |
| GET | `/api/categories` | public | Catégories |
| GET | `/api/products` | public | Produits (filtres type / catégorie) |
| GET | `/api/products/:id` | public | Fiche produit |
| GET | `/api/services` | public | Packs de services |
| POST | `/api/assistant` | public (limité) | Question à l'assistant, escalade éventuelle |
| GET | `/api/assistant/thread/:sessionId` | public | Fil de discussion et réponses employé d’une session |
| GET | `/api/admin/catalog/categories` | admin | Catégories (admin) |
| POST | `/api/admin/catalog/categories` | admin | Création |
| PATCH | `/api/admin/catalog/categories/:id` | admin | Mise à jour |
| GET | `/api/admin/catalog/products` | admin | Produits (admin) |
| POST | `/api/admin/catalog/products` | admin | Création |
| PATCH | `/api/admin/catalog/products/:id` | admin | Mise à jour |
| POST | `/api/admin/catalog/products/:id/stock` | admin | Mouvement de stock |
| POST | `/api/orders` | public (limité) | Création d'un groupe de commandes |
| GET | `/api/orders` | personnel | Liste filtrée et paginée |
| GET | `/api/orders/:id` | personnel | Détail complet |
| POST | `/api/orders/:id/confirm` | admin/employé | Confirmation |
| POST | `/api/orders/:id/cancel` | admin/employé | Annulation |
| PATCH | `/api/orders/:id/status` | admin/employé | Transition de statut |
| PATCH | `/api/orders/:id/operational-status` | affecté/admin | Avancement opérationnel |
| POST | `/api/orders/:id/assign` | admin/employé | Affectation |
| POST | `/api/orders/:id/notes` | admin/employé | Note interne |
| POST | `/api/orders/:id/payments` | admin/employé | Encaissement |
| GET | `/api/orders/:id/conversations` | personnel | Conversations de la commande |
| GET | `/api/conversations/:id/messages` | personnel | Messages |
| POST | `/api/conversations/:id/messages` | personnel | Envoi |
| GET | `/api/tracking/:code` | public | Suivi public |
| POST | `/api/tracking/:code/access` | public (limité) | Vérification téléphone |
| GET | `/api/tracking/:code/messages` | jeton de suivi | Conversation client |
| POST | `/api/tracking/:code/messages` | jeton de suivi | Message client |
| POST | `/api/quotes` | public (limité) | Demande de devis |
| GET | `/api/quotes` | admin/employé | Liste des devis |
| GET | `/api/quotes/:id` | admin/employé | Détail |
| PATCH | `/api/quotes/:id` | admin/employé | Mise à jour |
| POST | `/api/payments/bictorys/attempts` | admin/employé | Tentative de paiement |
| GET | `/api/payments/bictorys/attempts` | admin/employé | Historique |
| POST | `/api/payments/bictorys/webhook` | signature | Notification Bictorys |
| POST | `/api/payments/bictorys/mock/:ref/complete` | hors production | Simulation de paiement |
| GET | `/api/admin/dashboard` | admin/employé | Indicateurs |
| GET | `/api/admin/users` | admin | Personnel |
| POST | `/api/admin/users` | admin | Création sans mot de passe ; mot de passe provisoire envoyé par email |
| PATCH | `/api/admin/users/:id` | admin | Mise à jour |
| POST | `/api/admin/users/:id/reset-password` | admin | Réinitialisation ; changement forcé à la prochaine connexion |
| GET | `/api/admin/payments` | admin/employé | Paiements |
| GET | `/api/admin/audit` | admin | Journal d'audit |
| GET | `/api/admin/technical-logs` | ADMIN informatique | Logs techniques filtrables, conservés 30 jours |
| GET | `/api/admin/notifications` | admin | Outbox |
| GET | `/api/admin/notifications/mode` | admin | Fournisseur actif |
| POST | `/api/admin/notifications/process` | admin | Traitement manuel |
| POST | `/api/admin/notifications/:id/retry` | admin | Nouvelle tentative |
| GET | `/api/admin/settings` | admin | Paramètres |
| PUT | `/api/admin/settings/:key` | admin | Mise à jour |
| GET | `/api/staff/notifications` | personnel | Notifications in-app du compte (alertes, missions) |
| GET | `/api/staff/assistant-alerts` | admin/employé | Alertes assistant du compte |
| GET | `/api/staff/assistant-threads/:key` | admin/employé | Discussion assistant par id ou référence |
| POST | `/api/staff/assistant-threads/:key/messages` | admin/employé | Réponse employé au client |
| PATCH | `/api/staff/assistant-threads/:key` | admin/employé | État de la discussion (`OPEN`, `ANSWERED`, `RESOLVED`) |
| GET | `/api/staff/missions` | intervenant | Missions affectées |
| GET | `/api/staff/missions/:id` | intervenant | Détail d'une mission |
| GET | `/api/staff/members` | admin/employé | Intervenants affectables |

La référence complète et les schémas sont dans **Swagger** : `http://localhost:4000/api/docs`.

---

## 8. Sécurité du suivi

- Le code de suivi est généré aléatoirement (base non séquentielle, longueur suffisante) et **unique**.
- La réponse publique ne contient **ni** notes internes, **ni** paiements détaillés, **ni** données du personnel.
- L'accès à la conversation exige :
  1. le code de suivi ;
  2. le numéro de téléphone exact utilisé lors de la commande ;
  3. un jeton d'accès aléatoire, stocké **haché** (`sha256`) en base, avec expiration.
- Les tentatives sont limitées par IP ; les échecs ne révèlent pas si le numéro existe.
- Le numéro est normalisé et comparé via un hachage (`hashPhone`).

### 8.1 Notes vocales, images, vidéos et localisation

- Le chat accepte cinq types de messages : `TEXT`, `AUDIO`, `IMAGE`, `VIDEO` et `LOCATION`.
- Une note vocale est enregistrée côté navigateur (`MediaRecorder`, Opus 32 kbps), limitée à **120 s**,
  avec pause/reprise pendant l'enregistrement, puis envoyée en **data URL base64** (plafond serveur :
  4,5 Mo de chaîne).
- Les images sont redimensionnées et compressées côté navigateur (1600 px max, WebP/JPEG) avant envoi.
  Les vidéos sont limitées à **10 Mo** et envoyées en data URL (plafond serveur : 16 Mo de chaîne).
  Le corps JSON de l'API est limité à **20 Mo** pour absorber l'encodage base64.
- Une localisation envoie `latitude`, `longitude`, éventuellement `accuracy` (mètres) et `locationLabel`.
  La carte intégrée et le lien utilisent **Google Maps** (`maps.google.com` en mode `output=embed` et
  `google.com/maps?q=...`), sans clé API payante pour l’affichage de base.
- Les data URL audio, image et vidéo sont converties en **Blob URL** côté navigateur avant lecture ou
  affichage afin de garantir la lecture, la pause, la reprise et les performances sur mobile.
- Le serveur valide le type MIME, la durée, les bornes GPS et la taille avant toute écriture.
- **Limite assumée du prototype** : les fichiers sont stockés en base (`Message.audioData` et
  `Message.mediaData`). Une production à volume doit déporter ces fichiers vers un stockage objet
  (S3/MinIO) et ne conserver que l'URL et les métadonnées. Les champs sont isolés pour permettre cette
  migration sans changer l'API.
- Les messages `AUDIO`, `IMAGE`, `VIDEO` et `LOCATION` restent soumis aux mêmes règles de périmètre :
  conversation client ou interne, jamais de fuite d'une conversation interne vers le suivi public.

---

## 9. Notifications (outbox)

- Toute notification est d'abord **persistée** (`Notification`) avec un statut.
- Un traitement périodique (toutes les 30 s) ou manuel tente l'envoi.
- Le fournisseur `simulated` journalise et marque le statut de façon explicite : **aucun message réel**.
- Le fournisseur `http` envoie à une API configurée ; en cas d'échec, la notification reste en échec
  avec le motif, sans être présentée comme envoyée.

---

## 10. Configuration

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `NODE_ENV` | `development` | Environnement |
| `PORT` | `4000` | Port API |
| `PUBLIC_APP_URL` | `http://localhost:8443` | URL publique (liens) |
| `CORS_ORIGINS` | `http://localhost:8443` | Origines autorisées |
| `DATABASE_URL` | — | Connexion PostgreSQL |
| `JWT_ACCESS_SECRET` | — | Signature des jetons d'accès (32+) |
| `JWT_REFRESH_SECRET` | — | Signature des jetons de rafraîchissement (32+) |
| `JWT_ACCESS_TTL` | `1h` | Durée du jeton d'accès |
| `JWT_REFRESH_TTL_DAYS` | `7` | Durée du cookie |
| `BCRYPT_ROUNDS` | `12` | Coût du hachage |
| `DELIVERY_FEE_FCFA` | `0` | Frais de livraison par commande |
| `DELIVERY_CAN_RECORD_PAYMENT` | `false` | Réservé à une évolution |
| `TRACKING_ACCESS_TTL_HOURS` | `24` | Validité du jeton de suivi |
| `TRACKING_LOOKUP_MAX_ATTEMPTS` | `10` | Seuil de tentatives |
| `WHATSAPP_PROVIDER` | `simulated` | `simulated` ou `http` |
| `WHATSAPP_SIMULATION` | `true` | Marque la simulation |
| `EMAIL_PROVIDER` | `smtp` | `simulated` (logs), `smtp` (Gmail/port 465) ou `http` (envoi réel) |
| `EMAIL_FROM` | `Allo Togo Store <no-reply@allotogo.test>` | Expéditeur des emails HTTP |
| `EMAIL_API_URL` | — | Endpoint POST JSON du fournisseur email |
| `EMAIL_API_TOKEN` | — | Jeton Bearer du fournisseur email |
| `MAIL_HOST` | `smtp.gmail.com` | Serveur SMTP |
| `MAIL_PORT` | `465` | Port SMTP (TLS implicite) |
| `MAIL_USERNAME` | — | Compte SMTP |
| `MAIL_PASSWORD` | — | Mot de passe d’application SMTP (jamais celui du compte Gmail) |
| `MAIL_FROM` | — | Adresse expéditrice SMTP |
| `MAIL_FROM_NAME` | `Allo-Togo Shop` | Nom affiché de l’expéditeur |
| `BICTORYS_ENABLED` | `false` | Active le paiement en ligne |
| `BICTORYS_MODE` | `test` | `test` ou `production` |
| `BICTORYS_MOCK` | `false` | Fournisseur factice hors production |

Le détail figure dans `backend/.env.example`.

---

## 11. Tests

| Fichier | Contenu |
| --- | --- |
| `tests/unit/state-machine.test.ts` | Transitions, clôture, paiements |
| `tests/unit/permissions.test.ts` | Matrice des rôles |
| `tests/unit/ids.test.ts` | Codes, jetons, normalisation téléphone |
| `tests/integration/business-flows.test.ts` | Scénarios A à G de bout en bout |
| `tests/integration/assistant.test.ts` | Catalogue, relance, hors périmètre, escalade, fil de discussion, réponse employé, suivi |

- Base de test : schéma `allotogo_test`, créé et peuplé par `tests/globalSetup.ts`.
- Rate limiting désactivé en environnement de test.
- Aucun appel réseau externe (Bictorys mock, WhatsApp simulé, email simulé).

---

## 12. Déploiement

- **API** : image Node 22, `prisma migrate deploy` au démarrage, variables d'environnement injectées.
- **Email** : `EMAIL_PROVIDER=smtp` avec `MAIL_HOST` / `MAIL_PORT` / `MAIL_USERNAME` / `MAIL_PASSWORD`,
  ou `EMAIL_PROVIDER=http` avec `EMAIL_API_URL` / `EMAIL_API_TOKEN` ; le mode simulé est refusé en production.
- **Base** : PostgreSQL managé ou conteneur avec volume persistant et sauvegardes.
- **Frontend** : `pnpm build`, fichiers statiques servis par un CDN ou le reverse proxy.
- **Reverse proxy** : terminaison TLS, `/api` et `/socket.io` vers l'API, en-têtes de sécurité.
- **Observabilité** : journaux Pino, supervision de `/api/health`, alerte sur les webhooks en échec.
