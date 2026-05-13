// src/app/api/categories/[id]/route.ts


import { requireAuth }  from '@/lib/apiAuth'
import { ok, notFound, serverError, badRequest, noContent } from '@/lib/apiResponse'
import { validateBody } from '@/lib/apiValidate'
import { NextResponse }  from 'next/server'
import {
  getCategoryById,
  updateCategory,
  deleteCategory,
  UpdateCategorySchema,
} from '@/lib/services/category.service'

// ── GET /api/categories/:id ───────────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth(request, 'products', 'read')
  if (guard instanceof NextResponse) return guard

  const { id } = await params   

  try {
    const category = await getCategoryById(id)
    if (!category) return notFound('Category')
    return ok(category)
  } catch (err) {
    return serverError(err)
  }
}

// ── PATCH /api/categories/:id ─────────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth(request, 'products', 'write')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const body = await validateBody(request, UpdateCategorySchema)
  if (body instanceof NextResponse) return body

  try {
    const updated = await updateCategory(id, body)
    if (!updated) return notFound('Category')
    return ok(updated)
  } catch (err) {
    if (err instanceof Error && err.message.includes('already taken')) {
      return badRequest(err.message)
    }
    return serverError(err)
  }
}

// ── DELETE /api/categories/:id ────────────────────────────────────────────────
// Soft-delete only. The service checks for assigned products first.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth(request, 'products', 'delete')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    const deleted = await deleteCategory(id)
    if (!deleted) return notFound('Category')
    return noContent()    
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Cannot delete')) {
      return badRequest(err.message)
    }
    return serverError(err)
  }
}