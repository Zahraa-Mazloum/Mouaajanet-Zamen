// src/app/api/products/[id]/variants/[variantId]/route.ts
//
// PATCH  /api/products/:id/variants/:variantId
// DELETE /api/products/:id/variants/:variantId

import { requireAuth }  from '@/lib/apiAuth'
import { ok, notFound, serverError, badRequest, noContent } from '@/lib/apiResponse'
import { validateBody } from '@/lib/apiValidate'
import { NextResponse } from 'next/server'
import {
  updateVariant,
  deleteVariant,
  UpdateVariantSchema,
} from '@/lib/services/product.service'

type Params = { params: Promise<{ id: string; variantId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'products', 'write')
  if (guard instanceof NextResponse) return guard

  const { id, variantId } = await params

  const body = await validateBody(request, UpdateVariantSchema)
  if (body instanceof NextResponse) return body

  try {
    const updated = await updateVariant(id, variantId, body)
    if (!updated) return notFound('Variant')
    return ok(updated)
  } catch (err) {
    if (err instanceof Error && err.message.includes('SKU')) {
      return badRequest(err.message)
    }
    return serverError(err)
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'products', 'delete')
  if (guard instanceof NextResponse) return guard

  const { id, variantId } = await params

  try {
    const deleted = await deleteVariant(id, variantId)
    if (!deleted) return notFound('Variant')
    return noContent()
  } catch (err) {
    if (err instanceof Error && (
      err.message.includes('last variant') ||
      err.message.includes('default variant')
    )) {
      return badRequest(err.message)
    }
    return serverError(err)
  }
}