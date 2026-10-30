# Identifiants de la base de données — Allo Togo Store

Ce document définit chaque identifiant manipulé par l'application, sa génération, qui peut le voir, et la règle de non-fuite des identifiants internes vers le public.

## 1. Référentiel des identifiants

| Identifiant | Format / génération | Visibilité | Rôle | Table |
|---|---|---|---|---|
| `id` | `cuid()` (Prisma `@default(cuid())`) | **Interne uniquement** (serveur) | Clé primaire technique, jamais exposée au client public | Presque toutes (`User`, `Product`, `Order`, `OrderItem`, `AssistantThread`, …) |
| `orderNumber` | `CMD-<GPS|DRINK>-<JJMMAA>-<5 car. aléatoires>` (`backend/src/lib/ids.ts`) | Client (commande) + personnel | Référence lisible d'une opération commerciale | `Order` |
| `trackingCode` | 12 caractères alphanumériques aléatoires (alphabet sans caractères ambigus) (`generateTrackingCode`) | **Public** (suivi `/suivi/:code`) | Code de suivi, **non devinable**, ne révèle **pas** l'`id` interne | `Order` |
| `publicRef` / `groupRef` | `ATG-<JJMMAA>-<6 car. aléatoires>` (`generatePublicRef`) | Public (confirmation de groupe) | Référence de groupe liant les commandes d'un panier mixte | `OrderGroup` |
| `reference` (devis) | `DEV-<JJMMAA>-<5 car. aléatoires>` (`generateQuoteReference`) | Client + personnel | Référence d'une demande de devis | `QuoteRequest` |
| `sessionId` (assistant) | `crypto.randomUUID()` côté frontend | Client (fil de discussion) | Identifie le fil de conversation assistant/client | `AssistantThread.sessionId` |
| `refreshToken` | hash SHA-256 d'un token aléatoire | Interne (cookie httpOnly) | Session du personnel | `RefreshSession.tokenHash` |

## 2. Règle de non-fuite (règle R6 / doc.md)

L'identifiant interne `id` (clé primaire `cuid`) ne doit **jamais** être exposé :

- dans la réponse de suivi public (`/api/tracking/…`) — on y retourne `trackingCode`, `orderNumber`, `groupRef`, jamais l'`id` interne ;
- dans les réponses de l'assistant ou des suggestions ;
- dans les pièces jointes ou URLs partagées avec le client.

Le suivi public s'authentifie par `trackingCode` + vérification téléphonique (téléphone haché, jamais l'identifiant interne de commande).

## 3. Correspondance code ↔ base

- `src/types.ts` reflète les champs exposés (ex. `PublicTracking.trackingCode`, `OrderListRow.orderNumber`, `OrderGroupCreated.groupRef`).
- `backend/src/lib/ids.ts` centralise la génération : `generateTrackingCode`, `generateOrderNumber`, `generatePublicRef`, `generateQuoteReference`, `hashPhone`, `normalizePhone`.
- `backend/prisma/schema.prisma` définit les colonnes et les contraintes d'unicité (`@unique` sur `slug`, `sku`, `trackingCode`, `reference`, `email`, `tokenHash`).

## 4. Quand utiliser quel identifiant

| Situation | Identifiant à utiliser |
|---|---|
| Client consulte son suivi | `trackingCode` (public, non devinable) |
| Client référence sa commande auprès d'Allo Togo | `orderNumber` |
| Groupe de commandes (panier mixte) | `publicRef` / `groupRef` |
| Personnel manipule une commande en back-office | `id` (interne) + `orderNumber` |
| Assistant lie une conversation à une commande | `reference` ou `sessionId` |