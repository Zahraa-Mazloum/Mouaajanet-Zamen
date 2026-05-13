// src/app/api/categories/route.ts

import { requireAuth }         from '@/lib/apiAuth'
import { ok, created, serverError, badRequest } from '@/lib/apiResponse'
import { validateBody }        from '@/lib/apiValidate'
import { NextResponse }        from 'next/server'
import {
  listCategories,
  createCategory,
  CreateCategorySchema,
} from '@/lib/services/category.service'

// ── GET /api/categories ───────────────────────────────────────────────────────
// Public-ish: any authenticated user can read categories.
// Query params:
//   ?parent=null        → top-level only
//   ?parent=<id>        → children of a category
//   (none)              → all active categories

export async function GET(request: Request) {
  // Step 1 — Auth
  const guard = await requireAuth(request, 'products', 'read')
  if (guard instanceof NextResponse) return guard

  try {
    // Step 2 — Parse optional query param (no Zod needed, it's simple)
    const url    = new URL(request.url)
    const parent = url.searchParams.has('parent') ? url.searchParams.get('parent') : undefined

    // Step 3 — Service
    const categories = await listCategories(parent ?? undefined)

    // Step 4 — Respond
    return ok(categories)
  } catch (err) {
    return serverError(err)
  }
}

// ── POST /api/categories ──────────────────────────────────────────────────────
// Only managers and developers can create categories.

export async function POST(request: Request) {
  // Step 1 — Auth + RBAC
  const guard = await requireAuth(request, 'products', 'write')
  if (guard instanceof NextResponse) return guard

  // Step 2 — Validate body
  const body = await validateBody(request, CreateCategorySchema)
  if (body instanceof NextResponse) return body

  try {
    // Step 3 — Service
    const category = await createCategory(body, guard.session.user.id)

    // Step 4 — 201 Created
    return created(category)
  } catch (err) {
    // Slug conflict is a known business error — return 409, not 500
    if (err instanceof Error && err.message.includes('already taken')) {
      return badRequest(err.message)
    }
    return serverError(err)
  }
}