/**
 * Nettoyage des données de commande de l'environnement de développement local.
 * Sécurité : refuse de s'exécuter hors développement ou si une commande ne
 * ressemble pas à une commande de test. Ne supprime jamais utilisateurs,
 * produits, catégories ni paramètres.
 */
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.DATABASE_URL ?? ''
const prisma = new PrismaClient()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const main = async () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(`NODE_ENV=${process.env.NODE_ENV} : nettoyage interdit hors développement.`)
  }
  if (!/localhost|127\.0\.0\.1/.test(databaseUrl) || !databaseUrl.includes(':5433')) {
    throw new Error(`Base non locale de développement : ${databaseUrl}`)
  }

  const orders = await prisma.order.findMany({
    select: { id: true, orderNumber: true, customerName: true, customerPhone: true },
  })
  const testNames = new Set(['Client Test', 'Client Navigateur', 'Ama Koudjo'])
  const suspicious = orders.filter(
    (order) =>
      !testNames.has(order.customerName) ||
      !order.customerPhone.startsWith('+22890'),
  )
  if (suspicious.length > 0) {
    throw new Error(
      `Commandes non identifiées comme données de test : ${suspicious
        .map((order) => `${order.orderNumber}/${order.customerName}/${order.customerPhone}`)
        .join(', ')}`,
    )
  }

  const orderIds = orders.map((order) => order.id)
  console.log(`Commandes de test à supprimer : ${orders.length}`)
  for (const order of orders) {
    console.log(`- ${order.orderNumber} (${order.customerName}, ${order.customerPhone})`)
  }

  const before = {
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    categories: await prisma.category.count(),
    settings: await prisma.storeSettings.count(),
    orders: orders.length,
    groups: await prisma.orderGroup.count(),
  }

  await prisma.$transaction(async (tx) => {
    if (orderIds.length > 0) {
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } })
      await tx.order.deleteMany({ where: { id: { in: orderIds } } })
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

  console.log('AVANT', JSON.stringify(before))
  console.log('APRÈS', JSON.stringify(after))

  if (after.users !== before.users || after.products !== before.products || after.categories !== before.categories) {
    throw new Error('Des données protégées ont été modifiées : arrêt immédiat.')
  }

  // Le compte de démonstration commercial manquait dans cette base de dev
  // (seed antérieur à l'ajout du rôle). On le crée sans toucher au reste.
  const commercialEmail = 'commercial@allotogo.test'
  const existing = await prisma.user.findUnique({ where: { email: commercialEmail } })
  if (!existing) {
    await prisma.user.create({
      data: {
        name: 'Esi Agent Commercial',
        email: commercialEmail,
        passwordHash: await bcrypt.hash('CommercialAlloTogo!2026', 12),
        role: 'COMMERCIAL',
        active: true,
        phone: '+22890000000',
      },
    })
    console.log(`Compte de démonstration créé : ${commercialEmail}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await sleep(50)
    await prisma.$disconnect()
  })
