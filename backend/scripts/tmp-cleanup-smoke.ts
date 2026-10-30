import { PrismaClient } from "@prisma/client"

const databaseUrl = process.env.DATABASE_URL ?? ""
const prisma = new PrismaClient()

const main = async () => {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      `NODE_ENV=${process.env.NODE_ENV} : nettoyage interdit hors développement.`,
    )
  }
  if (
    !/localhost|127\.0\.0\.1/.test(databaseUrl) ||
    !databaseUrl.includes(":5433")
  ) {
    throw new Error(`Base non locale de développement : ${databaseUrl}`)
  }

  const orders = await prisma.order.findMany({
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerPhone: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  })
  const suspicious = orders.filter(
    (order) =>
      !order.customerName.startsWith("Smoke Test ") ||
      !order.customerPhone.startsWith("+228990"),
  )
  if (suspicious.length > 0) {
    throw new Error(
      `Commandes non identifiées comme données de test : ${suspicious
        .map(
          (order) =>
            `${order.orderNumber}/${order.customerName}/${order.customerPhone}`,
        )
        .join(", ")}`,
    )
  }

  const before = {
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    categories: await prisma.category.count(),
    settings: await prisma.storeSettings.count(),
    orders: orders.length,
    groups: await prisma.orderGroup.count(),
  }
  console.log(`Commandes de test à supprimer : ${orders.length}`)
  for (const order of orders)
    console.log(
      `- ${order.orderNumber} | ${order.status} | ${order.customerName}`,
    )

  const ids = orders.map((order) => order.id)
  await prisma.$transaction(async (tx) => {
    if (ids.length > 0) {
      await tx.payment.deleteMany({ where: { orderId: { in: ids } } })
      await tx.order.deleteMany({ where: { id: { in: ids } } })
    }
    await tx.orderGroup.deleteMany({})
  })

  const after = {
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    categories: await prisma.category.count(),
    settings: await prisma.storeSettings.count(),
    orders: await prisma.order.count(),
    groups: await prisma.orderGroup.count(),
    orderItems: await prisma.orderItem.count(),
    history: await prisma.orderStatusHistory.count(),
    assignments: await prisma.deliveryAssignment.count(),
    payments: await prisma.payment.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
    trackingAccess: await prisma.trackingAccess.count(),
  }
  console.log("AVANT", JSON.stringify(before))
  console.log("APRÈS", JSON.stringify(after))

  if (
    after.users !== before.users ||
    after.products !== before.products ||
    after.categories !== before.categories ||
    after.settings !== before.settings
  ) {
    throw new Error("Des données protégées ont été modifiées : arrêt immédiat.")
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
