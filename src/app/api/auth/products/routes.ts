// src/app/api/products/route.ts

import { requireAuth }  from '@/lib/apiAuth'
import { ok, created, serverError, badRequest } from '@/lib/apiResponse'
import { validateBody, validateQuery }           from '@/lib/apiValidate'
import { buildMeta }    from '@/lib/apiResponse'
import { NextResponse } from 'next/server'
import {
  listProducts,
  createProduct,
  CreateProductSchema,
  ListProductsQuerySchema,
} from '@/lib/services/product.service'

// ── GET /api/products ─────────────────────────────────────────────────────────
// Supported query params (all optional):
//   ?page=1 &limit=20
//   ?search=knafeh           → searches name, nameAr, tags
//   ?category=<ObjectId>
//   ?isAvailableInWeb=true   → filter for online store
//   ?isFeatured=true
//   ?lowStock=true           → products with at least one low-stock material

export async function GET(request: Request) {
  const guard = await requireAuth(request, 'products', 'read')
  if (guard instanceof NextResponse) return guard

  // Validate and coerce all query params at once
  const query = validateQuery(request, ListProductsQuerySchema)
  if (query instanceof NextResponse) return query

  try {
    const { result, total } = await listProducts(query)
    const meta = buildMeta(total, query.page, query.limit)
    return ok(result, meta)
  } catch (err) {
    return serverError(err)
  }
}

// ── POST /api/products ────────────────────────────────────────────────────────
// Creates product + first variant in one atomic transaction.

export async function POST(request: Request) {
  const guard = await requireAuth(request, 'products', 'write')
  if (guard instanceof NextResponse) return guard

  const body = await validateBody(request, CreateProductSchema)
  if (body instanceof NextResponse) return body

  try {
    const product = await createProduct(body, guard.session.user.id)
    return created(product)
  } catch (err) {
    if (err instanceof Error) {
      if (
        err.message.includes('SKU') ||
        err.message.includes('Category not found')
      ) {
        return badRequest(err.message)
      }
    }
    return serverError(err)
  }
}