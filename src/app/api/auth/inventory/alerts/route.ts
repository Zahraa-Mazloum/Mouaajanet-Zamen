// src/app/api/inventory/alerts/route.ts
//
// GET /api/inventory/alerts?status=open
// Used by the sidebar badge (count) and the alerts management page.

import { requireAuth }  from '@/lib/apiAuth'
import { ok, serverError } from '@/lib/apiResponse'
import { NextResponse } from 'next/server'
import { listAlerts }   from '@/lib/services/Inventory.service'
import { buildMeta }    from '@/lib/apiResponse'


export async function GET(request: Request) {
  const guard = await requireAuth(request, 'inventory', 'read')
  if (guard instanceof NextResponse) return guard

  try {
    const url    = new URL(request.url)
    const status = url.searchParams.get('status') ?? undefined
    const alerts = await listAlerts(status)
    return ok(alerts)
  } catch (err) {
    return serverError(err)
  }
}

// =============================================================================
// src/app/api/inventory/alerts/[id]/route.ts
//
// PATCH /api/inventory/alerts/:id
// Body: { status: 'acknowledged', purchaseOrderId: '...' }
//       { status: 'resolved' }
// =============================================================================

import { z } from 'zod'
import { validateBody } from '@/lib/apiValidate'
import { acknowledgeAlert } from '@/lib/services/Inventory.service'
import { notFound, badRequest } from '@/lib/apiResponse'

const PatchAlertSchema = z.object({
  status:          z.enum(['acknowledged', 'resolved']),
  purchaseOrderId: z.string().optional(),
})

export async function patchAlert(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth(request, 'inventory', 'write')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const body = await validateBody(request, PatchAlertSchema)
  if (body instanceof NextResponse) return body

  try {
    if (body.status === 'acknowledged') {
      if (!body.purchaseOrderId) {
        return badRequest('purchaseOrderId is required when acknowledging an alert')
      }
      const updated = await acknowledgeAlert(id, body.purchaseOrderId)
      if (!updated) return notFound('Alert')
      return ok(updated)
    }

    // 'resolved' is handled automatically by receivePurchaseOrder —
    // but allow manual resolution here for edge cases
    const { StockAlert } = await import('@/models/StockAlert')
    const updated = await StockAlert.findByIdAndUpdate(
      id,
      { $set: { status: 'resolved', resolvedAt: new Date() } },
      { new: true }
    ).lean()
    if (!updated) return notFound('Alert')
    return ok(updated)
  } catch (err) {
    return serverError(err)
  }
}

// =============================================================================
// src/app/api/inventory/purchase-orders/route.ts
//
// GET  /api/inventory/purchase-orders?status=draft
// POST /api/inventory/purchase-orders
// =============================================================================

import {
  listPurchaseOrders,
  createPurchaseOrder,
  CreatePurchaseOrderSchema,
} from '@/lib/services/Inventory.service'
import { created } from '@/lib/apiResponse'

export async function getPOs(request: Request) {
  const guard = await requireAuth(request, 'inventory', 'read')
  if (guard instanceof NextResponse) return guard

  try {
    const url    = new URL(request.url)
    const status = url.searchParams.get('status') ?? undefined
    const orders = await listPurchaseOrders(status)
    return ok(orders)
  } catch (err) {
    return serverError(err)
  }
}

export async function postPO(request: Request) {
  const guard = await requireAuth(request, 'inventory', 'write')
  if (guard instanceof NextResponse) return guard

  const body = await validateBody(request, CreatePurchaseOrderSchema)
  if (body instanceof NextResponse) return body

  try {
    const po = await createPurchaseOrder(body, guard.session.user.id)
    return created(po)
  } catch (err) {
    return serverError(err)
  }
}

// =============================================================================
// src/app/api/inventory/purchase-orders/[id]/receive/route.ts
//
// POST /api/inventory/purchase-orders/:id/receive
//
// This is the most important inventory endpoint.
// It runs: AVCO recalc → stock movements → alert resolution → PO status update.
// Everything is handled inside receivePurchaseOrder() in the service.
// =============================================================================

import {
  receivePurchaseOrder,
  ReceivePOSchema,
} from '@/lib/services/Inventory.service'

export async function receivePO(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth(request, 'inventory', 'write')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const body = await validateBody(request, ReceivePOSchema)
  if (body instanceof NextResponse) return body

  try {
    const updated = await receivePurchaseOrder(id, body, guard.session.user.id)
    if (!updated) return notFound('Purchase order')
    return ok(updated)
  } catch (err) {
    if (err instanceof Error && err.message.includes('Cannot receive')) {
      return badRequest(err.message)
    }
    return serverError(err)
  }
}

// =============================================================================
// src/app/api/inventory/materials/[id]/movements/route.ts
//
// GET /api/inventory/materials/:id/movements?page=1&limit=30
//
// Returns the full stock movement history for a material.
// Powers the "Stock History" side drawer in the UI.
// =============================================================================

import { getMaterialMovements } from '@/lib/services/Inventory.service'

export async function getMovements(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAuth(request, 'inventory', 'read')
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const url     = new URL(request.url)
  const page    = Math.max(1, Number(url.searchParams.get('page')  ?? 1))
  const limit   = Math.min(100, Number(url.searchParams.get('limit') ?? 30))

  try {
    const { movements, total } = await getMaterialMovements(id, page, limit)
    return ok(movements, buildMeta(total, page, limit))
  } catch (err) {
    return serverError(err)
  }
}