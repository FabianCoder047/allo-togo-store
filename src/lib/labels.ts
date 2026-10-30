/**
 * Miroir frontend de `backend/src/modules/orders/stateMachine.ts`.
 * Un test de parité backend vérifie que les codes et libellés restent
 * strictement identiques : ne jamais réintroduire de statut ici sans l'ajouter
 * à la source de vérité backend.
 */
export const orderStatusLabels: Record<string, string> = {
  EN_ATTENTE_CONFIRMATION: "En attente de confirmation",
  COMMANDE_ACCEPTEE: "Commande acceptée",
  COMMANDE_EN_PREPARATION: "Commande en préparation",
  COMMANDE_EN_COURS_DE_LIVRAISON: "Commande en cours de livraison",
  LIVREE: "Livrée",
  ECHEC_LIVRAISON: "Échec de livraison",
  REJETEE: "Commande rejetée",
  ANNULEE: "Commande annulée",
}

/** Statuts terminaux : aucune action de transition ordinaire. */
export const terminalOrderStatuses = [
  "LIVREE",
  "ECHEC_LIVRAISON",
  "REJETEE",
  "ANNULEE",
]

/** Étapes uniques affichées dans la progression, par mode de réception. */
export const orderStatusSteps = (fulfillmentMode: string): string[] =>
  fulfillmentMode === "RETRAIT_AGENCE"
    ? ["EN_ATTENTE_CONFIRMATION", "COMMANDE_ACCEPTEE", "LIVREE"]
    : [
        "EN_ATTENTE_CONFIRMATION",
        "COMMANDE_ACCEPTEE",
        "COMMANDE_EN_PREPARATION",
        "COMMANDE_EN_COURS_DE_LIVRAISON",
        "LIVREE",
      ]

/** Libellé affiché : LIVREE + retrait agence => « Retirée en agence ». */
export const orderStatusLabel = (
  status: string,
  fulfillmentMode?: string,
): string => {
  if (status === "LIVREE" && fulfillmentMode === "RETRAIT_AGENCE")
    return "Retirée en agence"
  return orderStatusLabels[status] ?? status
}

export const operationalStatusLabels: Record<string, string> = {
  NON_DEMARRE: "Non démarré",
  EN_PREPARATION: "En préparation",
  PRET: "Prêt",
  DISPONIBLE_EN_AGENCE: "Disponible en agence",
  EN_COURS_DE_LIVRAISON: "En cours de livraison",
  INSTALLATION_EN_COURS: "Installation en cours",
  TERMINE: "Terminé",
  ECHEC: "Échec",
}

export const paymentStatusLabels: Record<string, string> = {
  NON_PAYE: "Non payé",
  PAIEMENT_EN_COURS: "Paiement en cours",
  PARTIELLEMENT_PAYE: "Partiellement payé",
  PAYE: "Payé",
  ECHEC_PAIEMENT: "Échec de paiement",
  REMBOURSE: "Remboursé",
}

export const paymentModeLabels: Record<string, string> = {
  PAIEMENT_A_LA_LIVRAISON: "Paiement à la livraison",
  PAIEMENT_EN_AGENCE: "Paiement en agence",
  BICTORYS: "Paiement en ligne (Bictorys)",
  AUTRE: "Autre",
}

export const paymentMethodLabels: Record<string, string> = {
  ESPECES: "Espèces",
  FLOOZ: "Flooz",
  MIXX_BY_YAS: "Mixx by Yas",
  CARTE_BANCAIRE: "Carte bancaire",
}

export const customerPaymentChoiceLabels: Record<string, string> = {
  ESPECES: "Espèces à la livraison",
  FLOOZ: "Flooz",
  MIXX_BY_YAS: "Mixx by Yas",
}

export const fulfillmentLabels: Record<string, string> = {
  LIVRAISON: "Livraison",
  RETRAIT_AGENCE: "Retrait en agence",
}

export const quoteStatusLabels: Record<string, string> = {
  NOUVELLE: "Nouvelle",
  EN_COURS_DE_TRAITEMENT: "En cours de traitement",
  DEVIS_ENVOYE: "Devis envoyé",
  ACCEPTEE: "Acceptée",
  REFUSEE: "Refusée",
  CLOTUREE: "Clôturée",
}

export const roleLabels: Record<string, string> = {
  DIRECTOR: "Directeur",
  ADMIN: "Informaticien",
  EMPLOYEE: "Employé",
  COMMERCIAL: "Agent commercial",
  TECHNICIAN: "Technicien",
  DELIVERY: "Livreur",
}

export const productTypeLabels: Record<string, string> = {
  GPS: "Traceur GPS",
  DRINK: "Boisson",
  SERVICE: "Service",
}

export const statusTone = (
  status: string,
): "live" | "draft" | "danger" | "info" | "neutral" => {
  if (
    [
      "LIVREE",
      "COMMANDE_ACCEPTEE",
      "TERMINE",
      "PAYE",
      "ACCEPTEE",
      "CLOTUREE",
    ].includes(status)
  )
    return "live"
  if (
    [
      "ANNULEE",
      "ECHEC_LIVRAISON",
      "ECHEC",
      "REJETEE",
      "REFUSEE",
      "REMBOURSE",
    ].includes(status)
  )
    return "danger"
  if (["EN_ATTENTE_CONFIRMATION", "NON_PAYE", "NOUVELLE"].includes(status))
    return "draft"
  if (
    [
      "COMMANDE_EN_PREPARATION",
      "COMMANDE_EN_COURS_DE_LIVRAISON",
      "INSTALLATION_EN_COURS",
      "DISPONIBLE_EN_AGENCE",
      "PARTIELLEMENT_PAYE",
      "EN_COURS_DE_TRAITEMENT",
      "DEVIS_ENVOYE",
    ].includes(status)
  )
    return "info"
  return "neutral"
}
