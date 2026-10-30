import type {
  FulfillmentMode,
  OperationalStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client"

/**
 * Source de vérité unique du workflow des commandes.
 *
 * Aucun autre module ne doit redéfinir la liste des statuts, leur libellé, leur
 * ordre d'affichage ou les transitions autorisées. Le backend s'appuie sur ce
 * fichier pour valider les actions ; le frontend reflète les mêmes codes et un
 * test de parité (`tests/unit/workflow-parity.test.ts`) garantit l'absence de
 * divergence avec `src/lib/labels.ts`.
 */
export const ORDER_STATUSES: OrderStatus[] = [
  "EN_ATTENTE_CONFIRMATION",
  "COMMANDE_ACCEPTEE",
  "COMMANDE_EN_PREPARATION",
  "COMMANDE_EN_COURS_DE_LIVRAISON",
  "LIVREE",
  "ECHEC_LIVRAISON",
  "REJETEE",
  "ANNULEE",
]

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  "LIVREE",
  "ECHEC_LIVRAISON",
  "REJETEE",
  "ANNULEE",
]

/**
 * Transitions commerciales autorisées. `LIVREE` depuis `COMMANDE_ACCEPTEE`
 * correspond exclusivement au retrait en agence (contrôlé par le mode).
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  EN_ATTENTE_CONFIRMATION: ["COMMANDE_ACCEPTEE", "REJETEE", "ANNULEE"],
  COMMANDE_ACCEPTEE: ["COMMANDE_EN_PREPARATION", "LIVREE", "ANNULEE"],
  COMMANDE_EN_PREPARATION: ["COMMANDE_EN_COURS_DE_LIVRAISON", "ANNULEE"],
  COMMANDE_EN_COURS_DE_LIVRAISON: ["LIVREE", "ECHEC_LIVRAISON"],
  LIVREE: [],
  ECHEC_LIVRAISON: [],
  REJETEE: [],
  ANNULEE: [],
}

/** Étapes affichées dans la barre de progression, par mode de réception. */
export const ORDER_PROGRESS_STEPS: Record<FulfillmentMode, OrderStatus[]> = {
  LIVRAISON: [
    "EN_ATTENTE_CONFIRMATION",
    "COMMANDE_ACCEPTEE",
    "COMMANDE_EN_PREPARATION",
    "COMMANDE_EN_COURS_DE_LIVRAISON",
    "LIVREE",
  ],
  RETRAIT_AGENCE: ["EN_ATTENTE_CONFIRMATION", "COMMANDE_ACCEPTEE", "LIVREE"],
}

export const orderProgressSteps = (mode: FulfillmentMode): OrderStatus[] =>
  ORDER_PROGRESS_STEPS[mode]

/** Délai légal de retrait en agence après acceptation de la commande. */
export const PICKUP_TIMEOUT_MS = 72 * 60 * 60 * 1000

export const PICKUP_EXPIRED_REASON =
  "Retrait non effectué dans le délai de 72 heures"

export const pickupDeadlineFrom = (confirmedAt: Date) =>
  new Date(confirmedAt.getTime() + PICKUP_TIMEOUT_MS)

export type OrderClosureContext = {
  status: OrderStatus
  fulfillmentMode: FulfillmentMode
  total: number
  paidAmount: number
  fulfillmentCompleted: boolean
}

/** Statuts pendant lesquels un encaissement peut précéder la clôture. */
export const PAYABLE_ORDER_STATUSES: OrderStatus[] = [
  "COMMANDE_ACCEPTEE",
  "COMMANDE_EN_PREPARATION",
  "COMMANDE_EN_COURS_DE_LIVRAISON",
]

export const isFullyPaid = (
  context: Pick<OrderClosureContext, "total" | "paidAmount">,
) => context.total > 0 && context.paidAmount >= context.total

export const computePaymentStatus = (
  total: number,
  paidAmount: number,
): PaymentStatus => {
  if (paidAmount <= 0) return "NON_PAYE"
  if (paidAmount >= total) return "PAYE"
  return "PARTIELLEMENT_PAYE"
}

export const remainingDue = (total: number, paidAmount: number) =>
  Math.max(0, total - paidAmount)

export const canCloseOrder = (context: OrderClosureContext) => {
  if (context.status === "ANNULEE")
    return {
      allowed: false,
      reason: "Une commande annulée ne peut pas être clôturée.",
    }
  if (context.status !== "LIVREE") {
    return {
      allowed: false,
      reason: "La livraison ou le retrait doit être confirmé avant la clôture.",
    }
  }
  if (!isFullyPaid(context)) {
    return {
      allowed: false,
      reason: "Le paiement intégral doit être enregistré avant la clôture.",
    }
  }
  if (!context.fulfillmentCompleted) {
    return {
      allowed: false,
      reason: "La remise effective doit être confirmée.",
    }
  }
  return { allowed: true, reason: null }
}

export const canTransitionStatus = (
  from: OrderStatus,
  to: OrderStatus,
  context: OrderClosureContext,
) => {
  if (from === to)
    return { allowed: false, reason: "Le statut est déjà celui demandé." }
  if (!ORDER_STATUS_TRANSITIONS[from].includes(to)) {
    return {
      allowed: false,
      reason: `Transition ${from} → ${to} non autorisée.`,
    }
  }
  if (to === "LIVREE" && !isFullyPaid(context)) {
    return {
      allowed: false,
      reason:
        "Le paiement intégral doit être enregistré avant de valider la livraison ou le retrait.",
    }
  }
  if (
    to === "LIVREE" &&
    from === "COMMANDE_ACCEPTEE" &&
    context.fulfillmentMode !== "RETRAIT_AGENCE"
  ) {
    return {
      allowed: false,
      reason:
        "Une commande en livraison doit passer par la préparation et la course avant d’être livrée.",
    }
  }
  if (
    to === "COMMANDE_EN_PREPARATION" &&
    context.fulfillmentMode !== "LIVRAISON"
  ) {
    return {
      allowed: false,
      reason: "Un retrait en agence ne passe pas par la préparation terrain.",
    }
  }
  if (to === "ANNULEE" && context.paidAmount > 0) {
    return {
      allowed: false,
      reason:
        "Un paiement a déjà été encaissé : une procédure de remboursement est requise avant annulation.",
    }
  }
  return { allowed: true, reason: null }
}

export const canRecordPayment = (context: {
  status: OrderStatus
  total: number
  paidAmount: number
  amount: number
  fulfillmentMode?: FulfillmentMode
  customerPaymentChoice?: "ESPECES" | "FLOOZ" | "MIXX_BY_YAS" | null
}) => {
  if (context.status === "ANNULEE") {
    return {
      allowed: false,
      reason: "Impossible d’encaisser un paiement sur une commande annulée.",
    }
  }
  const returnedCashHandover =
    context.status === "LIVREE" &&
    context.fulfillmentMode === "LIVRAISON" &&
    context.customerPaymentChoice === "ESPECES"
  if (
    !PAYABLE_ORDER_STATUSES.includes(context.status) &&
    !returnedCashHandover
  ) {
    return {
      allowed: false,
      reason:
        "Le paiement doit être enregistré avant la livraison, sauf espèces à régulariser au retour de l’équipe.",
    }
  }
  if (context.total <= 0) {
    return {
      allowed: false,
      reason:
        "Le montant de la commande doit être défini avant tout encaissement.",
    }
  }
  if (!Number.isSafeInteger(context.amount) || context.amount <= 0) {
    return {
      allowed: false,
      reason: "Le montant encaissé doit être un entier strictement positif.",
    }
  }
  if (context.paidAmount >= context.total) {
    return {
      allowed: false,
      reason: "La commande est déjà intégralement payée.",
    }
  }
  if (context.amount > remainingDue(context.total, context.paidAmount)) {
    return { allowed: false, reason: "Le montant dépasse le solde restant dû." }
  }
  return { allowed: true, reason: null }
}

export const isTerminalStatus = (status: OrderStatus) =>
  TERMINAL_ORDER_STATUSES.includes(status)

export const statusLabel: Record<OrderStatus, string> = {
  EN_ATTENTE_CONFIRMATION: "En attente de confirmation",
  COMMANDE_ACCEPTEE: "Commande acceptée",
  COMMANDE_EN_PREPARATION: "Commande en préparation",
  COMMANDE_EN_COURS_DE_LIVRAISON: "Commande en cours de livraison",
  LIVREE: "Livrée",
  ECHEC_LIVRAISON: "Échec de livraison",
  REJETEE: "Commande rejetée",
  ANNULEE: "Commande annulée",
}

/**
 * Libellé d'affichage : une commande `LIVREE` issue d'un retrait en agence est
 * présentée comme « Retirée en agence », sans inventer un statut séparé.
 */
export const orderStatusLabel = (
  status: OrderStatus,
  fulfillmentMode?: FulfillmentMode,
) => {
  if (status === "LIVREE" && fulfillmentMode === "RETRAIT_AGENCE")
    return "Retirée en agence"
  return statusLabel[status]
}

export const operationalLabel: Record<OperationalStatus, string> = {
  NON_DEMARRE: "Non démarré",
  EN_PREPARATION: "En préparation",
  PRET: "Prêt",
  DISPONIBLE_EN_AGENCE: "Disponible en agence",
  EN_COURS_DE_LIVRAISON: "En cours de livraison",
  INSTALLATION_EN_COURS: "Installation en cours",
  TERMINE: "Terminé",
  ECHEC: "Échec",
}

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  NON_PAYE: "Non payé",
  PAIEMENT_EN_COURS: "Paiement en cours",
  PARTIELLEMENT_PAYE: "Partiellement payé",
  PAYE: "Payé",
  ECHEC_PAIEMENT: "Échec de paiement",
  REMBOURSE: "Remboursé",
}
