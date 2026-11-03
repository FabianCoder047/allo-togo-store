import { jsPDF } from "jspdf"
import { fulfillmentLabels } from "./labels"
import { formatDate, formatPrice } from "./format"
import { orderItemDescription } from "./catalog"

export interface TrackingPdfOrder {
  orderNumber: string
  trackingCode: string
  categoryType: "GPS" | "DRINK"
  status: string
  statusLabel?: string
  fulfillmentMode: "LIVRAISON" | "RETRAIT_AGENCE"
  total: number
  items: Array<{
    productName: string
    quantity: number
    cartonCount: number
    cartonQuantity: number | null
    lineTotal: number
  }>
  timeline?: Array<{
    createdAt: string
    statusLabel: string
  }>
}

export function downloadTrackingPdf(
  orders: TrackingPdfOrder[],
  groupRef?: string,
  customerName?: string,
) {
  const doc = new jsPDF()

  orders.forEach((order, orderIndex) => {
    if (orderIndex > 0) doc.addPage()
    let y = 20
    const addLines = (text: string, size = 11, bold = false) => {
      doc.setFontSize(size)
      doc.setFont("helvetica", bold ? "bold" : "normal")
      const lines = doc.splitTextToSize(text, 180) as string[]
      for (const line of lines) {
        if (y > 280) {
          doc.addPage()
          y = 20
        }
        doc.text(line, 14, y)
        y += size >= 16 ? 12 : 8
      }
    }

    doc.setTextColor(30, 60, 110)
    addLines("Allo Togo - Suivi de commande", 18, true)
    doc.setTextColor(60, 60, 60)
    if (groupRef) addLines(`Référence du panier : ${groupRef}`)
    if (customerName) addLines(`Client : ${customerName}`)
    addLines(
      `${order.categoryType === "GPS" ? "Commande GPS" : "Commande boissons"} : ${order.orderNumber}`,
      14,
      true,
    )
    addLines(`Code de suivi : ${order.trackingCode}`, 14, true)
    addLines(`Statut : ${order.statusLabel ?? order.status}`)
    addLines(`Mode : ${fulfillmentLabels[order.fulfillmentMode]}`)
    y += 3
    addLines("Articles", 12, true)
    for (const item of order.items) {
      addLines(
        `${orderItemDescription(item)} - ${formatPrice(item.lineTotal)}`,
      )
    }
    addLines(`Total : ${formatPrice(order.total)}`, 12, true)

    if (order.timeline?.length) {
      y += 3
      addLines("Historique du suivi", 12, true)
      for (const entry of order.timeline) {
        addLines(`${formatDate(entry.createdAt)} - ${entry.statusLabel}`)
      }
    }
  })

  const filenameRef = (groupRef ?? orders[0]?.trackingCode ?? "commande")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase()
  doc.save(`allo-togo-suivi-${filenameRef}.pdf`)
}
