# Intégration Bictorys

## 1. Statut actuel

| Élément | État |
| --- | --- |
| Modèle de données (tentatives, webhooks) | ✅ Implémenté |
| Encaissement manuel (espèces, mobile money, etc.) | ✅ Implémenté |
| Fournisseur **mock** de test | ✅ Implémenté (hors production uniquement) |
| Adaptateur **réel** Bictorys | ⛔ Volontairement non finalisé (`501 BICTORYS_NOT_CONFIGURED`) |
| Paiement en ligne activé par défaut | ❌ Non (`BICTORYS_ENABLED=false`) |

**Pourquoi l'adaptateur réel n'est pas finalisé :** la documentation officielle Bictorys
(URLs des endpoints, format d'authentification, algorithme et en-tête de signature, schéma exact
du webhook, statuts, devises et procédure de vérification serveur-à-serveur) n'a pas été fournie.
Aucun de ces éléments n'a été inventé. Le code isole donc l'intégration derrière une interface et
échoue explicitement au lieu de simuler un paiement.

> ⚠️ Aucune transaction mobile Flooz / Mixx by Yas n'est vérifiée par un opérateur pour le moment.
> Le suivi permet une déclaration client après contrôle du format du numéro; elle est explicitement
> journalisée comme déclaration et ne doit pas être confondue avec une confirmation opérateur.
> L'adaptateur Bictorys réel reste indisponible tant qu'il n'est pas configuré et validé.

---

## 2. Ce qui est déjà en place

### 2.1 Interface fournisseur

`backend/src/modules/payments/bictorys.ts`

```ts
export interface BictorysProvider {
  readonly name: string
  createAttempt(input: {
    orderId: string
    amount: number
    currency: string
    reference: string
  }): Promise<{ providerRef: string; checkoutUrl: string | null; status: 'PENDING' }>

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<BictorysWebhookEvent>

  verifyTransaction(providerRef: string): Promise<{
    status: string
    amount: number
    currency: string
  }>
}
```

Deux implémentations :

- `MockBictorysProvider` — local, sans réseau, réservé aux tests et au développement
  (`BICTORYS_MOCK=true` **et** `NODE_ENV !== 'production'`).
- `HttpBictorysProvider` — réel, qui renvoie `501 BICTORYS_NOT_CONFIGURED` sur chaque méthode.

### 2.2 Modèle de données

| Table | Rôle |
| --- | --- |
| `PaymentAttempt` | Tentative : commande, montant, référence fournisseur, URL de paiement, statut |
| `PaymentWebhookEvent` | Événement reçu, avec contrainte d'unicité `(provider, eventId)` |
| `Payment` | Encaissement validé, avec `idempotencyKey` unique |

Statuts de tentative : `PENDING`, `SUCCEEDED`, `FAILED`, `EXPIRED`, `CANCELLED`.

### 2.3 Règles métier déjà appliquées

- Paiement refusé si Bictorys n'est pas activé (`503 BICTORYS_DISABLED`).
- Paiement refusé sur commande annulée ou sur tout statut terminal.
- Paiement refusé si la commande est déjà soldée.
- **Paiement en ligne autorisé uniquement avant la clôture** : `COMMANDE_ACCEPTEE`,
  `COMMANDE_EN_PREPARATION` ou `COMMANDE_EN_COURS_DE_LIVRAISON`.
- Le montant est recalculé côté serveur (`total - paidAmount`), jamais fourni par le client.
- Une tentative `PENDING` existante pour le même solde est réutilisée.
- Le webhook vérifie le montant et la devise avant validation.
- Le traitement est **idempotent** : un `eventId` rejoué ne crée pas de second paiement.
- Un paiement réussi ne clôture jamais la commande : la livraison ou le retrait doit ensuite être
  validé par un intervenant habilité, une fois le solde entièrement réglé.

### 2.4 Endpoints

| Méthode | Chemin | Accès |
| --- | --- | --- |
| POST | `/api/payments/bictorys/attempts` | admin / employé |
| GET | `/api/payments/bictorys/attempts?orderId=…` | admin / employé |
| POST | `/api/payments/bictorys/webhook` | signature fournisseur |
| POST | `/api/payments/bictorys/mock/:providerRef/complete` | admin / employé, hors production, `BICTORYS_MOCK=true` |

---

## 3. Informations à obtenir de Bictorys

Pour finaliser l'intégration, il faut la documentation officielle et les éléments suivants :

1. **Environnement de test** : URL de base, identifiants (clé publique / clé secrète), comptes marchands.
2. **Création de paiement** : endpoint, méthode, format de requête, champs obligatoires
   (montant, devise, référence, URL de retour, URL de notification), format de réponse
   (identifiant de transaction, URL de paiement).
3. **Devise et montants** : code exact (`XOF` ?), unité (entier ou décimal), limites.
4. **Webhook** :
   - URL à déclarer ;
   - en-tête de signature exact ;
   - algorithme (HMAC-SHA256 ?), contenu signé (corps brut ? timestamp ?) ;
   - format du payload (identifiant d'événement, référence, statut, montant, devise) ;
   - statuts possibles et leur signification ;
   - politique de rejeu et de retry.
5. **Vérification serveur-à-serveur** : endpoint de consultation d'une transaction et son format.
6. **Remboursements** : endpoint, délais, statuts.
7. **Sécurité** : liste d'IP autorisées éventuelle, rotation des clés, TLS, bonnes pratiques.
8. **Procédure de mise en production** : validation, go-live, surveillance.

---

## 4. Configuration

```dotenv
BICTORYS_ENABLED=false          # true uniquement lorsque l'adaptateur réel est prêt
BICTORYS_MODE=test              # test | production
BICTORYS_BASE_URL=              # URL officielle de l'environnement de test
BICTORYS_API_KEY=
BICTORYS_SECRET_KEY=
BICTORYS_WEBHOOK_SECRET=
BICTORYS_SIGNATURE_HEADER=x-bictorys-signature
BICTORYS_MOCK=false             # true uniquement en développement / test
```

- **Ne jamais** versionner de clés réelles.
- `BICTORYS_MOCK=true` est ignoré en production.
- Sans `BICTORYS_ENABLED=true`, l'API refuse toute tentative avec `503`.

---

## 5. Tester le flux avec le fournisseur mock

Prérequis : `NODE_ENV=development`, `BICTORYS_ENABLED=true`, `BICTORYS_MOCK=true`, redémarrer l'API.

1. Créer une commande et la faire évoluer jusqu'à la remise effective
   (`operationalStatus = TERMINE`, `fulfillmentCompletedAt` renseigné).
2. Se connecter comme administrateur.
3. Créer une tentative :

```bash
curl -X POST http://localhost:4000/api/payments/bictorys/attempts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<ORDER_ID>"}'
```

4. Récupérer `providerRef` dans la réponse.
5. Simuler le succès :

```bash
curl -X POST http://localhost:4000/api/payments/bictorys/mock/<PROVIDER_REF>/complete \
  -H "Authorization: Bearer $TOKEN"
```

6. Vérifier que la commande est `PAYE` (et `LIVREE` si l'intervention était terminée).

Les tests automatisés couvrent déjà ce flux, y compris le rejeu de webhook sans double encaissement.

---

## 6. Sécurité attendue pour l'adaptateur réel

- Vérifier la **signature** sur le **corps brut** (déjà conservé dans `req.rawBody`), avec
  comparaison à temps constant.
- Refuser une signature absente, invalide ou expirée.
- Vérifier le **montant** et la **devise** contre la tentative enregistrée.
- Vérifier que la référence fournisseur correspond à une tentative connue.
- Rendre le traitement **idempotent** (déjà garanti par `(provider, eventId)` et `idempotencyKey`).
- Répondre rapidement `2xx` et traiter de façon atomique.
- Journaliser les rejets dans l'audit, sans exposer de secrets.
- Ne jamais faire confiance à un montant ou un statut fourni par le client.

---

## 7. Checklist de mise en service

- [ ] Documentation officielle Bictorys reçue et archivée
- [ ] Identifiants de test obtenus et stockés hors du dépôt
- [ ] `HttpBictorysProvider.createAttempt` implémenté selon l'API réelle
- [ ] `verifyWebhook` implémenté (signature + parsing)
- [ ] `verifyTransaction` implémenté
- [ ] Tests d'intégration ajoutés avec des fixtures officielles anonymisées
- [ ] URL de webhook déclarée et accessible en HTTPS
- [ ] Scénarios testés : succès, échec, expiration, montant incorrect, rejeu, annulation
- [ ] `BICTORYS_MOCK=false` et `BICTORYS_ENABLED=true` en production
- [ ] Supervision des webhooks et alertes en cas d'échec
- [ ] Procédure de remboursement documentée

---

## 8. Codes d'erreur liés

| Code | HTTP | Signification |
| --- | --- | --- |
| `BICTORYS_DISABLED` | 503 | Paiement en ligne non activé |
| `BICTORYS_NOT_CONFIGURED` | 501 | Adaptateur réel non finalisé |
| `INVALID_SIGNATURE` | 401 | Signature de webhook invalide |
| `CONFLICT` | 409 | Commande annulée, déjà payée ou sans solde |
| `BAD_REQUEST` | 400 | Montant incohérent ou corps brut manquant |
