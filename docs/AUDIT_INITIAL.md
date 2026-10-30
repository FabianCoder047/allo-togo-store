# Audit initial et décisions de mise en production

> Document historique. La règle de paiement a évolué : le paiement intégral est désormais exigé
> **avant** la validation de la livraison ou du retrait. Voir `REGLES_METIER.md` pour la règle
> courante.

## 1. Contexte

Le dépôt contenait une **maquette Figma Make** : une application React + Vite + Tailwind CSS
présentant la boutique Allo Togo Store (traceurs GPS, boissons, packs de services), avec un design
soigné mais **sans backend ni persistance**.

L'objectif était de conserver l'interface et de la transformer en application réellement exploitable :
commandes, séparation GPS / boissons, suivi, messagerie, back-office, espace intervenant, paiements
hors ligne, notifications et documentation.

Le cahier des charges fonctionnel de référence est `doc.md` (document Word d'origine). Les scénarios
de recette A à G qui y figurent sont couverts par les tests d'intégration.

---

## 2. État initial constaté

### 2.1 Frontend

| Constat | Impact |
| --- | --- |
| Catalogue alimenté par des données statiques (`src/data/demoCatalog.ts`) | Aucune commande réelle possible |
| Panier stocké localement sans création de commande | Aucune trace côté serveur |
| Chat flottant purement décoratif | Promesse de messagerie non tenue |
| Pages « succès », « suivi » et « admin » sans logique métier | Parcours incomplets |
| Aucune authentification | Pas de back-office ni d'espace intervenant |
| Aucune règle de statut ni de paiement | Impossible de piloter une commande |

### 2.2 Absences structurantes

- Aucune base de données, aucune API, aucun modèle de données.
- Aucune séparation entre commande GPS et commande boissons.
- Aucun code de suivi, aucun contrôle d'accès à la conversation.
- Aucune gestion des paiements, des affectations ou des permissions.
- Aucun test automatisé.
- Aucune documentation d'exploitation.

### 2.3 Points forts à préserver

- Direction artistique, typographie, palette et composants visuels.
- Structure des pages publiques et parcours d'achat.
- Responsive et accessibilité de base.
- Absence de dépendance à Bootstrap (contrainte respectée).

---

## 3. Exigences retenues

1. Conserver le frontend et son design ; ajouter un backend séparé.
2. **Aucun compte client, aucun mot de passe client.**
3. **Aucun paiement au moment de la commande** ; paiement après livraison / installation ou en agence.
4. **Séparation systématique** des articles GPS et boissons en commandes opérationnelles distinctes,
   reliées par un groupe de commandes.
5. Cinq dimensions distinctes : statut de commande, statut opérationnel, statut de paiement,
   mode de paiement, mode de réception.
6. `LIVREE` uniquement si l'intervention est terminée **et** le paiement intégral encaissé.
7. Code de suivi public mais **non devinable** ; conversation privée protégée par le téléphone.
8. Aucune note interne ni donnée de paiement exposée publiquement.
9. Intégration Bictorys isolée, sans inventer d'API ; documentation des prérequis manquants.
10. WhatsApp : file d'attente et fournisseur simulé par défaut ; ne jamais prétendre avoir envoyé.
11. Tests obligatoires pour les scénarios A à G.
12. Documentation en français et Swagger.

---

## 4. Décisions d'architecture

| Sujet | Décision | Justification |
| --- | --- | --- |
| Emplacement | Frontend à la racine, backend dans `backend/`, docs dans `docs/` | Préserve la structure et le déploiement Figma Make |
| Base de données | PostgreSQL + Prisma | Contraintes fortes, migrations, typage |
| Développement local | PostgreSQL embarqué (`embedded-postgres`, port 5433) | Aucune installation système, reproductible |
| Monnaie | Entiers en **FCFA** | Évite les erreurs de virgule flottante |
| Authentification | JWT d'accès court + cookie de rafraîchissement httpOnly | Pas de jeton en `localStorage` |
| Sessions | Table `RefreshSession` avec rotation / révocation | Déconnexion et révocation réelles |
| Autorisation | Permissions par rôle côté serveur | Le frontend ne décide jamais seul |
| Realtime | Socket.IO, salons par commande | Mise à jour du suivi et de la conversation |
| Paiement | Encaissement manuel + adaptateur Bictorys | Conforme au « paiement après livraison » |
| Notifications | Table outbox + fournisseur simulé | Traçabilité et honnêteté du statut |
| Tests | Vitest + Supertest, schéma `allotogo_test` | Isolation totale du schéma `public` |
| Frontend API | Base relative `/api`, proxy Vite | Même origine en production, pas de CORS |

---

## 5. Écarts corrigés

- Catalogue et fiches produit alimentés par l'API, avec états de chargement et d'erreur (aucune donnée
  de démonstration trompeuse).
- Panier persisté localement, puis **commande réellement créée** avec séparation GPS / boissons.
- Page de confirmation affichant la référence de groupe et **un code de suivi par commande**.
- Page de suivi publique avec historique, articles, paiements masqués et conversation protégée.
- Chat flottant transformé en **assistant local explicite** : la messagerie réelle vit dans le suivi,
  le back-office et l'espace intervenant.
- Back-office : tableau de bord, commandes, catalogue, devis, personnel, paramètres.
- Espace intervenant : missions affectées, avancement opérationnel, conversation, sans accès aux
  encaissements.
- Suivi temps réel via Socket.IO.

---

## 6. Risques et limites assumés

| Risque / limite | Statut |
| --- | --- |
| **Bictorys non finalisé** : documentation officielle absente | Adaptateur réel en `501 BICTORYS_NOT_CONFIGURED`, mock réservé aux tests |
| **WhatsApp simulé** par défaut | Aucun message réel ; statut explicite en base |
| Frais de livraison à 0 par défaut | Configurable via `DELIVERY_FEE_FCFA`, appliqué par commande opérationnelle |
| Pas de compte client | Voulu : suivi par code + téléphone |
| Pas de remboursement automatisé | Annulation bloquée si un paiement existe ; procédure manuelle |
| Pas de gestion de stock avancée | Mouvements de stock basiques, pas de réservation |
| Pas de facturation PDF | Hors périmètre initial |
| SMS / email non intégrés | WhatsApp est le canal prévu |
| Paiement carte réel | Dépend de Bictorys |

---

## 7. Vérifications effectuées

- `tsc --noEmit` et build de production du frontend : OK.
- Tests backend : **51 tests** (unitaires + intégration A–G, devis et outbox) : OK.
- Parcours navigateur vérifiés :
  - catalogue, fiche produit, panier, commande ;
  - confirmation avec deux codes de suivi ;
  - suivi public, vérification téléphone, envoi de message client ;
  - connexion administrateur, tableau de bord, détail de commande, confirmation, encaissement ;
  - connexion technicien, mission affectée, avancement opérationnel, réponse au client ;
  - masquage de l'encaissement pour les rôles non autorisés.

---

## 8. Recommandations avant mise en ligne

1. Fournir la documentation Bictorys et activer l'adaptateur réel avec des identifiants de test.
2. Brancher un fournisseur WhatsApp réel et désactiver la simulation.
3. Définir les frais de livraison et les zones réellement pratiqués.
4. Remplacer les comptes de démonstration, activer HTTPS et cookies `Secure`.
5. Mettre en place sauvegardes, supervision et alertes sur les webhooks en échec.
6. Valider juridiquement les CGV, la confidentialité et les mentions de paiement.
