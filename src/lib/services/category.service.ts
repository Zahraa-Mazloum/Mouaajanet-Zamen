// src/lib/services/category.service.ts


import mongoose from 'mongoose'
import { z } from 'zod'
import { Category } from '@/models/Category'
import dbConnect from '@/lib/dbConnect'


export const CreateCategorySchema = z.object({
  name:         z.string().min(1).max(100).trim(),
  nameAr:       z.string().min(1).max(100).trim(),
  slug:         z.string().min(1).max(100).toLowerCase().trim()
                  .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  parent:       z.string().optional().nullable(), 
  image:        z.string().url().optional().or(z.literal('')),
  displayOrder: z.number().int().min(0).default(0),
})

export const UpdateCategorySchema = CreateCategorySchema.partial()

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>


/**
 * List all active categories, optionally filtered by parent.
 * Returns a flat list — the frontend builds the tree if needed.
 *
 * ?parent=null         → top-level categories only
 * ?parent=<ObjectId>   → children of that category
 * (no param)           → all categories
 */
export async function listCategories(parentFilter?: string | null) {
  await dbConnect()

  const query: Record<string, unknown> = { isActive: true }

  if (parentFilter === 'null') {
    query.parent = null
  } else if (parentFilter) {
    query.parent = new mongoose.Types.ObjectId(parentFilter)
  }

  return Category.find(query)
    .sort({ displayOrder: 1, name: 1 })
    .lean()
}

/**
 * Get a single category by ID.
 * Returns null if not found or soft-deleted.
 */
export async function getCategoryById(id: string) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(id)) return null

  return Category.findOne({ _id: id, isActive: true }).lean()
}

/**
 * Create a new category.
 * Throws if slug is already in use.
 */
export async function createCategory(input: CreateCategoryInput, createdBy: string) {
  await dbConnect()

  // Validate parent exists if provided
  if (input.parent) {
    if (!mongoose.Types.ObjectId.isValid(input.parent)) {
      throw new Error('Invalid parent category ID')
    }
    const parentExists = await Category.exists({ _id: input.parent, isActive: true })
    if (!parentExists) throw new Error('Parent category does not exist')
  }

  const exists = await Category.exists({ slug: input.slug })
  if (exists) throw new Error(`Slug "${input.slug}" is already taken`)

  const category = await Category.create({
    ...input,
    parent: input.parent ? new mongoose.Types.ObjectId(input.parent) : null,
    createdBy: new mongoose.Types.ObjectId(createdBy),
  })

  return category.toObject()
}

/**
 * Update a category's fields (partial update — PATCH semantics).
 * Returns null if not found.
 */
export async function updateCategory(id: string, input: UpdateCategoryInput) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(id)) return null

  // If slug is changing, check uniqueness
  if (input.slug) {
    const conflict = await Category.exists({ slug: input.slug, _id: { $ne: id } })
    if (conflict) throw new Error(`Slug "${input.slug}" is already taken`)
  }

  return Category.findOneAndUpdate(
    { _id: id, isActive: true },
    { $set: input },
    { new: true, runValidators: true }
  ).lean()
}

/**
 * Soft-delete a category.
 * Also checks: refuse if any product is currently assigned to this category.
 * (Hard delete would break product → category references)
 */
export async function deleteCategory(id: string) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(id)) return null

  // Prevent deletion if products use this category
  const { Product } = await import('@/models/Product')
  const productCount = await Product.countDocuments({ category: id, isActive: true })
  if (productCount > 0) {
    throw new Error(
      `Cannot delete: ${productCount} product(s) are assigned to this category. Reassign them first.`
    )
  }

  // Prevent deletion if sub-categories exist
  const childCount = await Category.countDocuments({ parent: id, isActive: true })
  if (childCount > 0) {
    throw new Error(
      `Cannot delete: this category has ${childCount} sub-categor${childCount === 1 ? 'y' : 'ies'}. Delete or reassign them first.`
    )
  }

  return Category.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean()
}