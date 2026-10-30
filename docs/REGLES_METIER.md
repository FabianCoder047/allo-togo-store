# Règles métier

Ce document décrit le comportement attendu de la boutique Allo Togo Store.
Il fait référence aux scénarios de recette A à G couverts par
`backend/tests/integration/business-flows.test.ts`.

---

## 1. Principes généraux

| # | Règle |
| --- | --- |
| R1 | **Aucun paiement n'est demandé au moment de la commande.** Au démarrage d'une livraison, le client choisit dans son suivi protégé les espèces ou Flooz / Mixx by Yas. |
| R2 | **Aucun compte client** n'est créé. Le client suit sa commande avec un code et retrouve sa conversation en vérifiant son numéro de téléphone. |
| R3 | Un panier contenant des GPS et des boissons est **scindé en commandes indépendantes**, reliées par un groupe. |
| R4 | Le serveur est **seul autorisé** à calculer les prix, les totaux et les statuts. |
| R5 | Toute décision d'état est contrôlée par une machine à états et des permissions serveur. |
| R6 | Les notes internes, le numéro mobile et le détail des paiements ne sont **jamais** exposés publiquement. Le suivi révèle uniquement le statut de paiement et le choix du client. |
| R7 | Les montants sont des **entiers en FCFA**. |
| R8 | Un statut terminal interdit toute transition ultérieure. Une livraison choisie en espèces peut passer à `LIVREE` après validation sur place par le chef d'équipe; le commercial ou le directeur enregistre ensuite au bureau le montant remis par l'équipe. La commande reste non clôturée jusqu'au paiement intégral et chaque versement est horodaté et audité. Les autres livraisons et retraits restent soumis au paiement intégral avant remise. |
| R9 | La déclaration mobile du client est marquée comme payée après contrôle du numéro, mais n'est pas vérifiée par un opérateur; l'audit doit toujours l'identifier comme une déclaration client. |

---

## 2. Catalogue et commande

### 2.1 Produits commandables

Un produit peut être commandé en ligne si :

- il est actif et sa catégorie est active ;
- il est marqué `available` ;
- il n'est pas `quoteOnly` ;
- son type n'est pas `SERVICE` (les services passent par un devis) ;
- son prix est un entier strictement positif ;
- le stock est suffisant lorsqu'il est géré.

Messages d'erreur associés :

| Cas | Réponse |
| --- | --- |
| Produit supprimé / indisponible | `422` « Un ou plusieurs produits du panier ne sont plus disponibles. » |
| Produit désactivé | `422` « Le produit … n'est plus proposé. » |
| Produit sur devis ou indisponible | `422` « … n'est pas commandable en ligne. » |
| Service en pack | `422` « Les services en pack font l'objet d'une demande de devis… » |
| Prix non confirmé | `422` « Le prix du produit … doit être confirmé par Allo Togo. » |
| Stock insuffisant | `409` « Stock insuffisant pour … (n restant). » |

### 2.1.1 Gestion et affichage du catalogue

- Le back-office distingue deux sections : **Produits** (`GPS`, `DRINK`) et **Services** (`SERVICE`).
- Chaque fiche peut contenir jusqu’à 8 images et 8 vidéos téléversées depuis le poste de l’administrateur, une description et des caractéristiques libres. Formats acceptés : JPEG, GIF, PNG, WebP et AVIF (8 Mo par image), MP4, MOV et WebM (32 Mo par vidéo). Les fichiers sont persistés sur le volume `allotogo-uploads`.
- Le slug d’une fiche est généré par le serveur depuis son nom ; il n’est pas saisi dans le formulaire.
- Le prix actuel et le prix avant sont exprimés en FCFA ; le prix avant doit être supérieur au prix actuel.
- Les fiches peuvent définir jusqu’à 5 paliers de gros : quantité minimale, quantité maximale facultative (vide = illimité) et prix unitaire. Les paliers ne se chevauchent pas, sont triés par quantité croissante et leurs prix diminuent strictement. Le serveur applique le prix du palier correspondant à la quantité totale du produit dans la commande.
- Pour les boissons, le prix actuel est le prix de l’article et le prix du carton est un tarif distinct, affiché sur la fiche.
  Le panier reste libellé et calculé à l’article : le nombre d’unités par carton et le choix d’achat au carton ne sont pas
  définis par le modèle de catalogue.
- Les services n’ont ni quantité de stock ni gestion de stock.
- Une fiche non référencée par une commande ou un mouvement de stock peut être supprimée. Pour conserver l’historique, une fiche déjà référencée doit être désactivée plutôt que supprimée.

### 2.2 Scission GPS / boissons (scénario C)

1. Les lignes du panier sont fusionnées par produit (quantités additionnées).
2. Les produits sont regroupés par type : `GPS` et `DRINK`.
3. Un `OrderGroup` est créé avec une référence publique `ATG-AAAAMMJJ-XXXXXX`.
4. **Une commande par type présent** est créée :
   - `CMD-GPS-AAAAMMJJ-XXXXX` ;
   - `CMD-DRINK-AAAAMMJJ-XXXXX`.
5. Chaque commande possède :
   - son propre **code de suivi** ;
   - son propre **statut de commande** ;
   - son propre **statut opérationnel** ;
   - son propre **statut de paiement** ;
   - ses propres **affectations** et sa propre **conversation**.
6. Les commandes ne peuvent pas être fusionnées ni payées ensemble : chacune est encaissée séparément.

> Conséquence assumée : si des frais de livraison sont configurés (`DELIVERY_FEE_FCFA > 0`), ils sont
> appliqués **par commande opérationnelle**. Un panier mixte supporte donc deux fois ces frais.
> La valeur par défaut est `0`.

### 2.3 Modes de réception

| Mode | Conditions | Mode de paiement |
| --- | --- | --- |
| `LIVRAISON` | Zone **et** adresse obligatoires | `PAIEMENT_A_LA_LIVRAISON` |
| `RETRAIT_AGENCE` | Aucune adresse requise | `PAIEMENT_EN_AGENCE` |

Le mode de réception et le mode de paiement sont **deux champs distincts**.

### 2.4 Demande d'installation

`requiresTechnician` est une demande explicite du client. Elle n'est retenue que pour la commande GPS
(`requiresTechnician = type === 'GPS' && demande`). Elle guide l'affectation, sans garantir à elle seule
la clôture.

---

## 3. Les cinq dimensions d'état

| Dimension | Champ | Rôle |
| --- | --- | --- |
| Statut de commande | `status` | **Source de vérité unique** du workflow |
| Statut de paiement | `paymentStatus` | Encaissement, contrôlé avant la clôture |
| Mode de paiement | `paymentMode` | Comment le règlement est prévu |
| Choix client | `customerPaymentChoice` | Espèces, Flooz ou Mixx by Yas sélectionné au démarrage de la livraison |
| Mode de réception | `fulfillmentMode` | Livraison ou retrait en agence |

Le champ historique `operationalStatus` est conservé en base pour la compatibilité des anciennes
données, mais il est **dérivé** du statut de commande et n'entre plus dans aucune décision métier.

Ces dimensions évoluent séparément pendant la préparation. Une livraison choisie en espèces peut être
marquée `LIVREE` avec un solde dû; elle reste alors non clôturée jusqu'à l'enregistrement du montant
remis au bureau. Les autres remises exigent un paiement `PAYE`.

### 3.1 Statut de commande

| Valeur | Signification |
| --- | --- |
| `EN_ATTENTE_CONFIRMATION` | Commande reçue, à confirmer ou rejeter |
| `COMMANDE_ACCEPTEE` | Confirmée après contact client |
| `COMMANDE_EN_PREPARATION` | Affectation validée, préparation en cours |
| `COMMANDE_EN_COURS_DE_LIVRAISON` | Course démarrée par l'équipe affectée |
| `LIVREE` | Livrée, ou retirée en agence (libellé « Retirée en agence ») |
| `ECHEC_LIVRAISON` | Échec de livraison motivé |
| `REJETEE` | Rejetée après contact client, motif obligatoire |
| `ANNULEE` | Annulée (motif obligatoire) |

Statuts terminaux : `LIVREE`, `ECHEC_LIVRAISON`, `REJETEE`, `ANNULEE`.

Transitions autorisées :

```text
EN_ATTENTE_CONFIRMATION → COMMANDE_ACCEPTEE | REJETEE | ANNULEE
COMMANDE_ACCEPTEE       → COMMANDE_EN_PREPARATION (livraison) | LIVREE (retrait) | ANNULEE
COMMANDE_EN_PREPARATION → COMMANDE_EN_COURS_DE_LIVRAISON | ANNULEE
COMMANDE_EN_COURS_DE_LIVRAISON → LIVREE | ECHEC_LIVRAISON
LIVREE | ECHEC_LIVRAISON | REJETEE | ANNULEE → (aucune)
```

### 3.2 Statut opérationnel (hérité)

`operationalStatus` n'est plus piloté par l'interface. Il est recalculé automatiquement à partir du
statut de commande pour les besoins de compatibilité. **Ne jamais s'en servir pour décider d'une
action ou pour afficher la progression.** Chaque transition écrit un événement (`STARTED`,
`DELIVERED`, `FAILED`) et une entrée d'historique avec auteur, date et commentaire.

### 3.3 Statut de paiement

| Valeur | Signification |
| --- | --- |
| `NON_PAYE` | Aucun encaissement |
| `PAIEMENT_EN_COURS` | Tentative en ligne en cours |
| `PARTIELLEMENT_PAYE` | Encaissement partiel |
| `PAYE` | Total encaissé |
| `ECHEC_PAIEMENT` | Tentative échouée |
| `REMBOURSE` | Remboursement effectué |

Calcul automatique après chaque encaissement :

```text
paidAmount <= 0            → NON_PAYE
0 < paidAmount < total     → PARTIELLEMENT_PAYE
paidAmount >= total        → PAYE
```

---

## 4. Remise et clôture (scénarios A, B et E)

`LIVREE` est atteint uniquement par :

1. « Valider la livraison » depuis `COMMANDE_EN_COURS_DE_LIVRAISON` (livraison) ;
2. « Confirmer le retrait » depuis `COMMANDE_ACCEPTEE` (retrait en agence).

La remise effective est horodatée (`fulfillmentCompletedAt`) et l'auteur est enregistré dans
l'historique. Pour une livraison choisie en espèces, le chef d'équipe valide la remise même si le
paiement n'est pas encore enregistré; `closedAt` reste vide et la commande est visible comme livrée
non réglée. Le commercial ou le directeur saisit le montant remis par l'équipe après son retour. Cette
écriture crée le paiement, l'événement et l'audit dans la même transaction, avec auteur et date/heure
automatiques. Pour les autres modes de paiement et les retraits, le backend refuse une remise avec
solde restant.

Une commande au statut terminal (`LIVREE`, `ECHEC_LIVRAISON`, `REJETEE`, `ANNULEE`) ne peut plus
changer de statut. Un échec de livraison n'est jamais converti en livraison.

---

## 5. Paiements (scénarios A, B, E et F)

### 5.1 Règles d'encaissement

- Montant **entier strictement positif**, jamais supérieur au reste dû.
- Interdit sur une commande `ANNULEE` ou sur un statut terminal.
- Autorisé avant la clôture : `COMMANDE_ACCEPTEE`, `COMMANDE_EN_PREPARATION` et
  `COMMANDE_EN_COURS_DE_LIVRAISON`.
- Interdit si le total n'est pas défini (`total <= 0`).
- Chaque encaissement est enregistré (`Payment`) avec montant, moyen, référence et auteur.
- `paidAmount` est mis à jour de façon atomique ; `paymentStatus` est recalculé.
- Une clé d'idempotence facultative évite les doublons.

Moyens acceptés : `ESPECES`, `MOBILE_MONEY`, `CARTE_BANCAIRE`, `VIREMENT`, `BICTORYS`, `AUTRE`.

### 5.2 Encaissement partiel

Un paiement partiel est autorisé et fait passer la commande en `PARTIELLEMENT_PAYE`.
La commande ne peut pas être clôturée tant que le solde n'est pas réglé : la livraison ou le retrait
reste bloqué et le solde est visible dans le back-office.

### 5.3 Annulation et remboursement

- Annulation **refusée** si `paidAmount > 0` :
  « Un paiement a déjà été encaissé : une procédure de remboursement est requise avant annulation. »
- Le remboursement est une procédure **manuelle** (hors périmètre automatisé).

### 5.4 Paiement en ligne (Bictorys)

- Désactivé par défaut (`BICTORYS_ENABLED=false`).
- Une tentative ne peut être créée qu'avant la clôture (`COMMANDE_ACCEPTEE`,
  `COMMANDE_EN_PREPARATION`, `COMMANDE_EN_COURS_DE_LIVRAISON`).
- Une tentative crée un `PaymentAttempt` en attente ; le statut de paiement passe à `PAIEMENT_EN_COURS`.
- Le webhook est **idempotent** : un même `eventId` n'est traité qu'une fois.
- Le montant et la devise du webhook sont vérifiés avant validation.
- Le fournisseur réel renvoie `501 BICTORYS_NOT_CONFIGURED` tant que la documentation officielle
  n'est pas disponible (voir `docs/BICTORYS.md`).

---

## 6. Livraison, installation et retrait

### 6.1 Livraison

1. La commande est confirmée après contact client (Directeur ou agent commercial).
2. L'affectation n'est possible qu'au statut `COMMANDE_ACCEPTEE`, par le Directeur ou un agent
   commercial. Les besoins sont déduits des données réelles :
   - boisson → livreur ;
   - traceur GPS sans assistance → livreur ;
   - traceur GPS avec assistance technique → technicien **et** livreur si la remise est physique ;
   - panier mixte → combinaison des besoins de chaque commande.
   Plusieurs intervenants peuvent être sélectionnés ; **exactement un** chef d'équipe doit être
   désigné parmi eux.
3. La validation de l'affectation passe la commande en `COMMANDE_EN_PREPARATION`.
4. **Seul le chef d'équipe** démarre la course : la commande passe en
   `COMMANDE_EN_COURS_DE_LIVRAISON`. Les autres intervenants affectés et les utilisateurs
   non affectés sont refusés (`403`).
5. Lorsque la course démarre, le client vérifie son téléphone dans le suivi puis choisit espèces,
   Flooz ou Mixx by Yas. Le numéro mobile comporte huit chiffres; Flooz accepte les préfixes
   `78`, `79`, `96` à `99`, et Mixx by Yas `70` à `72` et `90` à `93`.
6. La déclaration mobile est enregistrée comme `MOBILE_MONEY` et marquée payée, mais aucune
   vérification d'opérateur n'est disponible pour le moment. Son audit est de type client et précise
   `CUSTOMER_DECLARATION`.
7. Pour le choix espèces, seul le chef d'équipe peut confirmer la remise sur place. À son retour,
   le commercial ou le directeur enregistre le montant remis; date, heure et auteur connecté sont
   automatiques. Les paiements partiels restent possibles, la clôture n'intervient qu'une fois le
   solde intégralement enregistré.
8. En cas d'échec, l'intervenant affecté déclare un échec avec **motif obligatoire** : `ECHEC_LIVRAISON`. La commande
   n'est jamais marquée livrée et aucun encaissement n'est requis pour déclarer l'échec.

### 6.2 Retrait en agence

1. La commande est confirmée après appel du client, ou refusée.
2. Elle reste `COMMANDE_ACCEPTEE` en attente du passage du client.
3. Aucune affectation ni préparation n'est possible pour ce mode.
4. Lorsque le client se présente, l'agence encaisse le solde puis clique « Confirmer le retrait » :
   la commande passe en `LIVREE` et s'affiche « Retirée en agence ». Le retrait est refusé (`409`)
   tant que le paiement intégral n'est pas enregistré.
5. Si elle n'est pas retirée dans les **72 heures** suivant la confirmation, le planificateur backend
   la passe automatiquement en `ANNULEE` avec le motif exact
   « Retrait non effectué dans le délai de 72 heures », restitue le stock et écrit une seule entrée
   d'historique (traitement idempotent, déclenché sans action utilisateur).

### 6.3 Échec

`ECHEC_LIVRAISON` est terminal et conserve l'historique, le motif et l'auteur. Aucun paiement n'est
perdu ; une nouvelle commande doit être créée pour une reprise.

---

## 7. Suivi public et confidentialité (scénario G)

### 7.1 Code de suivi

- Généré aléatoirement, **non séquentiel** et unique.
- Public : il permet de consulter l'avancement sans authentification.
- Non devinable : la probabilité de collision ou d'énumération est négligeable, et les consultations
  sont limitées par IP.

### 7.2 Données visibles publiquement

| Visible | Masqué |
| --- | --- |
| Numéro de commande, référence de groupe | Notes internes |
| Statut de commande et opérationnel | Détail des paiements |
| Articles, quantités, totaux | Identité et coordonnées du personnel |
| Historique public | Journal d'audit |
| Mode de réception, besoin d'installation | Instructions internes |

### 7.3 Accès à la conversation

Pour ouvrir la conversation, le client doit fournir **le numéro utilisé lors de la commande**
(téléphone ou WhatsApp). En cas de succès :

- un jeton aléatoire est émis, valable `TRACKING_ACCESS_TTL_HOURS` (24 h par défaut) ;
- seul son **hachage SHA-256** est stocké ;
- le jeton est conservé côté navigateur dans `sessionStorage` ;
- les tentatives sont limitées (12 / 15 min) et les échecs ne révèlent pas si le numéro existe.

### 7.4 Messagerie client

- Le client peut lire et écrire dans la conversation `CLIENT`.
- La conversation `INTERNAL` n'est **jamais** accessible publiquement.
- Les messages système (confirmation, changement de statut) sont identifiés comme tels.

---

## 8. Personnel et permissions (scénario G)

| Rôle | Portée |
| --- | --- |
| `DIRECTOR` (Directeur) | Gestion complète, y compris utilisateurs, paramètres, audit et infrastructure |
| `ADMIN` (Informaticien) | Gestion complète des comptes du personnel, infrastructure, affluence/PostHog, logs techniques et lecture du journal d’audit ; pas d’accès aux commandes, au catalogue ou aux paiements |
| `COMMERCIAL` | Commandes (confirmation, refus, affectation), devis, paiements, catalogue en lecture, conversations |
| `TECHNICIAN` | Uniquement les commandes affectées : avancement et conversation |
| `DELIVERY` | Uniquement les commandes affectées : avancement et conversation |

L'agent commercial et le Directeur reçoivent les nouvelles commandes à confirmer. Ils peuvent
confirmer la commande après appel du client, la rejeter avec un motif obligatoire, puis l'affecter
à un livreur et/ou à un technicien selon le produit et le besoin d'assistance technique. L'employé
d'accueil ne peut ni confirmer, ni rejeter, ni affecter ; il confirme le retrait en agence et
encaisse.

Règles complémentaires :

- Un technicien/livreur **ne peut pas** encaisser, affecter, annuler ou modifier le catalogue.
- Chaque membre, quel que soit son rôle, gère son propre profil via l'onglet **Paramètres** :
  prénom, nom, téléphone et mot de passe. Le Directeur et l’informaticien peuvent aussi gérer
  l'email professionnel des comptes depuis l'onglet **Personnel**.
- Un changement de mot de passe révoque toutes les sessions et impose une reconnexion.
- Un technicien ne peut pas accéder à une commande non affectée (réponse `403`).
- Les actions sensibles sont journalisées (`AuditLog`).
- Les notes internes sont réservées au Directeur, à l'agent commercial et aux employés.

---

## 9. Devis

- Les produits `quoteOnly` et les packs `SERVICE` ne sont pas commandables en ligne.
- Le client envoie une demande (`QuoteRequest`) avec coordonnées et besoin.
- Statuts : `NOUVELLE` → `EN_COURS_DE_TRAITEMENT` → `DEVIS_ENVOYE` → `ACCEPTEE` / `REFUSEE` → `CLOTUREE`.
- Aucune commande n'est créée automatiquement à l'acceptation : le conseiller saisit la commande.

---

## 10. Notifications

- Chaque événement utile (commande créée, statut changé, message) crée une notification en file.
- Les nouvelles commandes créent une notification interne pour les comptes `DIRECTOR` et `COMMERCIAL`
  (ainsi que les comptes habilités du back-office).
- Le fournisseur WhatsApp par défaut est **simulé** : aucun message réel n'est envoyé.
- Le statut en base distingue `PENDING`, `SENT`, `FAILED` ; un échec n'est jamais présenté comme un envoi.
- Les notifications en échec peuvent être relancées depuis le back-office.
- Les emails transactionnels (identifiants des comptes du personnel) passent par SMTP
  (`EMAIL_PROVIDER=smtp`, `MAIL_*`) ou par un fournisseur HTTP. Le mode simulé écrit le message dans
  les logs et reste interdit en production.

---

## 11. Cas limites et réponses attendues

| Situation | Comportement |
| --- | --- |
| Panier vide | `400` validation |
| Quantité 0 ou négative | `400` validation |
| Quantité > 99 | `400` validation |
| Plus de 50 lignes | `400` validation |
| Livraison sans zone ou adresse | `400` avec le champ concerné |
| Code de suivi inconnu | `404` sans détail |
| Téléphone incorrect | `403` générique, sans révéler l'existence |
| Message vide | `400` |
| Message > 4 000 caractères | `400` |
| Tentative de retrait sur commande non retirable | `403` ou `409` avec motif |
| Annulation après paiement | `409` avec motif |
| Accès technicien à une autre commande | `403` |
| Trop de tentatives | `429` |
| Webhook rejoué | `200` sans double encaissement |

---

## 12. Correspondance avec les scénarios de recette

| Scénario | Vérification automatisée |
| --- | --- |
| **A** — commande de traceur avec assistance | Parcours complet sans paiement à la commande, encaissement puis `LIVREE` |
| **B** — commande de boisson livrée | Confirmation, affectation d'un livreur, encaissement puis livraison |
| **C** — panier mixte | Deux commandes liées (GPS / boissons), deux codes, statuts et affectations indépendants |
| **D** — retrait en agence | Aucune affectation, encaissement puis retrait après acceptation, expiration automatique à 72 h |
| **E** — paiement obligatoire | Livraison refusée sans paiement intégral, acceptée une fois le solde réglé |
| **F** — paiement Bictorys (mock) | Succès, signature invalide, refus, rejeu idempotent, montant incorrect, référence inconnue, absence de preuve serveur |
| **G** — autorisations | Livreur sans accès catalogue, technicien limité à ses missions, client sans accès aux données d'une autre commande |
| **H** — parcours commercial | Notification de l'agent commercial, confirmation/refus, affectation multiple et désignation du chef d'équipe, expiration d'un retrait à 72 h |
