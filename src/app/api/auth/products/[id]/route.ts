// src/app/api/products/[id]/route.ts
//
// GET    /api/products/:id    → single product + all variants
// PATCH  /api/products/:id    → update product fields
// DELETE /api/products/:id    → soft-delete product + variants

import { requireAuth }  from '@/lib/apiAuth'
import { ok, notFound, serverError, noContent } from '@/lib/apiResponse'
import { validateBody } from '@/lib/apiValidate'
import { NextResponse } from 'next/server'
import {
  getProductById,
  updateProduct,
  deleteProduct,
  UpdateProductSchema,
} from '@/lib/services/product.service'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'products', 'read')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    const product = await getProductById(id)
    if (!product) return notFound('Product')
    return ok(product)
  } catch (err) {
    return serverError(err)
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'products', 'write')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const body = await validateBody(request, UpdateProductSchema)
  if (body instanceof NextResponse) return body

  try {
    const updated = await updateProduct(id, body)
    if (!updated) return notFound('Product')
    return ok(updated)
  } catch (err) {
    return serverError(err)
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'products', 'delete')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    const deleted = await deleteProduct(id)
    if (!deleted) return notFound('Product')
    return noContent()
  } catch (err) {
    return serverError(err)
  }
}