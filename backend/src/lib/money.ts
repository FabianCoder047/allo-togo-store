/**
 * Tous les montants sont stockés en entiers FCFA (le franc CFA n'a pas de
 * sous-unité utilisée dans la boutique). Aucun calcul financier ne doit
 * utiliser de nombre flottant.
 */
export const assertIntegerAmount = (value: number, label = "montant") => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} invalide : un entier positif ou nul est attendu.`)
  }
  return value
}

export const sumAmounts = (amounts: number[]) =>
  amounts.reduce((total, amount) => total + assertIntegerAmount(amount), 0)

export const computeLineTotal = (unitPrice: number, quantity: number) => {
  assertIntegerAmount(unitPrice, "prix unitaire")
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    throw new Error("quantité invalide")
  return unitPrice * quantity
}

export const computeOrderTotals = (
  lines: { unitPrice: number , quantity: number }[],
  deliveryFee = 0,
) => {
  const subtotal = sumAmounts(
    lines.map((line) => computeLineTotal(line.unitPrice, line.quantity)),
  )
  const fee = assertIntegerAmount(deliveryFee, "frais de livraison")
  return { subtotal, deliveryFee: fee, total: subtotal + fee }
}

export const formatFcfa = (amount: number) =>
  `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`
