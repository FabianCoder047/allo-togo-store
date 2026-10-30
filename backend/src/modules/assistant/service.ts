import type { Category, Product, ProductImage, Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { formatFcfa } from '../../lib/money.js'
import { generateTrackingCode } from '../../lib/ids.js'
import { realtime } from '../../realtime/events.js'
import { statusLabel } from '../orders/stateMachine.js'
import type { AssistantAskInput } from './schemas.js'

type CatalogProduct = Product & { category: Category; images: ProductImage[] }
type AssistantAction = 'ANSWER' | 'ESCALATE' | 'OUT_OF_SCOPE' | 'CLARIFY'

export type AssistantSuggestion = { label: string; path: string }

export type AssistantResult = {
  reply: string
  action: AssistantAction
  escalated: boolean
  reference?: string
  suggestions?: AssistantSuggestion[]
}

type ProductMatch = { product: CatalogProduct; score: number; margin: number }

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()

const tokenize = (value: string) => normalize(value).match(/[a-z0-9]+/g) ?? []

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'a', 'au', 'aux', 'et', 'ou', 'en',
  'pour', 'par', 'avec', 'sans', 'sur', 'dans', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes',
  'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'je', 'tu', 'il', 'elle',
  'on', 'nous', 'vous', 'ils', 'elles', 'que', 'qui', 'quoi', 'dont', 'est', 'sont', 'etre', 'ai',
  'as', 'avons', 'avez', 'ont', 'avoir', 'suis', 'es', 'sommes', 'etes', 'serai', 'sera', 'seront',
  'veux', 'veut', 'voulez', 'souhaite', 'souhaitez', 'cherche', 'cherchez', 'besoin', 'peux', 'peut',
  'pouvez', 'comment', 'combien', 'quel', 'quelle', 'quels', 'quelles', 'pourquoi', 'quand', 'si',
  'non', 'oui', 'merci', 'bonjour', 'salut', 'hello', 'bonsoir', 'coucou', 'svp', 'plait', 'please',
  'the', 'and', 'for', 'with', 'your', 'you', 'i', 'to', 'of', 'in', 'is', 'are',
])

const DOMAIN_TERMS = new Set([
  'allo', 'traceur', 'traceurs', 'gps', 'geolocalisation', 'localisation', 'suivi', 'suivre',
  'colis', 'commande', 'commandes', 'commander', 'panier', 'achat', 'acheter', 'boisson', 'boissons',
  'jus', 'eau', 'gazeuse', 'gazeuses', 'vitalo', 'ananas', 'rafraichissement', 'rafraichissements',
  'service', 'services', 'prestation', 'prestations', 'expertise', 'expertises', 'devis', 'flotte',
  'entreprise', 'entreprises', 'professionnel', 'professionnels', 'technologie', 'ia', 'conciergerie',
  'assistance', 'livraison', 'livrer', 'delai', 'delais', 'frais', 'zone', 'adresse', 'expedition',
  'recevoir', 'retrait', 'agence', 'paiement', 'payer', 'paye', 'mobile', 'money', 'bictorys',
  'especes', 'cash', 'facture', 'remboursement', 'prix', 'tarif', 'tarifs', 'cout', 'coute',
  'stock', 'disponible', 'disponibilite', 'rupture', 'installation', 'installer', 'montage', 'pose',
  'garantie', 'garanties', 'sim', 'abonnement', 'assurance', 'contact', 'telephone', 'numero',
  'whatsapp', 'mail', 'email', 'horaire', 'horaires', 'joindre', 'appeler', 'lome', 'catalogue',
  'produit', 'produits', 'modele', 'modeles', 'choisir', 'offre', 'offres', 'propose', 'proposez',
  'moto', 'motos', 'voiture', 'voitures', 'vehicule', 'vehicules', 'taxi', 'taxis', 'camion', 'camions',
])

const OUT_OF_SCOPE_TERMS = new Set([
  'meteo', 'weather', 'temperature', 'pluie', 'soleil', 'climat', 'football', 'foot', 'match', 'sport',
  'basket', 'tennis', 'rugby', 'jeu', 'jeux', 'gaming', 'cuisine', 'recette', 'recettes',
  'restaurant', 'pizza', 'burger', 'gateau', 'pates', 'sante', 'medicament', 'medecin', 'hopital',
  'maladie', 'symptome', 'voyage', 'hotel', 'avion', 'billet', 'tourisme', 'vacances', 'musique',
  'film', 'films', 'serie', 'series', 'netflix', 'cinema', 'acteur', 'chanteur', 'blague', 'horoscope',
  'astrologie', 'guerre', 'religion', 'priere', 'dieu', 'math', 'mathematiques', 'physique', 'chimie',
  'biologie', 'histoire', 'geographie', 'philosophie', 'programmation', 'python', 'javascript',
  'typescript', 'html', 'css', 'java', 'bitcoin', 'crypto', 'cryptomonnaie', 'bourse', 'trading',
  'impot', 'impots', 'emploi', 'recrutement', 'stage', 'universite', 'ecole', 'examen', 'devoir',
  'youtube', 'tiktok', 'facebook', 'instagram', 'snapchat', 'twitter',
])

const GREETING_TERMS = ['bonjour', 'salut', 'hello', 'bonsoir', 'coucou']
const THANKS_TERMS = ['merci', 'remercie', 'remerciement']
const HUMAN_TERMS = ['humain', 'conseiller', 'employe', 'agent', 'personne']
const FOLLOW_UP_STARTERS = new Set([
  'et', 'pour', 'combien', 'celui', 'celle', 'ceux', 'celles', 'ce', 'cette', 'le', 'la', 'les',
  'un', 'une', 'du', 'de', 'son', 'sa', 'ses', 'leur', 'leurs', 'aussi', 'pareil',
])

// Termes trop génériques pour identifier un produit : ils servent aux intentions
// (catalogue, prix, suivi, livraison…), pas au score de similarité produit.
// Sans cette liste, « packs entreprises » ferait correspondre le pack Consulting.
const PROCESS_TERMS = [
  'litige', 'litiges', 'fournisseur', 'fournisseurs', 'politique', 'procedure', 'procedures',
  'interne', 'regle', 'regles', 'reglement', 'contrat', 'contrats', 'juridique', 'contentieux',
  'reclamation', 'reclamations', 'sav',
]

const SPECIFIC_PRODUCT_TERMS = [
  'compact', 'pro', 'moto', 'vitalo', 'ananas', 'eau', 'jus', 'gazeuse', 'gazeuses', 'minerale',
  'fraicheur', 'fruits', 'assortis', 'consulting', 'technologie', 'conciergerie', 'logistique',
  'evenementiel', 'secretariat', 'administration', 'ia',
]

const GENERIC_MATCH_TERMS = new Set([
  'allo', 'traceur', 'traceurs', 'gps', 'geolocalisation', 'localisation', 'suivi', 'suivre',
  'colis', 'commande', 'commandes', 'commander', 'panier', 'achat', 'acheter', 'boisson', 'boissons',
  'service', 'services', 'prestation', 'prestations', 'expertise', 'expertises', 'devis', 'flotte',
  'entreprise', 'entreprises', 'professionnel', 'professionnels', 'solution', 'solutions', 'pack',
  'packs', 'offre', 'offres', 'produit', 'produits', 'catalogue', 'prix', 'tarif', 'tarifs', 'cout',
  'coute', 'combien', 'stock', 'disponible', 'disponibilite', 'rupture', 'installation', 'installer',
  'montage', 'pose', 'garantie', 'garanties', 'sim', 'abonnement', 'assurance', 'contact',
  'telephone', 'numero', 'whatsapp', 'adresse', 'agence', 'horaire', 'horaires', 'joindre', 'appeler',
  'email', 'mail', 'livraison', 'livrer', 'delai', 'delais', 'frais', 'zone', 'expedition',
  'recevoir', 'retrait', 'paiement', 'payer', 'paye', 'mobile', 'money', 'bictorys', 'especes',
  'cash', 'facture', 'remboursement', 'vehicule', 'vehicules', 'assistance', 'lome',
])

const hasAny = (tokens: Set<string>, words: string[]) => words.some((word) => tokens.has(word))
const hasPhrase = (normalized: string, phrase: string) => normalized.includes(normalize(phrase))

type KnowledgeItem = { question: string; answer: string; keywords: string }
type KnowledgeWhere = {
  active?: boolean
  OR?: Array<{
    question?: { contains: string; mode: 'insensitive' }
    answer?: { contains: string; mode: 'insensitive' }
    keywords?: { contains: string; mode: 'insensitive' }
  }>
}

const matchKnowledge = (message: string, knowledges: KnowledgeItem[]) => {
  const tokens = tokenize(message).filter(
    (token) => token.length >= 2 && !STOP_WORDS.has(token),
  )
  if (tokens.length === 0 || knowledges.length === 0) return null
  let best: { knowledge: KnowledgeItem; score: number } | null = null
  for (const knowledge of knowledges) {
    const haystack = tokenize(`${knowledge.question} ${knowledge.keywords}`)
    let score = 0
    for (const token of tokens) {
      if (haystack.some((t) => t === token)) score += 1
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { knowledge, score }
    }
  }
  return best ? best.knowledge : null
}

const productPrice = (product: CatalogProduct) =>
  product.quoteOnly || product.price <= 0 ? 'sur devis' : formatFcfa(product.price)

const productStock = (product: CatalogProduct) => {
  if (!product.manageStock || product.stock === null) return 'disponibilité à confirmer'
  if (product.stock <= 0) return 'momentanément en rupture'
  return `${product.stock} unité${product.stock > 1 ? 's' : ''} en stock`
}

const productPath = (product: CatalogProduct) =>
  product.type === 'SERVICE' ? `/service/${product.id}` : `/produit/${product.id}`

const specsFor = (product: CatalogProduct) => {
  const specs = product.specs as Record<string, unknown> | null
  return specs ?? {}
}

const answer = (
  reply: string,
  action: AssistantAction = 'ANSWER',
  extra: Omit<Partial<AssistantResult>, 'reply' | 'action' | 'escalated'> = {},
): AssistantResult => ({
  reply,
  action,
  escalated: action === 'ESCALATE',
  ...extra,
})

const outOfScope = () =>
  answer(
    'Je ne suis pas en mesure de répondre à cette question. Je suis spécialisé dans les services Allo Togo : traceurs GPS, boissons, packs de services et suivi de commande.',
    'OUT_OF_SCOPE',
    { suggestions: [{ label: 'Voir la boutique', path: '/' }] },
  )

const clarify = () =>
  answer(
    'Pouvez-vous préciser le produit ou le service concerné ? Je peux vous renseigner sur les traceurs GPS, les boissons, les packs de services ou le suivi d’une commande.',
    'CLARIFY',
    {
      suggestions: [
        { label: 'Traceurs GPS', path: '/traceurs' },
        { label: 'Boissons', path: '/boissons' },
        { label: 'Services', path: '/services' },
        { label: 'Suivi', path: '/suivi' },
      ],
    },
  )

const settingValue = (rows: Array<{ key: string; value: unknown }>, key: string): string | null => {
  const row = rows.find((item) => item.key === key)
  if (!row) return null
  if (typeof row.value === 'string' || typeof row.value === 'number') return String(row.value)
  if (Array.isArray(row.value)) return row.value.map((item) => String(item)).join(', ')
  return null
}

const buildDocuments = (products: CatalogProduct[]) => {
  const docs = products.map((product) => {
    const specs = specsFor(product)
    const nameTokens = new Set(tokenize(product.name))
    const tokens = new Set([
      ...tokenize(product.name),
      ...tokenize(product.name),
      ...tokenize(product.shortDescription),
      ...tokenize(product.description),
      ...tokenize(product.category.name),
      ...tokenize(Object.values(specs).filter((value) => typeof value === 'string').join(' ')),
    ])
    return {
      product,
      nameTokens,
      tokens,
      haystack: normalize(
        [
          product.name,
          product.sku,
          product.shortDescription,
          product.description,
          product.category.name,
          ...Object.values(specs).filter((value) => typeof value === 'string'),
        ].join(' '),
      ),
    }
  })

  const documentFrequency = new Map<string, number>()
  for (const doc of docs) {
    for (const token of doc.tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1)
    }
  }

  return { docs, documentFrequency }
}

const findProductMatch = (
  docs: ReturnType<typeof buildDocuments>['docs'],
  documentFrequency: Map<string, number>,
  currentTokens: Set<string>,
  contextTokens: Set<string>,
  normalizedMessage: string,
): ProductMatch | null => {
  const queryTokens = new Set([...currentTokens, ...contextTokens])
  if (queryTokens.size === 0) return null

  const scored = docs.map((doc) => {
    let score = 0
    for (const token of queryTokens) {
      if (STOP_WORDS.has(token) || GENERIC_MATCH_TERMS.has(token) || token.length < 2) continue
      if (!doc.tokens.has(token)) continue
      const df = documentFrequency.get(token) ?? 0
      const weight = 1 + Math.log((docs.length + 1) / (df + 1))
      score += weight * (doc.nameTokens.has(token) ? 1.6 : 1) * (currentTokens.has(token) ? 1.4 : 1)
    }
    if (normalizedMessage.length >= 4 && doc.haystack.includes(normalizedMessage)) score += 4
    return { product: doc.product, score }
  })

  scored.sort((left, right) => right.score - left.score)
  const best = scored[0]
  if (!best || best.score < 2.2) return null
  const second = scored[1]?.score ?? 0
  return { ...best, margin: best.score - second }
}

const productAnswer = (product: CatalogProduct) => {
  const specs = specsFor(product)
  const idealFor = typeof specs.idealFor === 'string' ? specs.idealFor : null
  const description = product.shortDescription?.trim() || product.description?.trim() || null
  const details = [
    `${product.name} — ${productPrice(product)}.`,
    idealFor ? `Usage conseillé : ${idealFor}.` : description ? `${description}` : null,
    product.type === 'SERVICE'
      ? 'Ce pack de services est établi sur devis.'
      : `Disponibilité : ${productStock(product)}.`,
    product.available ? null : 'Le produit est momentanément indisponible.',
  ]
    .filter(Boolean)
    .join(' ')

  return answer(details, 'ANSWER', {
    suggestions: [{ label: 'Voir la fiche', path: productPath(product) }],
  })
}

const listProducts = (products: CatalogProduct[], type: 'GPS' | 'DRINK' | 'SERVICE') => {
  const rows = products.filter((product) => product.type === type).slice(0, 6)
  if (rows.length === 0) {
    return answer('Le catalogue ne contient pas encore de contenu actif pour cette catégorie.', 'ANSWER', {
      suggestions: [{ label: 'Voir la boutique', path: '/' }],
    })
  }

  const title =
    type === 'GPS'
      ? 'Voici les traceurs GPS disponibles :'
      : type === 'DRINK'
        ? 'Voici les boissons disponibles :'
        : 'Voici les packs de services disponibles :'
  const lines = rows
    .map((product) => {
      const availability =
        type === 'SERVICE' ? '' : ` — ${productStock(product)}`
      return `• ${product.name} — ${productPrice(product)}${availability}`
    })
    .join('\n')
  const suffix =
    type === 'SERVICE'
      ? 'Chaque pack est établi sur devis.'
      : 'Vous pouvez comparer les fiches dans le catalogue.'

  return answer(`${title}\n${lines}\n${suffix}`, 'ANSWER', {
    suggestions: [
      {
        label: type === 'GPS' ? 'Catalogue GPS' : type === 'DRINK' ? 'Catalogue boissons' : 'Catalogue services',
        path: type === 'GPS' ? '/traceurs' : type === 'DRINK' ? '/boissons' : '/services',
      },
    ],
  })
}

const escalationCache = new Map<string, { reference: string; expiresAt: number }>()

const escalate = async (
  message: string,
  sessionId: string | undefined,
  history: AssistantAskInput['history'],
): Promise<AssistantResult> => {
  const cacheKey = sessionId ? `${sessionId}:${normalize(message)}` : null
  if (cacheKey) {
    const cached = escalationCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return answer(
        `Je vais faire appel à un employé de Allo Togo pour répondre à votre question. Votre message a déjà été transmis à l’équipe (référence ${cached.reference}).`,
        'ESCALATE',
        {
          reference: cached.reference,
          suggestions: [{ label: 'Laisser mes coordonnées', path: '/contact' }],
        },
      )
    }
  }

  const reference = `ESC-${generateTrackingCode(6)}`
  const createdAt = new Date()
  const conversation = (history ?? [])
    .filter((item) => item.role === 'client')
    .slice(-2)
    .map((item) => item.text)
  const staff = await prisma.user.findMany({
    where: { active: true, role: { in: ['DIRECTOR', 'COMMERCIAL'] } },
    select: { id: true },
  })

  // La discussion est conservée même si aucun employé n'est connecté : elle
  // reste consultable et peut recevoir une réponse dès qu'un employé ouvre
  // l'alerte. Une session cliente réutilise le même fil.
  const thread = await prisma.$transaction(async (tx) => {
    const existing = sessionId
      ? await tx.assistantThread.findUnique({ where: { sessionId } })
      : null
    const activeThread = existing
      ? await tx.assistantThread.update({
          where: { id: existing.id },
          data: { reference, status: 'OPEN' },
        })
      : await tx.assistantThread.create({
          data: { sessionId: sessionId ?? null, reference, status: 'OPEN' },
        })

    const historyItems = history ?? []
    const historyMessages = existing
      ? []
      : historyItems.slice(-6).map((item, index) => ({
          threadId: activeThread.id,
          authorType: item.role === 'client' ? 'CLIENT' : 'AI',
          authorName: item.role === 'client' ? 'Client' : 'Assistant Allo Togo',
          body: item.text,
          createdAt: new Date(createdAt.getTime() - (historyItems.length - index) * 1000),
        }))

    await tx.assistantThreadMessage.createMany({
      data: [
        ...historyMessages,
        {
          threadId: activeThread.id,
          authorType: 'CLIENT',
          authorName: 'Client',
          body: message,
          createdAt,
        },
      ],
    })

    if (staff.length > 0) {
      await Promise.all(
        staff.map((member) =>
          tx.notification.create({
            data: {
              assistantThreadId: activeThread.id,
              channel: 'IN_APP',
              recipient: member.id,
              template: 'ASSISTANT_ESCALATION',
              status: 'PENDING',
              payload: {
                reference,
                source: 'ASSISTANT',
                customerMessage: message,
                conversation,
                sessionId: sessionId ?? null,
                threadId: activeThread.id,
                createdAt: createdAt.toISOString(),
              },
            },
          }),
        ),
      )
    }

    return activeThread
  })

  realtime.emit('assistant:escalation', {
    reference,
    customerMessage: message,
    createdAt: createdAt.toISOString(),
    staffIds: staff.map((member) => member.id),
    threadId: thread.id,
    sessionId: sessionId ?? null,
  })
  logger.info({ reference, staffCount: staff.length }, 'Question client transmise aux employés Allo Togo')

  if (cacheKey) {
    escalationCache.set(cacheKey, { reference, expiresAt: Date.now() + 60_000 })
  }

  return answer(
    `Je vais faire appel à un employé de Allo Togo pour répondre à votre question. Votre message a été transmis à l’équipe (référence ${reference}).`,
    'ESCALATE',
    {
      reference,
      suggestions: [{ label: 'Laisser mes coordonnées', path: '/contact' }],
    },
  )
}

const trackingAnswer = async (message: string): Promise<AssistantResult> => {
  const upper = message.toUpperCase()
  const orderNumber = upper.match(/\bCMD-[A-Z]+-\d{8}-[A-Z0-9]{5}\b/)?.[0]
  const trackingCode = upper.match(/\b[A-HJ-NP-Z2-9]{12}\b/)?.[0]
  const code = orderNumber ?? trackingCode
  if (!code) {
    return answer(
      'Pour suivre une commande, ouvrez la page Suivi et saisissez le code reçu à la création de la commande. La messagerie privée du suivi est protégée par le numéro de téléphone utilisé lors de la commande.',
      'ANSWER',
      { suggestions: [{ label: 'Suivre une commande', path: '/suivi' }] },
    )
  }

  const order = await prisma.order.findFirst({
    where: orderNumber ? { orderNumber } : { trackingCode },
    select: {
      orderNumber: true,
      trackingCode: true,
      categoryType: true,
      status: true,
      operationalStatus: true,
      updatedAt: true,
    },
  })
  if (!order) {
    return answer(`Aucune commande ne correspond au code ${code}. Vérifiez le code ou contactez l’équipe Allo Togo.`, 'ANSWER', {
      suggestions: [
        { label: 'Réessayer le suivi', path: '/suivi' },
        { label: 'Contacter l’équipe', path: '/contact' },
      ],
    })
  }

  const status = statusLabel[order.status as keyof typeof statusLabel] ?? order.status
  const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(order.updatedAt)
  return answer(
    `La commande ${order.orderNumber} (${order.categoryType === 'GPS' ? 'GPS' : 'boissons'}) est actuellement « ${status} ». Dernière mise à jour : ${date}. Ouvrez la page Suivi pour consulter le détail et la messagerie privée.`,
    'ANSWER',
    { suggestions: [{ label: 'Ouvrir le suivi', path: `/suivi/${order.trackingCode}` }] },
  )
}

export const askAssistant = async (input: AssistantAskInput): Promise<AssistantResult> => {
  const message = input.message.trim()
  const history = input.history ?? []
  const normalizedMessage = normalize(message)
  const currentTokens = tokenize(message)
  const currentSet = new Set(currentTokens)
  const previousClientTokens = tokenize(
    history.filter((item) => item.role === 'client').slice(-2).map((item) => item.text).join(' '),
  )
  const contentTokens = currentTokens.filter((token) => !STOP_WORDS.has(token))
  const currentHasDomain = [...currentSet].some((token) => DOMAIN_TERMS.has(token))
  // L'historique ne sert qu'aux relances courtes (« et pour une moto ? », « le prix ? »).
  // Une nouvelle question complète ne doit jamais hériter des produits de la précédente.
  const followUp =
    contentTokens.length <= 3 &&
    currentTokens[0] !== undefined &&
    FOLLOW_UP_STARTERS.has(currentTokens[0]) &&
    (currentHasDomain || hasAny(currentSet, ['combien']))
  const contextSet = new Set(followUp ? [...previousClientTokens, ...currentTokens] : currentTokens)

  const [products, settings, knowledges] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.storeSettings.findMany({ where: { key: { in: ['store.phone', 'delivery.zones'] } } }),
    knowledgeDelegate.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const catalog = products as CatalogProduct[]
  const { docs, documentFrequency } = buildDocuments(catalog)
  const productMatch = findProductMatch(docs, documentFrequency, currentSet, contextSet, normalizedMessage)

  const tracking =
    hasAny(currentSet, ['suivi', 'suivre', 'tracking', 'colis']) ||
    (hasAny(currentSet, ['commande', 'commandes']) &&
      hasAny(currentSet, ['ou', 'statut', 'etat', 'code', 'suivi', 'arrive', 'arrivee', 'etape', 'livraison'])) ||
    hasPhrase(normalizedMessage, 'ou en est') ||
    hasPhrase(normalizedMessage, 'statut de ma commande') ||
    hasPhrase(normalizedMessage, 'suivre ma commande')
  const orderIntent =
    !tracking &&
    (hasAny(currentSet, ['commander', 'commande', 'commandes', 'acheter', 'achat', 'panier']) ||
      hasPhrase(normalizedMessage, 'passer commande'))
  const delivery = hasAny(currentSet, ['livraison', 'livrer', 'delai', 'delais', 'frais', 'zone', 'adresse', 'expedition', 'recevoir', 'retrait'])
  const payment = hasAny(currentSet, ['paiement', 'payer', 'paye', 'mobile', 'money', 'bictorys', 'especes', 'cash', 'facture', 'remboursement'])
  const quote =
    hasAny(currentSet, ['devis', 'flotte', 'prestation', 'prestations', 'professionnel', 'professionnels']) ||
    hasPhrase(normalizedMessage, 'sur mesure') ||
    (hasAny(currentSet, ['service', 'services']) && hasAny(currentSet, ['entreprise', 'entreprises', 'besoin', 'projet']))
  const catalogGps =
    hasAny(currentSet, ['traceur', 'traceurs', 'gps', 'geolocalisation']) &&
    (hasAny(currentSet, ['catalogue', 'liste', 'modeles', 'choisir', 'offre', 'offres', 'propose', 'proposez', 'quels', 'quelles', 'acheter', 'prix', 'tarif']) ||
      currentSet.size <= 4)
  const catalogDrinks =
    hasAny(currentSet, ['boisson', 'boissons', 'jus', 'eau', 'gazeuse', 'gazeuses', 'vitalo']) &&
    (hasAny(currentSet, ['catalogue', 'liste', 'offre', 'offres', 'propose', 'proposez', 'quels', 'quelles', 'acheter', 'prix', 'tarif']) ||
      currentSet.size <= 4)
  const catalogServices =
    hasAny(currentSet, ['service', 'services', 'prestation', 'prestations', 'expertise', 'expertises']) &&
    (hasAny(currentSet, ['catalogue', 'liste', 'offre', 'offres', 'propose', 'proposez', 'quels', 'quelles', 'type', 'types']) ||
      currentSet.size <= 3)
  const price = hasAny(currentSet, ['prix', 'tarif', 'tarifs', 'cout', 'coute', 'combien'])
  const stock = hasAny(currentSet, ['stock', 'disponible', 'disponibilite', 'rupture'])
  const installation = hasAny(currentSet, ['installation', 'installer', 'montage', 'pose'])
  const warranty = hasAny(currentSet, ['garantie', 'garanties', 'sim', 'abonnement', 'assurance'])
  const contact = hasAny(currentSet, ['contact', 'telephone', 'numero', 'whatsapp', 'adresse', 'localisation', 'lome', 'agence', 'horaire', 'horaires', 'joindre', 'appeler', 'email', 'mail'])
  const human =
    (hasAny(currentSet, HUMAN_TERMS) &&
      (hasAny(currentSet, ['parler', 'appeler', 'joindre', 'avoir', 'besoin', 'vouloir', 'veux']) || currentSet.size <= 3)) ||
    hasPhrase(normalizedMessage, 'parler a un')
  const greeting = hasAny(currentSet, GREETING_TERMS)
  const thanks = hasAny(currentSet, THANKS_TERMS)
  const identity =
    hasPhrase(normalizedMessage, 'qui es tu') ||
    hasPhrase(normalizedMessage, 'qui etes vous') ||
    hasPhrase(normalizedMessage, 'tu es qui') ||
    hasPhrase(normalizedMessage, 'vous etes qui') ||
    (hasAny(currentSet, ['assistant', 'bot', 'robot']) && hasAny(currentSet, ['qui', 'es', 'etes']))
  const hasDomain =
    currentHasDomain ||
    normalizedMessage.includes('allo togo') ||
    hasPhrase(normalizedMessage, 'allo-togo')
  const outOfScopeHit = currentTokens.some((token) => OUT_OF_SCOPE_TERMS.has(token))
  const strongDomainIntent = tracking || delivery || payment || quote || catalogGps || catalogDrinks || catalogServices || human

  if (human) return escalate(message, input.sessionId, history)
  if (tracking) return trackingAnswer(message)

  // Une question de politique, de procédure ou de litige n'est pas une demande
  // de fiche produit, sauf si elle cite explicitement un modèle précis.
  if (hasAny(currentSet, PROCESS_TERMS) && !hasAny(currentSet, SPECIFIC_PRODUCT_TERMS)) {
    return escalate(message, input.sessionId, history)
  }

  if (delivery) {
    const zones = settingValue(settings, 'delivery.zones')
    const fee = env.DELIVERY_FEE_FCFA > 0 ? `Les frais configurés sont de ${formatFcfa(env.DELIVERY_FEE_FCFA)}.` : 'Les frais sont confirmés selon la zone.'
    return answer(
      `Allo Togo propose la livraison ou le retrait en agence. ${fee}${zones ? ` Zones renseignées : ${zones}.` : ''} Le délai et l’adresse exacte sont confirmés par l’équipe avant la commande.`,
      'ANSWER',
      { suggestions: [{ label: 'Nous contacter', path: '/contact' }] },
    )
  }
  if (payment) {
    return answer(
      'Le paiement intégral est enregistré à la livraison, au retrait ou en agence, avant la validation finale de la commande. Aucun paiement en ligne n’est demandé au checkout. Bictorys est utilisé uniquement lorsque la configuration officielle est activée.',
      'ANSWER',
      { suggestions: [{ label: 'Voir le suivi', path: '/suivi' }] },
    )
  }
  if (quote) {
    return answer(
      'Les packs de services sont établis sur devis. Décrivez votre besoin depuis la page Services ou Contact : un conseiller vous répondra avec un périmètre et un tarif adaptés.',
      'ANSWER',
      {
        suggestions: [
          { label: 'Voir les services', path: '/services' },
          { label: 'Demander un devis', path: '/contact' },
        ],
      },
    )
  }

  if (outOfScopeHit && !strongDomainIntent) return outOfScope()

  if (hasAny(currentSet, ['vitalo']) && !productMatch) {
    return answer(
      'Vitalo Ananas est la boisson mise en avant par Allo Togo. Les packs disponibles et leurs prix se trouvent dans le catalogue Boissons.',
      'ANSWER',
      { suggestions: [{ label: 'Voir les boissons', path: '/boissons' }] },
    )
  }

  if (productMatch && productMatch.score >= 2.2 && productMatch.margin >= 0.6) {
    return productAnswer(productMatch.product)
  }

  if (catalogGps) return listProducts(catalog, 'GPS')
  if (catalogDrinks) return listProducts(catalog, 'DRINK')
  if (catalogServices) return listProducts(catalog, 'SERVICE')

  if (price || stock) return clarify()

  if (installation || warranty) {
    return answer(
      'L’installation, la garantie, la SIM et l’abonnement dépendent du modèle retenu. Indiquez le traceur qui vous intéresse ou demandez un devis : l’équipe Allo Togo confirmera les conditions avant la commande.',
      'ANSWER',
      {
        suggestions: [
          { label: 'Voir les traceurs', path: '/traceurs' },
          { label: 'Poser la question', path: '/contact' },
        ],
      },
    )
  }

  if (outOfScopeHit) return outOfScope()

  if (contact) {
    const phone = settingValue(settings, 'store.phone')
    return answer(
      `Vous pouvez joindre Allo Togo via la page Contact${phone ? ` ou au ${phone}` : ''}. L’équipe est basée à Lomé, Togo, et vous répondra selon vos besoins.`,
      'ANSWER',
      { suggestions: [{ label: 'Ouvrir la page Contact', path: '/contact' }] },
    )
  }

  if (orderIntent) {
    return answer(
      'Pour passer commande, ajoutez les produits au panier puis validez le checkout. Les traceurs et les boissons sont séparés en deux commandes opérationnelles distinctes, et aucun paiement en ligne n’est demandé à cette étape.',
      'ANSWER',
      {
        suggestions: [
          { label: 'Voir les traceurs', path: '/traceurs' },
          { label: 'Voir les boissons', path: '/boissons' },
          { label: 'Mon panier', path: '/panier' },
        ],
      },
    )
  }

  if (greeting && !hasDomain) {
    return answer(
      'Bonjour et bienvenue chez Allo Togo. Je peux vous renseigner sur les traceurs GPS, les boissons, les packs de services ou le suivi d’une commande.',
      'ANSWER',
      {
        suggestions: [
          { label: 'Traceurs GPS', path: '/traceurs' },
          { label: 'Boissons', path: '/boissons' },
          { label: 'Services', path: '/services' },
        ],
      },
    )
  }

  if (thanks) {
    return answer('Avec plaisir. Je reste disponible pour vos questions sur les services Allo Togo.', 'ANSWER')
  }

  if (identity) {
    return answer(
      'Je suis l’assistant Allo Togo. Je réponds à partir du catalogue et des informations de la boutique. Si une question dépasse mes informations, je la transmets à un employé Allo Togo.',
      'ANSWER',
    )
  }

  const knowledgeMatch = matchKnowledge(message, knowledges)
  if (knowledgeMatch) return answer(knowledgeMatch.answer, 'ANSWER')

  if (hasDomain) return escalate(message, input.sessionId, history)

  return outOfScope()
}

type KnowledgeDelegate = {
  findMany: (args: {
    where: KnowledgeWhere
    orderBy: { createdAt: 'desc' }
  }) => Promise<KnowledgeItem[]>
  create: (args: {
    data: Record<string, unknown>
  }) => Promise<KnowledgeItem>
}

// Keep this module compatible with databases whose generated Prisma client
// predates the AssistantKnowledge delegate.
const knowledgeDelegate = (
  prisma as unknown as { assistantKnowledge: KnowledgeDelegate }
).assistantKnowledge

export const listKnowledge = async (options: { activeOnly?: boolean; q?: string } = {}) => {
  const where: KnowledgeWhere = {}
  if (options.activeOnly !== false) where.active = true
  if (options.q) {
    where.OR = [
      { question: { contains: options.q, mode: 'insensitive' } },
      { answer: { contains: options.q, mode: 'insensitive' } },
      { keywords: { contains: options.q, mode: 'insensitive' } },
    ]
  }
  return knowledgeDelegate.findMany({ where, orderBy: { createdAt: 'desc' } })
}

export const createKnowledge = async (input: {
  question: string
  answer: string
  keywords: string
  sourceThreadId?: string | null
  sourceMessageId?: string | null
  createdById?: string | null
}) => {
  return knowledgeDelegate.create({
    data: {
      question: input.question,
      answer: input.answer,
      keywords: input.keywords,
      ...(input.sourceThreadId ? { sourceThreadId: input.sourceThreadId } : {}),
      ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
      ...(input.createdById
        ? { createdBy: { connect: { id: input.createdById } } }
        : {}),
    },
  })
}
