import { Prisma, type ProductType } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { conflict, notFound } from '../../lib/errors.js'
import type { z } from 'zod'
import type {
  categoryInputSchema,
  categoryUpdateSchema,
  productInputSchema,
  productUpdateSchema,
} from './schemas.js'

const productInclude = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  videos: { orderBy: { sortOrder: 'asc' as const } },
  category: { select: { id: true, name: true, slug: true, type: true } },
}

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'catalogue'

const uniqueProductSlug = async (name: string, exceptId?: string) => {
  const base = slugify(name)
  let slug = base
  let suffix = 2
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug }, select: { id: true } })
    if (!existing || existing.id === exceptId) return slug
    slug = `${base}-${suffix}`
    suffix += 1
  }
}

export const listCategories = async (options: { includeInactive?: boolean; type?: ProductType } = {}) => {
  return prisma.category.findMany({
    where: {
      ...(options.includeInactive ? {} : { active: true }),
      ...(options.type ? { type: options.type } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  })
}

export const listProducts = async (query: {
  type?: ProductType
  category?: string
  search?: string
  featured?: boolean
  includeInactive?: boolean
}) => {
  const where: Prisma.ProductWhereInput = {
    ...(query.includeInactive ? {} : { active: true }),
    ...(query.type ? { type: query.type } : {}),
    ...(query.featured !== undefined ? { featured: query.featured } : {}),
    ...(query.category
      ? { category: { OR: [{ slug: query.category }, { id: query.category }] } }
      : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { shortDescription: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  return prisma.product.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: productInclude,
  })
}

export const getProduct = async (idOrSlug: string, includeInactive = false) => {
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }, { sku: idOrSlug }],
      ...(includeInactive ? {} : { active: true }),
    },
    include: productInclude,
  })
  if (!product) throw notFound('Produit introuvable.')
  return product
}

export const createCategory = async (input: z.infer<typeof categoryInputSchema>) => {
  return prisma.category.create({ data: input })
}

export const updateCategory = async (id: string, input: z.infer<typeof categoryUpdateSchema>) => {
  const category = await prisma.category.findUnique({ where: { id } })
  if (!category) throw notFound('Catégorie introuvable.')
  return prisma.category.update({ where: { id }, data: input })
}

export const createProduct = async (input: z.infer<typeof productInputSchema>) => {
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } })
  if (!category) throw notFound('Catégorie introuvable.')
  if (category.type !== input.type) throw conflict('Le type du produit ne correspond pas à celui de la catégorie.')

  const { images, videos, ...data } = input
  return prisma.product.create({
    data: {
      ...data,
      slug: data.slug ?? (await uniqueProductSlug(data.name)),
      specs: data.specs ?? undefined,
      wholesalePrices: data.wholesalePrices ?? undefined,
      images: { create: images },
      videos: { create: videos },
    },
    include: productInclude,
  })
}

export const updateProduct = async (id: string, input: z.infer<typeof productUpdateSchema>) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: { select: { id: true } } },
  })
  if (!product) throw notFound('Produit introuvable.')
  if ((input.images ?? product.images).length === 0) {
    throw conflict('Chaque produit ou service doit comporter au moins une image.')
  }

  const nextType = input.type ?? product.type
  const nextCategoryId = input.categoryId ?? product.categoryId
  if (nextType !== product.type || nextCategoryId !== product.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: nextCategoryId } })
    if (!category) throw notFound('Catégorie introuvable.')
    if (category.type !== nextType) throw conflict('Le type du produit ne correspond pas à celui de la catégorie.')
  }
  const nextPrice = input.price ?? product.price
  const nextPreviousPrice = input.previousPrice === undefined ? product.previousPrice : input.previousPrice
  if (nextPreviousPrice !== null && nextPreviousPrice !== undefined && nextPreviousPrice <= nextPrice) {
    throw conflict('Le prix avant doit être supérieur au prix actuel.')
  }
  const nextWholesalePrices = input.wholesalePrices === undefined ? product.wholesalePrices : input.wholesalePrices
  if (
    Array.isArray(nextWholesalePrices) &&
    nextWholesalePrices.some(
      (tier) =>
        typeof tier === 'object' &&
        tier !== null &&
        'unitPrice' in tier &&
        typeof tier.unitPrice === 'number' &&
        tier.unitPrice >= nextPrice,
    )
  ) {
    throw conflict('Les prix de gros doivent être inférieurs au prix actuel.')
  }

  const { images, videos, ...data } = input
  const { categoryId, ...productData } = data
  const slug =
    productData.slug ??
    (productData.name && productData.name !== product.name
      ? await uniqueProductSlug(productData.name, product.id)
      : undefined)
  return prisma.$transaction(async (tx) => {
    if (images) {
      await tx.productImage.deleteMany({ where: { productId: id } })
    }
    if (videos) {
      await tx.productVideo.deleteMany({ where: { productId: id } })
    }
    return tx.product.update({
      where: { id },
      data: {
        ...productData,
        ...(slug ? { slug } : {}),
        ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
        specs: data.specs === null ? undefined : data.specs,
        wholesalePrices: data.wholesalePrices === null ? Prisma.DbNull : data.wholesalePrices,
        ...(images ? { images: { create: images } } : {}),
        ...(videos ? { videos: { create: videos } } : {}),
      },
      include: productInclude,
    })
  })
}

export const deleteProduct = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { items: true, movements: true } } },
  })
  if (!product) throw notFound('Contenu du catalogue introuvable.')
  if (product._count.items > 0 || product._count.movements > 0) {
    throw conflict('Ce contenu est lié à des commandes ou mouvements de stock. Désactivez-le plutôt que de le supprimer.')
  }

  await prisma.product.delete({ where: { id } })
  return { id: product.id, name: product.name }
}

export const adjustStock = async (
  productId: string,
  quantity: number,
  reason: string | undefined,
  actorId: string,
) => {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } })
    if (!product) throw notFound('Produit introuvable.')
    if (product.stock === null) throw conflict('Le stock n’est pas géré pour ce produit.')
    const nextStock = product.stock + quantity
    if (nextStock < 0) throw conflict('Le stock ne peut pas devenir négatif.')

    const updated = await tx.product.update({
      where: { id: productId },
      data: { stock: nextStock },
      include: productInclude,
    })
    await tx.inventoryMovement.create({
      data: {
        productId,
        type: quantity > 0 ? 'IN' : 'OUT',
        quantity,
        reason,
        actorId,
      },
    })
    return updated
  })
}
