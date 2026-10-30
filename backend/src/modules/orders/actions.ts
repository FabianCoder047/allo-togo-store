import type {
  FulfillmentMode,
  OrderStatus,
  ProductType,
  StaffRole,
} from "@prisma/client"
import { permissionsForRole, type Permission } from "../../lib/permissions.js"

/**
 * Matrice centralisée des actions d'une commande.
 *
 * Une action n'est proposée que si le statut, le mode de réception et les
 * permissions du rôle concordent. Le frontend consomme `availableActions`
 * renvoyé par l'API : il ne recalcule jamais la matrice de son côté.
 */
export type OrderAction = "confirm" | "reject" | "assign" | "start" | "deliver" | "fail" | "pickup" | "cancel"

type ActionRule = {
  label: string
  statuses: OrderStatus[]
  modes?: FulfillmentMode[]
  permissions: Permission[]
  /** L'utilisateur doit figurer parmi les intervenants actifs de la commande. */
  assignedOnly?: boolean
  /** L'utilisateur doit être le chef d'équipe actif de la commande. */
  leadOnly?: boolean
}

export const ORDER_ACTION_RULES: Record<OrderAction, ActionRule> = {
  confirm: {
    label: "Confirmer la commande",
    statuses: ["EN_ATTENTE_CONFIRMATION"],
    permissions: ["orders:confirm"],
  },
  reject: {
    label: "Rejeter la commande",
    statuses: ["EN_ATTENTE_CONFIRMATION"],
    permissions: ["orders:confirm"],
  },
  assign: {
    label: "Affecter les intervenants",
    statuses: ["COMMANDE_ACCEPTEE"],
    modes: ["LIVRAISON"],
    permissions: ["orders:assign"],
  },
  start: {
    label: "Démarrer la course",
    statuses: ["COMMANDE_EN_PREPARATION"],
    modes: ["LIVRAISON"],
    permissions: ["orders:update:own"],
    assignedOnly: true,
    leadOnly: true,
  },
  deliver: {
    label: "Valider la livraison",
    statuses: ["COMMANDE_EN_COURS_DE_LIVRAISON"],
    modes: ["LIVRAISON"],
    permissions: ["orders:update:own"],
    assignedOnly: true,
  },
  fail: {
    label: "Déclarer un échec de livraison",
    statuses: ["COMMANDE_EN_COURS_DE_LIVRAISON"],
    modes: ["LIVRAISON"],
    permissions: ["orders:update:own"],
    assignedOnly: true,
  },
  pickup: {
    label: "Confirmer le retrait",
    statuses: ["COMMANDE_ACCEPTEE"],
    modes: ["RETRAIT_AGENCE"],
    permissions: ["orders:pickup"],
  },
  cancel: {
    label: "Annuler la commande",
    statuses: [
      "EN_ATTENTE_CONFIRMATION",
      "COMMANDE_ACCEPTEE",
      "COMMANDE_EN_PREPARATION",
    ],
    permissions: ["orders:confirm"],
  },
}

/** Résumé minimal nécessaire pour décider des actions disponibles. */
export type OrderActionContext = {
  status: OrderStatus
  fulfillmentMode: FulfillmentMode
  assignments?: Array<{ staffId: string, active: boolean, isLead?: boolean }>
}

export type OrderActionUser = { id: string, role: StaffRole }

export const isAssignedToOrder = (order: OrderActionContext, userId: string) =>
  (order.assignments ?? []).some(
    (assignment) => assignment.active && assignment.staffId === userId,
  )

export const isLeadOfOrder = (order: OrderActionContext, userId: string) =>
  (order.assignments ?? []).some(
    (assignment) =>
      assignment.active &&
      assignment.isLead === true &&
      assignment.staffId === userId,
  )

/** Actions autorisées pour cet utilisateur sur cette commande. */
export const availableOrderActions = (
  order: OrderActionContext,
  user: OrderActionUser,
): OrderAction[] => {
  const permissions = permissionsForRole(user.role)
  return (Object.keys(ORDER_ACTION_RULES) as OrderAction[]).filter((action) => {
    const rule = ORDER_ACTION_RULES[action]
    if (!rule.statuses.includes(order.status)) return false
    if (rule.modes && !rule.modes.includes(order.fulfillmentMode)) return false
    if (rule.assignedOnly && !isAssignedToOrder(order, user.id)) return false
    if (rule.leadOnly && !isLeadOfOrder(order, user.id)) return false
    return rule.permissions.some((permission) =>
      permissions.includes(permission),
    )
  })
}

export const hasOrderAction = (
  order: OrderActionContext,
  user: OrderActionUser,
  action: OrderAction,
) => availableOrderActions(order, user).includes(action)

/**
 * Rôles indispensables dans une équipe d'affectation, déduits des données
 * réelles de la commande (type de produit + assistance + mode de réception).
 */
export const requiredAssignmentRoles = (order: {
  categoryType: ProductType
  requiresTechnician: boolean
  fulfillmentMode: FulfillmentMode
}): StaffRole[] => {
  const roles: StaffRole[] = []
  if (order.categoryType === "GPS" && order.requiresTechnician)
    roles.push("TECHNICIAN")
  // Une remise physique exige toujours un livreur, même lorsqu'un technicien
  // intervient pour l'installation : l'équipe doit être mixte.
  if (order.fulfillmentMode === "LIVRAISON") roles.push("DELIVERY")
  if (roles.length === 0) roles.push("DELIVERY")
  return roles
}

export const assignmentTypeForRole = (
  role: StaffRole,
): "TECHNICIAN" | "DELIVERY" =>
  role === "TECHNICIAN" ? "TECHNICIAN" : "DELIVERY"
