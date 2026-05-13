// src/app/api/products/[id]/variants/route.ts
//
// GET  /api/products/:id/variants   → list all variants for a product
// POST /api/products/:id/variants   → add a new variant to the product

import { requireAuth }  from '@/lib/apiAuth'
import { ok, created, serverError, badRequest } from '@/lib/apiResponse'
import { validateBody } from '@/lib/apiValidate'
import { NextResponse } from 'next/server'
import { ProductVariant } from '@/models/Productvariant'
import dbConnect from '@/lib/dbConnect'
import {
  createVariant,
  CreateVariantSchema,
} from '@/lib/services/product.service'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'products', 'read')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    await dbConnect()
    const variants = await ProductVariant.find({ productId: id })
      .sort({ displayOrder: 1 })
      .lean()
    return ok(variants)
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'products', 'write')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const body = await validateBody(request, CreateVariantSchema)
  if (body instanceof NextResponse) return body

  try {
    const variant = await createVariant(id, body, guard.session.user.id)
    return created(variant)
  } catch (err) {
    if (err instanceof Error && (
      err.message.includes('SKU') ||
      err.message.includes('Product not found') ||
      err.message.includes('Invalid')
    )) {
      return badRequest(err.message)
    }
    return serverError(err)
  }
}