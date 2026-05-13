// src/app/api/inventory/materials/route.ts
import { requireAuth }  from '@/lib/apiAuth'
import { ok, created, serverError } from '@/lib/apiResponse'
import { validateBody, validateQuery } from '@/lib/apiValidate'
import { buildMeta }    from '@/lib/apiResponse'
import { NextResponse } from 'next/server'
import {
  listMaterials,
  createMaterial,
  CreateMaterialSchema,
  ListMaterialsQuerySchema,
} from '@/lib/services/Inventory.service'

export async function GET(request: Request) {
  const guard = await requireAuth(request, 'inventory', 'read')
  if (guard instanceof NextResponse) return guard

  const query = validateQuery(request, ListMaterialsQuerySchema)
  if (query instanceof NextResponse) return query

  try {
    const { materials, total } = await listMaterials(query)
    return ok(materials, buildMeta(total, query.page, query.limit))
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth(request, 'inventory', 'write')
  if (guard instanceof NextResponse) return guard

  const body = await validateBody(request, CreateMaterialSchema)
  if (body instanceof NextResponse) return body

  try {
    const material = await createMaterial(body, guard.session.user.id)
    return created(material)
  } catch (err) {
    return serverError(err)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// src/app/api/inventory/materials/[id]/route.ts
// (In your project, split these into separate files per folder)
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/inventory/materials/:id
// PATCH /api/inventory/materials/:id

import {
  getMaterialById,
  updateMaterial,
  UpdateMaterialSchema,
} from '@/lib/services/Inventory.service'
import { notFound } from '@/lib/apiResponse'

export async function getMaterial(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth(request, 'inventory', 'read')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    const material = await getMaterialById(id)
    if (!material) return notFound('Raw material')
    return ok(material)
  } catch (err) {
    return serverError(err)
  }
}

export async function patchMaterial(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth(request, 'inventory', 'write')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const body = await validateBody(request, UpdateMaterialSchema)
  if (body instanceof NextResponse) return body

  try {
    const updated = await updateMaterial(id, body)
    if (!updated) return notFound('Raw material')
    return ok(updated)
  } catch (err) {
    return serverError(err)
  }
}