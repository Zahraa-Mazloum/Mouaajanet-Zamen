// src/lib/services/inventory.service.ts
//
// Covers: RawMaterial CRUD, StockMovement queries,
//         StockAlert management, PurchaseOrder lifecycle.
//
// Stock mutation (AVCO recalc, deductions, movements) lives in:
//   src/lib/inventory.ts  (the moveStock / deductStockForOrder / receivePurchaseOrder
//   functions from the schemas session — do not duplicate that logic here)
//
// This service handles the READ and management side of inventory.

import mongoose from 'mongoose'
import { z }    from 'zod'
import { RawMaterial }    from '@/models/RawMaterial'
import { StockMovement }  from '@/models/Stockmovement'
import { StockAlert }     from '@/models/StockAlert'
import { PurchaseOrder }  from '@/models/Purchaseorder'
import dbConnect          from '@/lib/dbConnect'

// ── Zod Schemas ───────────────────────────────────────────────────────────────

export const CreateMaterialSchema = z.object({
  name:         z.string().min(1).max(100).trim(),
  nameAr:       z.string().min(1).max(100).trim(),
  unit:         z.enum(['g', 'kg', 'ml', 'l', 'pcs', 'box']),
  currentStock: z.number().nonnegative().default(0),
  reorderLevel: z.number().nonnegative().default(0),
  supplierId:   z.string().optional().nullable(),
})

export const UpdateMaterialSchema = CreateMaterialSchema.partial()

export const ListMaterialsQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  search:    z.string().optional(),
  lowStock:  z.enum(['true', 'false']).optional(),  // query params come as strings
  supplier:  z.string().optional(),
})

export const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().optional().nullable(),
  notes:      z.string().optional().default(''),
  expectedAt: z.string().datetime({ offset: true }).optional().nullable(),
  items: z.array(z.object({
    materialId:      z.string().min(1),
    quantityOrdered: z.number().positive(),
    unitCost:        z.number().nonnegative(),
    unit:            z.string().min(1),
  })).min(1, 'A purchase order must have at least one item'),
})

// When the manager clicks "Receive" — they input what actually arrived
export const ReceivePOSchema = z.object({
  receipts: z.array(z.object({
    materialId:       z.string().min(1),
    quantityReceived: z.number().nonnegative(),
    unitCost:         z.number().nonnegative(),
  })).min(1),
})

export type CreateMaterialInput     = z.infer<typeof CreateMaterialSchema>
export type UpdateMaterialInput     = z.infer<typeof UpdateMaterialSchema>
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>
export type ReceivePOInput          = z.infer<typeof ReceivePOSchema>

// ── Raw Materials ─────────────────────────────────────────────────────────────

export async function listMaterials(query: z.infer<typeof ListMaterialsQuerySchema>) {
  await dbConnect()

  const filter: Record<string, unknown> = { isActive: true }

  if (query.search) {
    const regex = new RegExp(query.search, 'i')
    filter.$or = [{ name: regex }, { nameAr: regex }]
  }

  // lowStock filter: materials where currentStock <= reorderLevel
  if (query.lowStock === 'true') {
    filter.$expr = { $lte: ['$currentStock', '$reorderLevel'] }
  }

  if (query.supplier) {
    filter.supplierId = new mongoose.Types.ObjectId(query.supplier)
  }

  const skip  = (query.page - 1) * query.limit
  const total = await RawMaterial.countDocuments(filter)

  const materials = await RawMaterial.find(filter)
    .sort({ name: 1 })
    .skip(skip)
    .limit(query.limit)
    .lean()

  return { materials, total }
}

export async function getMaterialById(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  return RawMaterial.findOne({ _id: id, isActive: true }).lean()
}

export async function createMaterial(input: CreateMaterialInput, createdBy: string) {
  await dbConnect()

  // avcoUnitCost starts at 0 — it will be set on the first purchase receipt
  const material = await RawMaterial.create({
    ...input,
    avcoUnitCost: 0,
    supplierId:   input.supplierId ? new mongoose.Types.ObjectId(input.supplierId) : null,
    createdBy:    new mongoose.Types.ObjectId(createdBy),
  })

  return material.toObject()
}

export async function updateMaterial(id: string, input: UpdateMaterialInput) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  return RawMaterial.findOneAndUpdate(
    { _id: id, isActive: true },
    { $set: input },
    { new: true, runValidators: true }
  ).lean()
}

// ── Stock Movements ───────────────────────────────────────────────────────────

/**
 * Returns the movement history for a material, newest first.
 * This powers the "Stock History" drawer in the UI.
 */
export async function getMaterialMovements(
  materialId: string,
  page = 1,
  limit = 30
) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(materialId)) return { movements: [], total: 0 }

  const filter = { materialId: new mongoose.Types.ObjectId(materialId) }
  const total  = await StockMovement.countDocuments(filter)
  const skip   = (page - 1) * limit

  const movements = await StockMovement.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'name')      // show who made each movement
    .lean()

  return { movements, total }
}

// ── Stock Alerts ──────────────────────────────────────────────────────────────

/**
 * List stock alerts with optional status filter.
 * The sidebar badge uses ?status=open&limit=100 to get the count.
 */
export async function listAlerts(status?: string) {
  await dbConnect()

  const filter: Record<string, unknown> = {}
  if (status) filter.status = status

  return StockAlert.find(filter)
    .sort({ createdAt: -1 })
    .populate('materialId', 'name nameAr unit currentStock reorderLevel')
    .populate('purchaseOrderId', 'poNumber status')
    .lean()
}

/**
 * Acknowledge an alert — called when manager creates a PO for it.
 * Links the PO to the alert and moves status to 'acknowledged'.
 */
export async function acknowledgeAlert(alertId: string, purchaseOrderId: string) {
  await dbConnect()

  return StockAlert.findByIdAndUpdate(
    alertId,
    { $set: { status: 'acknowledged', purchaseOrderId } },
    { new: true }
  ).lean()
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

/**
 * Generate the next PO number: PO-2026-0001, PO-2026-0002, etc.
 * Uses countDocuments for the year to keep numbers sequential per year.
 */
async function generatePoNumber(): Promise<string> {
  const year  = new Date().getFullYear()
  const start = new Date(`${year}-01-01`)
  const end   = new Date(`${year + 1}-01-01`)

  const count = await PurchaseOrder.countDocuments({
    createdAt: { $gte: start, $lt: end },
  })

  const seq = String(count + 1).padStart(4, '0')
  return `PO-${year}-${seq}`
}

export async function listPurchaseOrders(status?: string) {
  await dbConnect()

  const filter: Record<string, unknown> = {}
  if (status) filter.status = status

  return PurchaseOrder.find(filter)
    .sort({ createdAt: -1 })
    .populate('supplierId', 'name')
    .populate('createdBy', 'name')
    .lean()
}

export async function getPurchaseOrderById(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  return PurchaseOrder.findById(id)
    .populate('supplierId', 'name')
    .populate('createdBy', 'name')
    .populate('items.materialId', 'name nameAr unit avcoUnitCost')
    .lean()
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  createdBy: string
) {
  await dbConnect()

  const poNumber = await generatePoNumber()

  const poData: Record<string, unknown> = {
    poNumber,
    supplierId: input.supplierId ? new mongoose.Types.ObjectId(input.supplierId) : null,
    notes:      input.notes,
    status:     'draft',
    items: input.items.map(item => ({
      materialId:       new mongoose.Types.ObjectId(item.materialId),
      quantityOrdered:  item.quantityOrdered,
      quantityReceived: 0,
      unitCost:         item.unitCost,
      unit:             item.unit,
    })),
    createdBy: new mongoose.Types.ObjectId(createdBy),
  }

  if (input.expectedAt) {
    poData.expectedAt = new Date(input.expectedAt)
  }

  const po = await PurchaseOrder.create(poData)

  return po.toObject()
}

/**
 * Transition PO to 'ordered' status (sent to supplier).
 */
export async function markOrdered(id: string) {
  await dbConnect()

  return PurchaseOrder.findOneAndUpdate(
    { _id: id, status: 'draft' },
    { $set: { status: 'ordered', orderedAt: new Date() } },
    { new: true }
  ).lean()
}

/**
 * Receive a PO — this is the big one.
 * Delegates to the moveStock service for AVCO + movement logging.
 * Updates quantityReceived per item.
 * Sets status to 'received' or 'partially_received'.
 */
export async function receivePurchaseOrder(
  id: string,
  input: ReceivePOInput,
  createdBy: string
) {
  await dbConnect()

  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const po = await PurchaseOrder.findById(id)
  if (!po) return null
  if (!['ordered', 'partially_received'].includes(po.status)) {
    throw new Error(`Cannot receive a PO with status "${po.status}"`)
  }

  // Import the inventory mutation service (avoids circular dep at module load)
  const { receivePurchaseOrder: receiveStock } = await import('@/lib/inventory')

  // Run AVCO recalculation + stock movements + alert resolution
  await receiveStock(
    new mongoose.Types.ObjectId(id),
    input.receipts.map(r => ({
      materialId:       new mongoose.Types.ObjectId(r.materialId),
      quantityReceived: r.quantityReceived,
      unitCost:         r.unitCost,
    })),
    new mongoose.Types.ObjectId(createdBy)
  )

  // Update quantityReceived on each PO item
  for (const receipt of input.receipts) {
    await PurchaseOrder.updateOne(
      { _id: id, 'items.materialId': new mongoose.Types.ObjectId(receipt.materialId) },
      { $inc: { 'items.$.quantityReceived': receipt.quantityReceived } }
    )
  }

  // Determine new status: are all items fully received?
  const updatedPo = await PurchaseOrder.findById(id)
  const allReceived = updatedPo!.items.every(
    item => item.quantityReceived >= item.quantityOrdered
  )

  const newStatus = allReceived ? 'received' : 'partially_received'
  const receivedAt = allReceived ? new Date() : undefined

  return PurchaseOrder.findByIdAndUpdate(
    id,
    { $set: { status: newStatus, ...(receivedAt ? { receivedAt } : {}) } },
    { new: true }
  ).lean()
}