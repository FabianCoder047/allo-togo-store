export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "API Allo Togo Store",
    version: "1.0.0",
    description:
      "API REST de la boutique Allo Togo : catalogue, commandes séparées GPS/boissons, suivi client, messagerie, paiements manuels et intégration Bictorys (adaptateur à finaliser).",
  },
  servers: [{ url: "/api", description: "API locale" }],
  tags: [
    { name: "Santé" },
    { name: "Authentification" },
    { name: "Catalogue" },
    { name: "Assistant" },
    { name: "Commandes" },
    { name: "Suivi client" },
    { name: "Messagerie" },
    { name: "Paiements" },
    { name: "Devis" },
    { name: "Administration" },
    { name: "Staff" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
      CartItem: {
        type: "object",
        required: ["productId", "quantity"],
        properties: {
          productId: { type: "string" },
          quantity: { type: "integer", minimum: 1, maximum: 99 },
        },
      },
      Checkout: {
        type: "object",
        required: ["customer", "fulfillmentMode", "items"],
        properties: {
          customer: {
            type: "object",
            required: ["name", "phone"],
            properties: {
              name: { type: "string" },
              phone: { type: "string" },
              whatsapp: { type: "string", nullable: true },
              email: { type: "string", nullable: true },
            },
          },
          fulfillmentMode: {
            type: "string",
            enum: ["LIVRAISON", "RETRAIT_AGENCE"],
          },
          delivery: {
            type: "object",
            properties: {
              zone: { type: "string" },
              address: { type: "string" },
              instructions: { type: "string" },
              contactPhone: { type: "string" },
              latitude: {
                type: "number",
                minimum: -90,
                maximum: 90,
                description:
                  "Latitude du point choisi sur Google Maps (obligatoire pour une livraison si aucun lien n’est fourni).",
              },
              longitude: {
                type: "number",
                minimum: -180,
                maximum: 180,
                description: "Longitude du point choisi sur Google Maps.",
              },
              mapUrl: {
                type: "string",
                description:
                  "Lien Google Maps partagé par le client. Obligatoire pour une livraison si les coordonnées ne sont pas fournies.",
              },
            },
          },
          requiresTechnician: { type: "boolean" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/CartItem" },
          },
        },
      },
      Payment: {
        type: "object",
        required: ["amount", "method"],
        properties: {
          amount: { type: "integer", minimum: 1 },
          method: {
            type: "string",
            enum: [
              "ESPECES",
              "FLOOZ",
              "MIXX_BY_YAS",
              "CARTE_BANCAIRE",
            ],
          },
          reference: { type: "string" },
          idempotencyKey: { type: "string" },
        },
      },
      ChatMessageInput: {
        type: "object",
        required: ["kind"],
        description:
          "TEXT exige « body ». AUDIO exige « audioData » (data URL base64, 4,5 Mo max) et « durationMs » (120 s max). IMAGE exige « mediaData » (data URL image, 4,5 Mo max). VIDEO exige « mediaData » (data URL vidéo, 12 Mo max) et accepte « durationMs » (300 s max). LOCATION exige « latitude » et « longitude ».",
        properties: {
          kind: {
            type: "string",
            enum: ["TEXT", "AUDIO", "LOCATION", "IMAGE", "VIDEO"],
          },
          body: {
            type: "string",
            maxLength: 4000,
            description:
              "Texte du message, ou libellé de secours pour un média.",
          },
          audioData: {
            type: "string",
            maxLength: 4_500_000,
            description:
              "Note vocale encodée en data URL (audio/webm, audio/ogg, audio/mp4…).",
          },
          mediaData: {
            type: "string",
            maxLength: 16_000_000,
            description: "Image ou vidéo encodée en data URL base64.",
          },
          mediaMimeType: {
            type: "string",
            maxLength: 100,
            description: "Type MIME du média, déduit de la data URL si absent.",
          },
          mediaName: { type: "string", maxLength: 180 },
          mediaSize: {
            type: "integer",
            minimum: 0,
            maximum: 20_000_000,
            description: "Taille du fichier en octets.",
          },
          durationMs: { type: "integer", minimum: 0, maximum: 300_000 },
          latitude: { type: "number", minimum: -90, maximum: 90 },
          longitude: { type: "number", minimum: -180, maximum: 180 },
          accuracy: {
            type: "number",
            minimum: 0,
            maximum: 100_000,
            description: "Précision GPS en mètres.",
          },
          locationLabel: { type: "string", maxLength: 200 },
        },
      },
      StaffUser: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          role: {
            type: "string",
            enum: [
              "DIRECTOR",
              "ADMIN",
              "EMPLOYEE",
              "COMMERCIAL",
              "TECHNICIAN",
              "DELIVERY",
            ],
            description: "DIRECTOR = directeur, ADMIN = informaticien.",
          },
          phone: { type: "string", nullable: true },
          active: { type: "boolean" },
          mustChangePassword: {
            type: "boolean",
            description:
              "Le membre doit changer son mot de passe provisoire avant d’accéder à son espace.",
          },
          lastLoginAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      StaffUserCreate: {
        type: "object",
        required: ["name", "email", "role"],
        description:
          "Aucun mot de passe n’est fourni. L’API génère un mot de passe provisoire de 6 caractères, l’envoie par email et force son changement à la première connexion.",
        properties: {
          name: { type: "string", minLength: 2, maxLength: 120 },
          email: { type: "string", format: "email", maxLength: 160 },
          role: {
            type: "string",
            enum: [
              "DIRECTOR",
              "ADMIN",
              "EMPLOYEE",
              "COMMERCIAL",
              "TECHNICIAN",
              "DELIVERY",
            ],
            description: "DIRECTOR = directeur, ADMIN = informaticien.",
          },
          phone: { type: "string", maxLength: 30, nullable: true },
        },
      },
      ChangePasswordInput: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: {
            type: "string",
            minLength: 6,
            maxLength: 200,
            description:
              "Mot de passe actuel, y compris le mot de passe provisoire de 6 caractères.",
          },
          newPassword: {
            type: "string",
            minLength: 12,
            maxLength: 200,
            description:
              "8 caractères minimum, avec majuscule, minuscule et chiffre.",
          },
        },
      },
      ResetPasswordInput: {
        type: "object",
        required: ["newPassword"],
        properties: {
          newPassword: {
            type: "string",
            minLength: 12,
            maxLength: 200,
            description:
              "8 caractères minimum, avec majuscule, minuscule et chiffre.",
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Santé"],
        summary: "État de l’API",
        responses: { "200": { description: "OK" } },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Authentification"],
        summary: "Connexion du personnel",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: {
                    type: "string",
                    minLength: 6,
                    maxLength: 200,
                    description:
                      "Le mot de passe provisoire de 6 caractères est accepté à la première connexion.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Jeton d’accès et cookie de rafraîchissement" },
          "401": { description: "Identifiants invalides" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Authentification"],
        summary: "Renouveler la session",
        responses: { "200": { description: "OK" } },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Authentification"],
        summary: "Révoquer la session",
        responses: { "204": { description: "Session révoquée" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Authentification"],
        security: [{ bearerAuth: [] }],
        summary: "Compte connecté",
        responses: {
          "200": { description: "OK" },
          "401": { description: "Non authentifié" },
        },
      },
    },
    "/auth/change-password": {
      post: {
        tags: ["Authentification"],
        security: [{ bearerAuth: [] }],
        summary:
          "Changer le mot de passe (obligatoire à la première connexion)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ChangePasswordInput" },
            },
          },
        },
        responses: {
          "204": {
            description:
              "Mot de passe modifié, sessions révoquées et cookies effacés",
          },
          "400": {
            description:
              "Mot de passe actuel invalide ou nouveau mot de passe trop faible",
          },
          "401": { description: "Non authentifié" },
        },
      },
    },
    "/categories": {
      get: {
        tags: ["Catalogue"],
        summary: "Catégories actives",
        responses: { "200": { description: "OK" } },
      },
    },
    "/assistant": {
      post: {
        tags: ["Assistant"],
        summary:
          "Question à l’assistant Allo Togo (catalogue, escalade employé, hors périmètre)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: { type: "string", maxLength: 1200 },
                  sessionId: { type: "string", maxLength: 80 },
                  history: {
                    type: "array",
                    maxItems: 10,
                    items: {
                      type: "object",
                      required: ["role", "text"],
                      properties: {
                        role: { type: "string", enum: ["client", "ai"] },
                        text: { type: "string", maxLength: 2000 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Réponse, clarification, refus hors périmètre ou escalade",
          },
          "429": { description: "Trop de messages" },
        },
      },
    },
    "/assistant/thread/{sessionId}": {
      get: {
        tags: ["Assistant"],
        summary:
          "Fil de discussion public d’une session cliente (reprise par un employé)",
        parameters: [
          {
            name: "sessionId",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 8, maxLength: 80 },
          },
        ],
        responses: {
          "200": {
            description: "Fil et messages, ou data=null si aucune escalade",
          },
        },
      },
    },
    "/staff/notifications": {
      get: {
        tags: ["Assistant", "Staff"],
        security: [{ bearerAuth: [] }],
        summary:
          "Notifications in-app du compte connecté (alertes assistant, missions)",
        responses: {
          "200": { description: "OK" },
          "401": { description: "Non authentifié" },
        },
      },
    },
    "/staff/assistant-alerts": {
      get: {
        tags: ["Assistant", "Staff"],
        security: [{ bearerAuth: [] }],
        summary:
          "Alertes assistant du compte DIRECTOR/EMPLOYEE/COMMERCIAL connecté",
        responses: {
          "200": { description: "OK" },
          "403": { description: "Rôle non autorisé" },
        },
      },
    },
    "/staff/assistant-threads/{key}": {
      get: {
        tags: ["Assistant", "Staff"],
        security: [{ bearerAuth: [] }],
        summary:
          "Lire une discussion assistant par identifiant ou référence d’alerte",
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string", maxLength: 120 },
          },
        ],
        responses: {
          "200": { description: "Fil et messages" },
          "403": { description: "Rôle non autorisé" },
          "404": { description: "Discussion introuvable" },
        },
      },
      patch: {
        tags: ["Assistant", "Staff"],
        security: [{ bearerAuth: [] }],
        summary: "Changer l’état d’une discussion assistant",
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string", maxLength: 120 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["status"],
                properties: {
                  status: {
                    type: "string",
                    enum: ["OPEN", "ANSWERED", "RESOLVED"],
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Discussion mise à jour" },
          "403": { description: "Rôle non autorisé" },
          "404": { description: "Discussion introuvable" },
        },
      },
    },
    "/staff/assistant-threads/{key}/messages": {
      post: {
        tags: ["Assistant", "Staff"],
        security: [{ bearerAuth: [] }],
        summary: "Répondre à un client dans une discussion assistant",
        parameters: [
          {
            name: "key",
            in: "path",
            required: true,
            schema: { type: "string", maxLength: 120 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: {
                  body: { type: "string", minLength: 1, maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Message employé créé et diffusé en temps réel",
          },
          "403": { description: "Rôle non autorisé" },
          "404": { description: "Discussion introuvable" },
        },
      },
    },
    "/products": {
      get: {
        tags: ["Catalogue"],
        summary: "Produits actifs",
        parameters: [
          {
            name: "type",
            in: "query",
            schema: { type: "string", enum: ["GPS", "DRINK", "SERVICE"] },
          },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/products/{id}": {
      get: {
        tags: ["Catalogue"],
        summary: "Fiche produit",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Introuvable" },
        },
      },
    },
    "/orders": {
      post: {
        tags: ["Commandes"],
        summary:
          "Créer une commande sans paiement (séparation automatique GPS/boissons)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Checkout" },
            },
          },
        },
        responses: {
          "201": { description: "Groupe et commandes créés" },
          "422": { description: "Produit non commandable" },
        },
      },
      get: {
        tags: ["Commandes"],
        security: [{ bearerAuth: [] }],
        summary: "Lister les commandes (périmètre selon le rôle)",
        responses: { "200": { description: "OK" } },
      },
    },
    "/orders/{id}": {
      get: {
        tags: ["Commandes"],
        security: [{ bearerAuth: [] }],
        summary: "Détail d’une commande",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "403": { description: "Hors périmètre" },
        },
      },
    },
    "/orders/{id}/confirm": {
      post: {
        tags: ["Commandes"],
        security: [{ bearerAuth: [] }],
        summary: "Confirmer après appel du client",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "Commande acceptée" } },
      },
    },
    "/orders/{id}/status": {
      patch: {
        tags: ["Commandes"],
        security: [{ bearerAuth: [] }],
        summary: "Mettre à jour le statut commercial",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "409": { description: "Transition interdite" },
        },
      },
    },
    "/orders/{id}/operational-status": {
      patch: {
        tags: ["Commandes"],
        security: [{ bearerAuth: [] }],
        summary: "Mettre à jour l’avancement opérationnel (technicien/livreur)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/orders/{id}/assign": {
      post: {
        tags: ["Commandes"],
        security: [{ bearerAuth: [] }],
        summary: "Affecter un technicien ou un livreur",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "201": { description: "Affectation créée" } },
      },
    },
    "/orders/{id}/payments": {
      post: {
        tags: ["Paiements"],
        security: [{ bearerAuth: [] }],
        summary: "Enregistrer un encaissement manuel",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Payment" },
            },
          },
        },
        responses: {
          "201": { description: "Paiement enregistré" },
          "409": { description: "Montant invalide ou déjà payé" },
        },
      },
    },
    "/tracking/{code}": {
      get: {
        tags: ["Suivi client"],
        summary: "Suivi public limité par code",
        parameters: [
          {
            name: "code",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Code inconnu" },
        },
      },
    },
    "/tracking/{code}/access": {
      post: {
        tags: ["Suivi client"],
        summary: "Vérifier le téléphone et obtenir un jeton de conversation",
        parameters: [
          {
            name: "code",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "201": { description: "Jeton temporaire" },
          "404": { description: "Code ou téléphone invalide" },
        },
      },
    },
    "/tracking/{code}/payment-choice": {
      post: {
        tags: ["Suivi client"],
        summary:
          "Choisir espèces ou déclarer un paiement mobile pour une livraison en cours",
        parameters: [
          {
            name: "code",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "token",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  {
                    type: "object",
                    required: ["choice"],
                    properties: {
                      choice: { type: "string", enum: ["ESPECES"] },
                    },
                  },
                  {
                    type: "object",
                    required: ["choice", "phone"],
                    properties: {
                      choice: { type: "string", enum: ["FLOOZ"] },
                      phone: {
                        type: "string",
                        pattern: "^(78|79|96|97|98|99)[0-9]{6}$",
                      },
                    },
                  },
                  {
                    type: "object",
                    required: ["choice", "phone"],
                    properties: {
                      choice: { type: "string", enum: ["MIXX_BY_YAS"] },
                      phone: {
                        type: "string",
                        pattern: "^(70|71|72|90|91|92|93)[0-9]{6}$",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "Choix enregistré; un paiement mobile est une déclaration client non vérifiée par opérateur",
          },
          "400": { description: "Commande hors livraison ou numéro invalide" },
          "401": { description: "Jeton invalide" },
        },
      },
    },
    "/tracking/{code}/messages": {
      get: {
        tags: ["Suivi client"],
        summary: "Messages visibles par le client",
        parameters: [
          {
            name: "code",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "token",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "401": { description: "Jeton invalide" },
        },
      },
      post: {
        tags: ["Suivi client"],
        summary: "Envoyer un message client (texte, note vocale ou position)",
        parameters: [
          {
            name: "code",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "token",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ChatMessageInput" },
            },
          },
        },
        responses: {
          "201": { description: "Message créé" },
          "400": { description: "Pièce jointe invalide" },
        },
      },
    },
    "/conversations/{id}/messages": {
      get: {
        tags: ["Messagerie"],
        security: [{ bearerAuth: [] }],
        summary: "Messages d’une conversation (périmètre staff)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "403": { description: "Hors périmètre" },
        },
      },
      post: {
        tags: ["Messagerie"],
        security: [{ bearerAuth: [] }],
        summary:
          "Répondre dans une conversation (texte, note vocale ou position)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ChatMessageInput" },
            },
          },
        },
        responses: {
          "201": { description: "Message créé" },
          "400": { description: "Pièce jointe invalide" },
        },
      },
    },
    "/quotes": {
      post: {
        tags: ["Devis"],
        summary: "Créer une demande de devis",
        responses: { "201": { description: "Référence de devis" } },
      },
      get: {
        tags: ["Devis"],
        security: [{ bearerAuth: [] }],
        summary: "Lister les demandes",
        responses: { "200": { description: "OK" } },
      },
    },
    "/payments/bictorys/attempts": {
      post: {
        tags: ["Paiements"],
        security: [{ bearerAuth: [] }],
        summary: "Créer une tentative Bictorys avant la clôture (si activé)",
        responses: {
          "201": { description: "Tentative créée" },
          "503": { description: "Bictorys désactivé" },
        },
      },
    },
    "/payments/bictorys/webhook": {
      post: {
        tags: ["Paiements"],
        summary: "Notification Bictorys (signature vérifiée)",
        responses: {
          "200": { description: "Traitée ou doublon" },
          "401": { description: "Signature invalide" },
        },
      },
    },
    "/admin/dashboard": {
      get: {
        tags: ["Administration"],
        security: [{ bearerAuth: [] }],
        summary: "Indicateurs et graphiques issus de la base",
        responses: { "200": { description: "OK" } },
      },
    },
    "/admin/audit": {
      get: {
        tags: ["Administration"],
        security: [{ bearerAuth: [] }],
        summary: "Journal d’audit complet (Directeur et informaticien)",
        parameters: [
          { name: "entity", in: "query", schema: { type: "string" } },
          { name: "action", in: "query", schema: { type: "string" } },
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1 },
          },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "403": { description: "Rôle non autorisé" },
        },
      },
    },
    "/admin/infrastructure": {
      get: {
        tags: ["Administration"],
        security: [{ bearerAuth: [] }],
        summary:
          "État technique, affluence du personnel, intégrations et dernières traces",
        responses: {
          "200": { description: "OK" },
          "403": { description: "Rôle non autorisé" },
        },
      },
    },
    "/admin/users": {
      get: {
        tags: ["Administration"],
        security: [{ bearerAuth: [] }],
        summary: "Comptes du personnel",
        responses: { "200": { description: "OK" } },
      },
      post: {
        tags: ["Administration"],
        security: [{ bearerAuth: [] }],
        summary:
          "Créer un compte sans mot de passe (identifiants envoyés par email)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StaffUserCreate" },
            },
          },
        },
        responses: {
          "201": {
            description:
              "Compte créé avec mustChangePassword=true et email envoyé",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/StaffUser" },
                  },
                },
              },
            },
          },
          "409": { description: "Un compte utilise déjà cette adresse email" },
          "503": { description: "Email non envoyé : le compte est annulé" },
        },
      },
    },
    "/admin/users/{id}/reset-password": {
      post: {
        tags: ["Administration"],
        security: [{ bearerAuth: [] }],
        summary:
          "Réinitialiser un mot de passe et forcer son changement à la prochaine connexion",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ResetPasswordInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Mot de passe réinitialisé, mustChangePassword=true",
          },
          "404": { description: "Compte introuvable" },
        },
      },
    },
    "/staff/missions": {
      get: {
        tags: ["Staff"],
        security: [{ bearerAuth: [] }],
        summary: "Missions attribuées au technicien ou livreur connecté",
        responses: { "200": { description: "OK" } },
      },
    },
  },
}
