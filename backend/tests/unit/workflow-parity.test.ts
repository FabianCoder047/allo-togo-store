import { describe, expect, it } from "vitest"
import {
  ORDER_PROGRESS_STEPS,
  ORDER_STATUSES,
  TERMINAL_ORDER_STATUSES,
  orderStatusLabel as backendOrderStatusLabel,
  statusLabel as backendStatusLabel,
} from "../../src/modules/orders/stateMachine.js"
// @ts-ignore — fichier frontend hors du rootDir backend : Vitest le résout, tsc non.
import * as frontend from "../../../src/lib/labels"

/**
 * Garde-fou de parité : le frontend ne doit jamais réintroduire un statut,
 * un libellé ou une étape qui divergerait de la source de vérité backend.
 */
describe("Parité backend / frontend du workflow", () => {
  it("expose exactement les mêmes codes de statut, dans le même ordre", () => {
    expect(Object.keys(frontend.orderStatusLabels)).toEqual(ORDER_STATUSES)
  })

  it("affiche exactement les mêmes libellés", () => {
    for (const status of ORDER_STATUSES) {
      expect(frontend.orderStatusLabels[status]).toBe(
        backendStatusLabel[status],
      )
    }
  })

  it("affiche « Retirée en agence » pour une LIVREE issue d’un retrait", () => {
    expect(frontend.orderStatusLabel("LIVREE", "RETRAIT_AGENCE")).toBe(
      "Retirée en agence",
    )
    expect(frontend.orderStatusLabel("LIVREE", "RETRAIT_AGENCE")).toBe(
      backendOrderStatusLabel("LIVREE", "RETRAIT_AGENCE"),
    )
  })

  it("partage les mêmes étapes de progression par mode de réception", () => {
    expect(frontend.orderStatusSteps("LIVRAISON")).toEqual(
      ORDER_PROGRESS_STEPS.LIVRAISON,
    )
    expect(frontend.orderStatusSteps("RETRAIT_AGENCE")).toEqual(
      ORDER_PROGRESS_STEPS.RETRAIT_AGENCE,
    )
  })

  it("partage la même liste de statuts terminaux", () => {
    expect(frontend.terminalOrderStatuses).toEqual(TERMINAL_ORDER_STATUSES)
  })
})
