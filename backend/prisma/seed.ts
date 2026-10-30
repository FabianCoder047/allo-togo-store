import { PrismaClient, type ProductType } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const prisma = new PrismaClient()

const hash = (password: string) => bcrypt.hash(password, 12)

// Users to create after cleanup (email = role@allotogo.test, password = RoleAlloTogo2026!, mustChangePassword=false)
const NEW_USERS = [
  { role: 'COMMERCIAL', email: 'commercial@allotogo.test', name: 'Agent Commercial' },
  { role: 'ADMIN', email: 'admin1@allotogo.test', name: 'Admin 1' },
  { role: 'ADMIN', email: 'admin2@allotogo.test', name: 'Admin 2' },
  { role: 'ADMIN', email: 'admin3@allotogo.test', name: 'Admin 3' },
  { role: 'ADMIN', email: 'admin4@allotogo.test', name: 'Admin 4' },
  { role: 'ADMIN', email: 'admin5@allotogo.test', name: 'Admin 5' },
  { role: 'TECHNICIAN', email: 'technicien1@allotogo.test', name: 'Technicien 1' },
  { role: 'TECHNICIAN', email: 'technicien2@allotogo.test', name: 'Technicien 2' },
  { role: 'TECHNICIAN', email: 'technicien3@allotogo.test', name: 'Technicien 3' },
  { role: 'DELIVERY', email: 'livreur1@allotogo.test', name: 'Livreur 1' },
  { role: 'DELIVERY', email: 'livreur2@allotogo.test', name: 'Livreur 2' },
  { role: 'DELIVERY', email: 'livreur3@allotogo.test', name: 'Livreur 3' },
  { role: 'DELIVERY', email: 'livreur4@allotogo.test', name: 'Livreur 4' },
  { role: 'DELIVERY', email: 'livreur5@allotogo.test', name: 'Livreur 5' },
  { role: 'DELIVERY', email: 'livreur6@allotogo.test', name: 'Livreur 6' },
  { role: 'DELIVERY', email: 'livreur7@allotogo.test', name: 'Livreur 7' },
  { role: 'DELIVERY', email: 'livreur8@allotogo.test', name: 'Livreur 8' },
  { role: 'DELIVERY', email: 'livreur9@allotogo.test', name: 'Livreur 9' },
  { role: 'DELIVERY', email: 'livreur10@allotogo.test', name: 'Livreur 10' },
]

async function deleteAllUsersExceptDirector() {
  const allUsers = await prisma.user.findMany()
  for (const user of allUsers) {
    if (user.email !== 'directeur@allotogo.test') {
      await prisma.user.delete({ where: { id: user.id } })
    }
  }
}

async function createNewUsers() {
  const password = 'RoleAlloTogo2026!'
  const passwordHash = await hash(password)
  for (const userData of NEW_USERS) {
    if (userData.email === 'directeur@allotogo.test') continue
    const [firstName, ...lastNameParts] = userData.name.split(' ')
    const lastName = lastNameParts.join(' ') || null
    await prisma.user.create({
      data: {
        email: userData.email,
        passwordHash,
        mustChangePassword: false,
        role: userData.role,
        active: true,
        firstName,
        lastName,
        name: userData.name,
      },
    })
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

// Execute cleanup and user creation at seed start
await deleteAllUsersExceptDirector()
await createNewUsers()
      connectivity: 'Réseau mobile à confirmer',
      tracking: 'Position et historique selon configuration',
      alerts: 'Options à confirmer',
      sim: 'Conditions SIM à confirmer',
      warranty: 'Durée à confirmer',
    },
    images: [
      {
        url: 'https://images.unsplash.com/photo-1708063784256-5db1d134fa70?auto=format&fit=crop&w=900&q=85',
        alt: 'Traceur GPS compact',
      },
    ],
  },
  {
    categorySlug: 'traceurs-gps',
    type: 'GPS',
    name: 'Traceur GPS Pro',
    slug: 'traceur-gps-pro',
    sku: 'GPS-PRO-02',
    shortDescription: 'Pensé pour les taxis et véhicules d’activité.',
    description:
      'Traceur GPS pour usage professionnel régulier. Il est destiné aux taxis, VTC et véhicules d’activité qui nécessitent un suivi fiable. L’installation accompagnée et le paramétrage sont validés avec l’équipe Allo Togo.',
    price: 49000,
    manageStock: true,
    stock: 15,
    specs: {
      idealFor: 'Taxi et véhicule professionnel',
      installation: 'Installation accompagnée',
      power: 'Alimentation véhicule à confirmer',
      connectivity: 'Réseau mobile à confirmer',
      tracking: 'Suivi adapté à un usage régulier',
      alerts: 'Paramétrage selon le modèle',
      sim: 'Forfait éventuel à confirmer',
      warranty: 'Durée à confirmer',
    },
    images: [
      {
        url: 'https://images.unsplash.com/photo-1621948535605-3742ebb4451b?auto=format&fit=crop&w=900&q=85',
        alt: 'Traceur GPS professionnel',
      },
    ],
  },
  {
    categorySlug: 'traceurs-gps',
    type: 'GPS',
    name: 'Solution GPS Moto',
    slug: 'solution-gps-moto',
    sku: 'GPS-MOTO-03',
    shortDescription: 'Une solution adaptée aux deux-roues et à leur mobilité.',
    description:
      'Solution de suivi conçue pour les motos et deux-roues. Le montage est adapté au véhicule et les conditions de suivi sont expliquées avant la commande.',
    price: 29000,
    manageStock: true,
    stock: 20,
    specs: {
      idealFor: 'Moto et deux-roues',
      installation: 'Montage adapté à la moto',
      power: 'Alimentation à confirmer',
      connectivity: 'Réseau mobile à confirmer',
      tracking: 'Consultation selon le service associé',
      alerts: 'Options à confirmer',
      sim: 'Conditions SIM à confirmer',
      warranty: 'Durée à confirmer',
    },
    images: [
      {
        url: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=85',
        alt: 'Solution GPS pour moto',
      },
    ],
  },
  {
    categorySlug: 'traceurs-gps',
    type: 'GPS',
    name: 'Pack GPS Flotte',
    slug: 'pack-gps-flotte',
    sku: 'GPS-FLOTTE-04',
    shortDescription: 'Une base claire pour équiper plusieurs véhicules.',
    description:
      'Offre destinée aux entreprises souhaitant équiper une flotte. Le nombre de véhicules, les modèles, le déploiement et les conditions tarifaires sont définis sur devis avec Allo Togo.',
    price: 0,
    quoteOnly: true,
    specs: {
      idealFor: 'Entreprise et flotte',
      installation: 'Déploiement planifié',
      power: 'Selon les véhicules',
      connectivity: 'À définir selon la flotte',
      tracking: 'Vue multi-véhicules à confirmer',
      alerts: 'Règles à définir avec le client',
      sim: 'Conditions sur devis',
      warranty: 'Selon les équipements retenus',
    },
    images: [
      {
        url: 'https://images.unsplash.com/photo-1515569067071-ec3b51335dd0?auto=format&fit=crop&w=900&q=85',
        alt: 'Flotte de véhicules équipés',
      },
    ],
  },
  {
    categorySlug: 'boissons',
    type: 'DRINK',
    name: 'Eau minérale — pack',
    slug: 'eau-minerale-pack',
    sku: 'BOIS-EAU-06',
    shortDescription: 'Format pratique pour le bureau, la maison et vos événements.',
    description: 'Pack de six bouteilles d’eau minérale. La marque et le format exact sont confirmés selon les stocks disponibles.',
    price: 3000,
    manageStock: true,
    stock: 80,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=900&q=85',
        alt: 'Pack d’eau minérale',
      },
    ],
  },
  {
    categorySlug: 'boissons',
    type: 'DRINK',
    name: 'Jus de fruits assortis',
    slug: 'jus-de-fruits-assortis',
    sku: 'BOIS-JUS-07',
    shortDescription: 'Un assortiment rafraîchissant à confirmer selon les stocks.',
    description: 'Sélection de jus de fruits en formats variés. Les parfums et marques sont confirmés avec l’équipe au moment de la préparation.',
    price: 6500,
    manageStock: true,
    stock: 40,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=85',
        alt: 'Jus de fruits assortis',
      },
    ],
  },
  {
    categorySlug: 'boissons',
    type: 'DRINK',
    name: 'Boissons gazeuses',
    slug: 'boissons-gazeuses',
    sku: 'BOIS-GAZ-08',
    shortDescription: 'Une sélection de formats pour réceptions et événements.',
    description: 'Pack de boissons gazeuses adapté aux réceptions et événements. La composition est ajustée selon les volumes demandés.',
    price: 8500,
    manageStock: true,
    stock: 35,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85',
        alt: 'Boissons gazeuses',
      },
    ],
  },
  {
    categorySlug: 'boissons',
    type: 'DRINK',
    name: 'Pack fraîcheur entreprise',
    slug: 'pack-fraicheur-entreprise',
    sku: 'BOIS-ENT-09',
    shortDescription: 'Une composition adaptée à vos volumes et à votre équipe.',
    description: 'Offre sur devis pour les entreprises qui souhaitent un approvisionnement régulier en boissons. Les volumes, formats et fréquences sont définis avec Allo Togo.',
    price: 0,
    quoteOnly: true,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1527960471264-932f39eb5846?auto=format&fit=crop&w=900&q=85',
        alt: 'Boissons pour entreprise',
      },
    ],
  },
  {
    categorySlug: 'services-packs',
    type: 'SERVICE',
    name: 'Technologie & IA',
    slug: 'technologie-ia',
    sku: 'SERV-TECH-10',
    shortDescription: 'Solutions numériques, automatisation et accompagnement.',
    description:
      'Pack de services pour les entreprises et porteurs de projet : analyse du besoin, cadrage de la solution numérique, automatisation et accompagnement. Le périmètre et le tarif sont établis sur devis.',
    price: 0,
    quoteOnly: true,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=900&q=85',
        alt: 'Technologie et intelligence artificielle',
      },
    ],
  },
  {
    categorySlug: 'services-packs',
    type: 'SERVICE',
    name: 'Conciergerie & assistance',
    slug: 'conciergerie-assistance',
    sku: 'SERV-CONC-11',
    shortDescription: 'Un appui fiable pour simplifier votre quotidien.',
    description:
      'Pack de conciergerie et d’assistance pour les particuliers et professionnels. Les prestations incluses sont définies lors de la demande de devis.',
    price: 0,
    quoteOnly: true,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=85',
        alt: 'Service de conciergerie',
      },
    ],
  },
  {
    categorySlug: 'services-packs',
    type: 'SERVICE',
    name: 'Consulting & entreprises',
    slug: 'consulting-entreprises',
    sku: 'SERV-CONS-12',
    shortDescription: 'Conseil, structuration et développement d’activité.',
    description:
      'Accompagnement des entrepreneurs et PME : diagnostic, structuration, conseil opérationnel et développement d’activité. Devis après échange sur le besoin.',
    price: 0,
    quoteOnly: true,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=85',
        alt: 'Consulting en entreprise',
      },
    ],
  },
  {
    categorySlug: 'services-packs',
    type: 'SERVICE',
    name: 'Livraison & logistique',
    slug: 'livraison-logistique',
    sku: 'SERV-LOG-13',
    shortDescription: 'Organisation, transport et suivi de vos besoins.',
    description:
      'Pack logistique pour les commerces et entreprises : organisation des tournées, transport et suivi des livraisons. Le périmètre est confirmé sur devis.',
    price: 0,
    quoteOnly: true,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=900&q=85',
        alt: 'Logistique et livraison',
      },
    ],
  },
  {
    categorySlug: 'services-packs',
    type: 'SERVICE',
    name: 'Événementiel',
    slug: 'evenementiel',
    sku: 'SERV-EVEN-14',
    shortDescription: 'Organisation et coordination de vos événements.',
    description:
      'Organisation et coordination d’événements pour particuliers et organisations. Les prestations, le calendrier et le budget sont précisés après échange.',
    price: 0,
    quoteOnly: true,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=900&q=85',
        alt: 'Organisation d’événement',
      },
    ],
  },
  {
    categorySlug: 'services-packs',
    type: 'SERVICE',
    name: 'Administration & secrétariat',
    slug: 'administration-secretariat',
    sku: 'SERV-ADMIN-15',
    shortDescription: 'Appui documentaire et assistance administrative.',
    description:
      'Pack d’appui administratif pour les professionnels et associations : gestion documentaire, secrétariat et assistance ponctuelle. Devis selon le volume.',
    price: 0,
    quoteOnly: true,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=85',
        alt: 'Administration et secrétariat',
      },
    ],
  },
]

const seedAdmin = async () => {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@allotogo.test').toLowerCase()
  const name = process.env.SEED_ADMIN_NAME ?? 'Directeur Allo Togo'
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role !== 'DIRECTOR') {
      throw new Error(`Le compte ${email} existe déjà avec le rôle ${existing.role}, attendu DIRECTOR.`)
    }
    console.log(`Directeur déjà présent : ${email}`)
    return existing
  }

  let password = process.env.SEED_ADMIN_PASSWORD
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.SEED_ADMIN_EMAIL || !password)
  ) {
    throw new Error('SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD sont obligatoires en production.')
  }
  if (!password) {
    password = `Admin-${randomBytes(6).toString('base64url')}!`
    console.log(`Mot de passe directeur généré : ${password}`)
  }
  const director = await prisma.user.create({
    data: { name, email, passwordHash: await hash(password), role: 'DIRECTOR', active: true },
  })
  console.log(`Directeur créé : ${email}`)
  return director
}

const seedItAdmin = async () => {
  const email = (process.env.SEED_IT_ADMIN_EMAIL ?? 'it@allotogo.test').toLowerCase().trim()
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role !== 'ADMIN') {
      throw new Error(`Le compte ${email} existe déjà avec le rôle ${existing.role}, attendu ADMIN.`)
    }
    console.log(`Informaticien déjà présent : ${email}`)
    return existing
  }
  let password = process.env.SEED_IT_ADMIN_PASSWORD
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.SEED_IT_ADMIN_EMAIL || !password)
  ) {
    throw new Error('SEED_IT_ADMIN_EMAIL et SEED_IT_ADMIN_PASSWORD sont obligatoires en production.')
  }
  if (!password) {
    password = 'InfoAlloTogo!2026'
  }
  const name = process.env.SEED_IT_ADMIN_NAME ?? 'Yaovi Informaticien'
  const itAdmin = await prisma.user.create({
    data: { name, email, passwordHash: await hash(password), role: 'ADMIN', active: true },
  })
  console.log(`Compte informaticien initial créé : ${email}`)
  return itAdmin
}

const seedStaff = async () => {
  if (process.env.SEED_DEMO_STAFF !== 'true') return
  const accounts = [
    { name: 'Esi Agent Commercial', email: 'commercial@allotogo.test', role: 'COMMERCIAL' as const, password: 'CommercialAlloTogo!2026' },
    { name: 'Kossi Technicien', email: 'technicien@allotogo.test', role: 'TECHNICIAN' as const, password: 'TechnicienAlloTogo!2026' },
    { name: 'Akua Livreuse', email: 'livreur@allotogo.test', role: 'DELIVERY' as const, password: 'LivreurAlloTogo!2026' },
  ]
  for (const account of accounts) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } })
    if (existing) continue
    await prisma.user.create({
      data: {
        name: account.name,
        email: account.email,
        passwordHash: await hash(account.password),
        role: account.role,
        active: true,
        phone: '+22890000000',
      },
    })
    console.log(`Compte de démonstration créé : ${account.email}`)
  }
}

const BOOTSTRAP_MARKER = 'system.bootstrap.completed'

const main = async () => {
  const bootstrap = process.argv.includes('--bootstrap')
  if (bootstrap) {
    const marker = await prisma.storeSettings.findUnique({
      where: { key: BOOTSTRAP_MARKER },
      select: { key: true },
    })
    if (marker) {
      console.log('Bootstrap déjà effectué : base initialisée, aucune donnée écrasée.')
      return
    }
    console.log('Premier démarrage : provisionnement initial de la base…')
  }

  await seedAdmin()
  await seedItAdmin()
  if (process.argv.includes('--accounts-only')) {
    console.log('Comptes initiaux provisionnés sans modifier le catalogue.')
    return
  }
  await seedStaff()

  const categoryData = [
    {
      name: 'Traceurs GPS',
      slug: 'traceurs-gps',
      type: 'GPS' as const,
      description: 'Solutions de géolocalisation pour véhicules personnels et professionnels.',
      sortOrder: 1,
    },
    {
      name: 'Boissons',
      slug: 'boissons',
      type: 'DRINK' as const,
      description: 'Boissons et packs pour la maison, le bureau et les événements.',
      sortOrder: 2,
    },
    {
      name: 'Services en packs',
      slug: 'services-packs',
      type: 'SERVICE' as const,
      description: 'Prestations professionnelles proposées sur devis.',
      sortOrder: 3,
    },
  ]

  const categories = new Map<string, string>()
  for (const category of categoryData) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, type: category.type, description: category.description, sortOrder: category.sortOrder, active: true },
    })
    categories.set(record.slug, record.id)
  }

  for (const [index, product] of products.entries()) {
    const categoryId = categories.get(product.categorySlug)
    if (!categoryId) throw new Error(`Catégorie manquante : ${product.categorySlug}`)
    const existing = await prisma.product.findUnique({ where: { slug: product.slug } })
    const data = {
      categoryId,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      type: product.type,
      shortDescription: product.shortDescription,
      description: product.description,
      price: product.price,
      quoteOnly: product.quoteOnly ?? false,
      specs: product.specs ?? undefined,
      stock: product.stock ?? null,
      manageStock: product.manageStock ?? false,
      available: !(product.quoteOnly ?? false),
      active: true,
      featured: product.featured ?? false,
      sortOrder: index,
    }
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data })
      await prisma.productImage.deleteMany({ where: { productId: existing.id } })
      await prisma.productImage.createMany({
        data: product.images.map((image, imageIndex) => ({
          productId: existing.id,
          url: image.url,
          alt: image.alt,
          sortOrder: imageIndex,
        })),
      })
    } else {
      await prisma.product.create({
        data: {
          ...data,
          images: { create: product.images.map((image, imageIndex) => ({ ...image, sortOrder: imageIndex })) },
        },
      })
    }
  }

  await prisma.storeSettings.upsert({
    where: { key: 'delivery.zones' },
    create: { key: 'delivery.zones', value: ['Lomé', 'Agoè', 'Baguida', 'Adidogomé'] },
    update: {},
  })
  await prisma.storeSettings.upsert({
    where: { key: 'store.name' },
    create: { key: 'store.name', value: 'Allo Togo Store' },
    update: {},
  })

  console.log(`Catalogue initialisé : ${products.length} produits.`)

  if (bootstrap) {
    await prisma.storeSettings.upsert({
      where: { key: BOOTSTRAP_MARKER },
      create: {
        key: BOOTSTRAP_MARKER,
        value: { completedAt: new Date().toISOString() },
      },
      update: {},
    })
    console.log('Bootstrap initial terminé : les prochains démarrages ne modifieront plus le catalogue.')
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
