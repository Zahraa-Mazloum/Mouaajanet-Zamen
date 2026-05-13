// src/lib/services/product.service.ts

import mongoose from 'mongoose'
import { z }    from 'zod'
import { Product }        from '@/models/Product'
import { ProductVariant } from '@/models/Productvariant'
import dbConnect          from '@/lib/dbConnect'


const BomItemSchema = z.object({
  materialId: z.string().min(1),
  quantity:   z.number().positive(),
  unit:       z.enum(['g', 'kg', 'ml', 'l', 'pcs', 'box']),
})

export const CreateProductSchema = z.object({
  name:          z.string().min(1).max(200).trim(),
  nameAr:        z.string().min(1).max(200).trim(),
  description:   z.string().max(2000).default(''),
  descriptionAr: z.string().max(2000).default(''),

  category:  z.string().min(1),       
  allergens: z.array(z.string()).default([]),
  tags:      z.array(z.string()).default([]),

  images: z.array(z.string().url()).default([]),

  isFeatured:       z.boolean().default(false),
  isAvailableInWeb: z.boolean().default(false),

  defaultVariant: z.object({
    name:       z.string().default(''),
    nameAr:     z.string().default(''),
    sku:        z.string().min(1).max(50).toUpperCase().trim(),
    priceUSD:   z.number().nonnegative(),
    priceLBP:   z.number().nonnegative(),
    bom:        z.array(BomItemSchema).default([]),
    isAvailableInWeb: z.boolean().default(false),
  }),
})

export const UpdateProductSchema = z.object({
  name:             z.string().min(1).max(200).trim().optional(),
  nameAr:           z.string().min(1).max(200).trim().optional(),
  description:      z.string().max(2000).optional(),
  descriptionAr:    z.string().max(2000).optional(),
  category:         z.string().optional(),
  allergens:        z.array(z.string()).optional(),
  tags:             z.array(z.string()).optional(),
  images:           z.array(z.string().url()).optional(),
  isFeatured:       z.boolean().optional(),
  isAvailableInWeb: z.boolean().optional(),
  isActive:         z.boolean().optional(),
})

export const CreateVariantSchema = z.object({
  name:             z.string().trim().default(''), 
  nameAr:           z.string().trim().default(''),
  sku:              z.string().min(1).max(50).toUpperCase().trim(),
  priceUSD:         z.number().nonnegative(),
  priceLBP:         z.number().nonnegative(),
  bom:              z.array(BomItemSchema).default([]),
  isDefault:        z.boolean().default(false),
  isAvailable:      z.boolean().default(true),
  isAvailableInWeb: z.boolean().default(false),
  displayOrder:     z.number().int().min(0).default(0),
  images:           z.array(z.string().url()).default([]),
})

export const UpdateVariantSchema = CreateVariantSchema.partial()

// List query params schema
export const ListProductsQuerySchema = z.object({
  page:             z.coerce.number().int().min(1).default(1),
  limit:            z.coerce.number().int().min(1).max(100).default(20),
  search:           z.string().optional(),
  category:         z.string().optional(),
  isAvailableInWeb: z.coerce.boolean().optional(),
  isFeatured:       z.coerce.boolean().optional(),
  lowStock:         z.coerce.boolean().optional(),
})

export type CreateProductInput  = z.infer<typeof CreateProductSchema>
export type UpdateProductInput  = z.infer<typeof UpdateProductSchema>
export type CreateVariantInput  = z.infer<typeof CreateVariantSchema>
export type UpdateVariantInput  = z.infer<typeof UpdateVariantSchema>
export type ListProductsQuery   = z.infer<typeof ListProductsQuerySchema>


export async function listProducts(query: ListProductsQuery) {
  await dbConnect()

  const filter: Record<string, unknown> = { isActive: true }

  if (query.search) {
    const regex = new RegExp(query.search, 'i')
    filter.$or = [{ name: regex }, { nameAr: regex }, { tags: regex }]
  }
  if (query.category) {
    filter.category = new mongoose.Types.ObjectId(query.category)
  }
  if (query.isAvailableInWeb !== undefined) {
    filter.isAvailableInWeb = query.isAvailableInWeb
  }
  if (query.isFeatured !== undefined) {
    filter.isFeatured = query.isFeatured
  }

  const skip  = (query.page - 1) * query.limit
  const total = await Product.countDocuments(filter)

  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(query.limit)
    .populate('category', 'name nameAr slug')  
    .lean()

  const productIds = products.map(p => p._id)
  const variants   = await ProductVariant.find({ productId: { $in: productIds }, })
    .lean()

  const variantMap = new Map<string, typeof variants>()
  for (const v of variants) {
    const key = v.productId.toString()
    if (!variantMap.has(key)) variantMap.set(key, [])
    variantMap.get(key)!.push(v)
  }

  const result = products.map(p => ({
    ...p,
    variants: variantMap.get(p._id.toString()) ?? [],
  }))

  return { result, total }
}

/**
 * Get a single product with all variants.
 */
export async function getProductById(id: string) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const product = await Product.findOne({ _id: id, isActive: true })
    .populate('category', 'name nameAr slug')
    .lean()

  if (!product) return null

  const variants = await ProductVariant.find({ productId: id }).lean()

  return { ...product, variants }
}


export async function createProduct(input: CreateProductInput, createdBy: string) {
  await dbConnect()

  // Check category exists
  const { Category } = await import('@/models/Category')
  const catExists = await Category.exists({ _id: input.category, isActive: true })
  if (!catExists) throw new Error('Category not found')

  // Check SKU uniqueness before starting the transaction
  const skuTaken = await ProductVariant.exists({ sku: input.defaultVariant.sku })
  if (skuTaken) throw new Error(`SKU "${input.defaultVariant.sku}" is already in use`)

  // Open a MongoDB session for the transaction
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Create the product container
    const [product] = await Product.create(
      [{
        name:             input.name,
        nameAr:           input.nameAr,
        description:      input.description,
        descriptionAr:    input.descriptionAr,
        category:         new mongoose.Types.ObjectId(input.category),
        allergens:        input.allergens,
        tags:             input.tags,
        images:           input.images,
        isFeatured:       input.isFeatured,
        isAvailableInWeb: input.isAvailableInWeb,
        createdBy:        new mongoose.Types.ObjectId(createdBy),
      }],
      { session }
    )

    // Create the default variant
    const [variant] = await ProductVariant.create(
      [{
        productId:        product._id,
        name:             input.defaultVariant.name,
        nameAr:           input.defaultVariant.nameAr,
        sku:              input.defaultVariant.sku,
        priceUSD:         input.defaultVariant.priceUSD,
        priceLBP:         input.defaultVariant.priceLBP,
        bom:              input.defaultVariant.bom.map(b => ({
          ...b,
          materialId: new mongoose.Types.ObjectId(b.materialId),
        })),
        isDefault:        true,
        isAvailable:      true,
        isAvailableInWeb: input.defaultVariant.isAvailableInWeb,
        createdBy:        new mongoose.Types.ObjectId(createdBy),
      }],
      { session }
    )

    await session.commitTransaction()
    return { ...product.toObject(), variants: [variant.toObject()] }
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

/**
 * Update product-level fields only (not variants).
 */
export async function updateProduct(id: string, input: UpdateProductInput) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(id)) return null

  return Product.findOneAndUpdate(
    { _id: id, isActive: true },
    { $set: input },
    { new: true, runValidators: true }
  ).lean()
}

/**
 * Soft-delete a product and all its variants.
 */
export async function deleteProduct(id: string) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const product = await Product.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true, session }
    )
    if (!product) { await session.abortTransaction(); return null }

    // Cascade soft-delete to all variants
    await ProductVariant.updateMany(
      { productId: id },
      { isAvailable: false },
      { session }
    )

    await session.commitTransaction()
    return product.toObject()
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

// ── Service: Variants ─────────────────────────────────────────────────────────

/**
 * Add a new variant to an existing product.
 *
 * Business rules enforced here:
 *   - Product must exist and be active
 *   - SKU must be globally unique
 *   - If isDefault: true, the existing default variant is demoted
 */
export async function createVariant(
  productId: string,
  input: CreateVariantInput,
  createdBy: string
) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Invalid product ID')

  const productExists = await Product.exists({ _id: productId, isActive: true })
  if (!productExists) throw new Error('Product not found')

  const skuTaken = await ProductVariant.exists({ sku: input.sku })
  if (skuTaken) throw new Error(`SKU "${input.sku}" is already in use`)

  // If this new variant is set as default, remove the flag from the current default
  if (input.isDefault) {
    await ProductVariant.updateOne(
      { productId, isDefault: true },
      { $set: { isDefault: false } }
    )
  }

  const variant = await ProductVariant.create({
    ...input,
    productId: new mongoose.Types.ObjectId(productId),
    bom: (input.bom ?? []).map(b => ({
      ...b,
      materialId: new mongoose.Types.ObjectId(b.materialId),
    })),
    createdBy: new mongoose.Types.ObjectId(createdBy),
  })

  return variant.toObject()
}

/**
 * Update a variant.
 * Cannot change the productId (variants don't move between products).
 */
export async function updateVariant(
  productId: string,
  variantId: string,
  input: UpdateVariantInput
) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(variantId)) {
    return null
  }

  // If promoting to default, demote the current default first
  if (input.isDefault) {
    await ProductVariant.updateOne(
      { productId, isDefault: true, _id: { $ne: variantId } },
      { $set: { isDefault: false } }
    )
  }

  const update: Record<string, unknown> = { ...input }

  // Re-cast materialIds to ObjectIds if BOM is being updated
  if (input.bom) {
    update.bom = input.bom.map(b => ({
      ...b,
      materialId: new mongoose.Types.ObjectId(b.materialId),
    }))
  }

  return ProductVariant.findOneAndUpdate(
    { _id: variantId, productId },
    { $set: update },
    { new: true, runValidators: true }
  ).lean()
}

/**
 * Delete a variant.
 * Business rule: cannot delete the last variant of a product,
 * and cannot delete the default variant unless another is promoted first.
 */
export async function deleteVariant(productId: string, variantId: string) {
  await dbConnect()

  const variantCount = await ProductVariant.countDocuments({ productId })
  if (variantCount <= 1) {
    throw new Error(
      'Cannot delete the last variant. Delete the product instead, or add another variant first.'
    )
  }

  const variant = await ProductVariant.findOne({ _id: variantId, productId })
  if (!variant) return null

  if (variant.isDefault) {
    throw new Error(
      'Cannot delete the default variant. Promote another variant to default first.'
    )
  }

  return ProductVariant.findByIdAndDelete(variantId).lean()
}