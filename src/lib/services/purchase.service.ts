// src/lib/services/purchase.service.ts
//
// ─── WHAT THIS SERVICE OWNS ────────────────────────────────────────────────────
//
//  SUPPLIERS
//    listSuppliers()             paginated, searchable, filterable by material
//    getSupplierById()           single supplier with materials populated
//    getSuppliersForMaterial()   "who sells cream cheese?" — used on alert page
//    createSupplier()
//    updateSupplier()
//    deleteSupplier()            soft delete, blocked if active POs exist
//
//  PURCHASE ORDERS (internal logging)
//    listPurchaseOrders()        paginated, filterable
//    getPurchaseOrderById()      full PO detail
//    createPurchaseOrder()       start a new purchase log entry
//    updatePurchaseOrder()       edit while still in draft
//    receivePurchaseOrder()      log what arrived → triggers stock + AVCO update
//    cancelPurchaseOrder()       void a mistake entry
//
// ─── THE ONE BOUNDARY WITH INVENTORY ──────────────────────────────────────────
// This service calls moveStock() from lib/inventory.ts when logging a receipt.
// That is the ONLY point where purchase touches inventory.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { z }    from 'zod'
import { Supplier }      from '@/models/Supplier'
import { PurchaseOrder } from '@/models/Purchaseorder'
import { RawMaterial }   from '@/models/RawMaterial'
import dbConnect         from '@/lib/dbConnect'

// ═════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═════════════════════════════════════════════════════════════════════════════

// ── Supplier ──────────────────────────────────────────────────────────────────

export const CreateSupplierSchema = z.object({
  name:          z.string().min(1, 'Supplier name is required').max(200).trim(),
  nameAr:        z.string().max(200).trim().default(''),
  phone:         z.string().max(30).trim().default(''),
  contactPerson: z.string().max(100).trim().default(''),
  address:       z.string().max(500).trim().default(''),
  notes:         z.string().max(1000).trim().default(''),
  // Array of RawMaterial ObjectId strings
  materials:     z.array(z.string()).default([]),
})

export const UpdateSupplierSchema = CreateSupplierSchema.partial()

export const ListSuppliersQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  search:   z.string().optional(),
  // Filter: only suppliers who carry a specific material
  // Used on the stock alert page: "cream cheese is low → who sells it?"
  material: z.string().optional(),
})

// ── Purchase Orders ───────────────────────────────────────────────────────────

const POItemSchema = z.object({
  materialId:      z.string().min(1, 'Material is required'),
  quantityOrdered: z.number().positive('Quantity must be greater than 0'),
  unitCost:        z.number().nonnegative('Cost cannot be negative'),
  // Unit is fetched from the material document — not supplied by the caller.
  // This prevents the frontend from accidentally sending "kg" for a material
  // that's measured in "g", which would silently corrupt AVCO calculations.
})

export const CreatePurchaseOrderSchema = z.object({
  supplierId:       z.string().optional().nullable(),
  purchaseCurrency: z.enum(['USD', 'LBP']).default('USD'),
  // purchaseDate: when you actually made the purchase
  // Defaults to now, but can be backdated (e.g. you're logging yesterday's trip)
  purchaseDate:     z.string().datetime({ offset: true }).optional(),
  notes:            z.string().max(1000).default(''),
  items: z.array(POItemSchema)
    .min(1, 'A purchase must have at least one item'),
})

// When editing a draft — all fields optional, same shape
export const UpdatePurchaseOrderSchema = z.object({
  supplierId:       z.string().optional().nullable(),
  purchaseCurrency: z.enum(['USD', 'LBP']).optional(),
  purchaseDate:     z.string().datetime({ offset: true }).optional(),
  notes:            z.string().max(1000).optional(),
  items:            z.array(POItemSchema).min(1).optional(),
})

export const ListPurchaseOrdersQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  status:     z.enum(['draft', 'received', 'partially_received', 'cancelled']).optional(),
  supplierId: z.string().optional(),
  // Date range filter — useful for monthly spend reports
  from:       z.string().datetime({ offset: true }).optional(),
  to:         z.string().datetime({ offset: true }).optional(),
  search:     z.string().optional(),   // searches PO number
})

// The receive payload: what actually arrived from this purchase trip
export const ReceivePOSchema = z.object({
  receipts: z.array(z.object({
    materialId:       z.string().min(1),
    quantityReceived: z.number().nonnegative(),
    // unitCostOverride: if the actual price differed from what you entered on the PO.
    // Common scenario: you planned to buy at $2/kg but the market price was $2.20/kg today.
    unitCostOverride: z.number().nonnegative().optional(),
  })).min(1),
  notes: z.string().optional(),
})

// Inferred types
export type CreateSupplierInput      = z.infer<typeof CreateSupplierSchema>
export type UpdateSupplierInput      = z.infer<typeof UpdateSupplierSchema>
export type ListSuppliersQuery       = z.infer<typeof ListSuppliersQuerySchema>
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>
export type UpdatePurchaseOrderInput = z.infer<typeof UpdatePurchaseOrderSchema>
export type ListPurchaseOrdersQuery  = z.infer<typeof ListPurchaseOrdersQuerySchema>
export type ReceivePOInput           = z.infer<typeof ReceivePOSchema>

// ═════════════════════════════════════════════════════════════════════════════
// SUPPLIER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

export async function listSuppliers(query: ListSuppliersQuery) {
  await dbConnect()

  const filter: Record<string, unknown> = { isActive: true }

  if (query.search) {
    const rx = new RegExp(query.search, 'i')
    filter.$or = [{ name: rx }, { nameAr: rx }, { contactPerson: rx }]
  }

  if (query.material) {
    // MongoDB checks if the materials array contains this ObjectId
    filter.materials = new mongoose.Types.ObjectId(query.material)
  }

  const skip  = (query.page - 1) * query.limit
  const total = await Supplier.countDocuments(filter)

  const suppliers = await Supplier.find(filter)
    .sort({ name: 1 })
    .skip(skip)
    .limit(query.limit)
    .populate('materials', 'name nameAr unit')   
    .lean()

  return { suppliers, total }
}

export async function getSupplierById(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  return Supplier.findOne({ _id: id, isActive: true })
    .populate('materials', 'name nameAr unit currentStock reorderLevel avcoUnitCost')
    .lean()
}

// Used on the Stock Alert page:
// "Semolina is below reorder level — here are all suppliers who sell it"
export async function getSuppliersForMaterial(materialId: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(materialId)) return []

  return Supplier.find({
    isActive:  true,
    materials: new mongoose.Types.ObjectId(materialId),
  })
    .select('name nameAr contactPerson phone notes')
    .lean()
}

export async function createSupplier(input: CreateSupplierInput, createdBy: string) {
  await dbConnect()

  // Validate that all provided material IDs actually exist
  if (input.materials.length > 0) {
    const valid = input.materials.filter(id => mongoose.Types.ObjectId.isValid(id))
    if (valid.length !== input.materials.length) {
      throw new Error('One or more material IDs have an invalid format')
    }
    const found = await RawMaterial.countDocuments({ _id: { $in: valid }, isActive: true })
    if (found !== valid.length) {
      throw new Error('One or more materials do not exist or have been deleted')
    }
  }

  const supplier = await Supplier.create({
    ...input,
    materials: input.materials.map(id => new mongoose.Types.ObjectId(id)),
    createdBy: new mongoose.Types.ObjectId(createdBy),
  })

  return supplier.toObject()
}

export async function updateSupplier(id: string, input: UpdateSupplierInput) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const update: Record<string, unknown> = { ...input }

  if (input.materials) {
    update.materials = input.materials.map(mid => new mongoose.Types.ObjectId(mid))
  }

  return Supplier.findOneAndUpdate(
    { _id: id, isActive: true },
    { $set: update },
    { new: true, runValidators: true }
  )
    .populate('materials', 'name nameAr unit')
    .lean()
}

export async function deleteSupplier(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  // Refuse deletion if any non-cancelled, non-received POs reference this supplier
  const activePOs = await PurchaseOrder.countDocuments({
    supplierId: id,
    status:     { $in: ['draft', 'partially_received'] },
  })

  if (activePOs > 0) {
    throw new Error(
      `Cannot delete: this supplier has ${activePOs} purchase log(s) in progress. ` +
      `Complete or cancel them first.`
    )
  }

  return Supplier.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean()
}

// ═════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDER FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

// ── PO Number Generator ───────────────────────────────────────────────────────
// Format: PO-2026-0001
// Counts all POs in the current calendar year. Simple and predictable.
async function generatePoNumber(): Promise<string> {
  const year  = new Date().getFullYear()
  const start = new Date(`${year}-01-01T00:00:00.000Z`)
  const end   = new Date(`${year + 1}-01-01T00:00:00.000Z`)

  const count = await PurchaseOrder.countDocuments({
    createdAt: { $gte: start, $lt: end },
  })

  return `PO-${year}-${String(count + 1).padStart(4, '0')}`
}

// ── Total cost calculator ─────────────────────────────────────────────────────
// Pure function — no side effects, easy to test.
// Uses quantityReceived for the total (not quantityOrdered)
// because you pay for what you got, not what you planned to get.
function calcLineTotal(qty: number, unitCost: number): number {
  return parseFloat((qty * unitCost).toFixed(4))
}

function calcTotalCost(items: Array<{ lineTotal: number }>): number {
  return parseFloat(
    items.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(4)
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export async function listPurchaseOrders(query: ListPurchaseOrdersQuery) {
  await dbConnect()

  const filter: Record<string, unknown> = {}

  if (query.status)     filter.status     = query.status
  if (query.supplierId) filter.supplierId = new mongoose.Types.ObjectId(query.supplierId)
  if (query.search)     filter.poNumber   = new RegExp(query.search, 'i')

  // Date range filter on purchaseDate (when the purchase happened, not when logged)
  if (query.from || query.to) {
    filter.purchaseDate = {
      ...(query.from ? { $gte: new Date(query.from) } : {}),
      ...(query.to   ? { $lte: new Date(query.to)   } : {}),
    }
  }

  const skip  = (query.page - 1) * query.limit
  const total = await PurchaseOrder.countDocuments(filter)

  const orders = await PurchaseOrder.find(filter)
    .sort({ purchaseDate: -1 })
    .skip(skip)
    .limit(query.limit)
    .populate('createdBy', 'fullName')
    .populate('supplierId', 'name nameAr phone')
    .lean()

  return { orders, total }
}

export async function getPurchaseOrderById(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  return PurchaseOrder.findById(id)
    .populate('supplierId', 'name nameAr phone contactPerson notes')
    .populate('createdBy',  'fullName')
    // Populate current material data alongside the snapshot
    // so the detail view can show "you paid $2.50/kg; current AVCO is $2.65/kg"
    .populate('items.materialId', 'name nameAr unit avcoUnitCost currentStock')
    .lean()
}

// ─────────────────────────────────────────────────────────────────────────────

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  createdBy: string
) {
  await dbConnect()

  // ── Resolve supplier snapshot ─────────────────────────────────────────────
  // Even for internal logging, we snapshot the supplier name.
  // If you delete or rename the supplier in 3 months, this PO should still
  // say "Al-Arz Dairy", not show a broken reference.
  let supplierName = 'Unknown Supplier'

  if (input.supplierId) {
    if (!mongoose.Types.ObjectId.isValid(input.supplierId)) {
      throw new Error('Invalid supplier ID')
    }
    const supplier = await Supplier.findOne({ _id: input.supplierId, isActive: true })
    if (!supplier) throw new Error('Supplier not found')
    supplierName = supplier.name
  }

  // ── Resolve materials ─────────────────────────────────────────────────────
  // Fetch all materials in ONE query (not one per item).
  const materialIds = input.items.map(i => i.materialId)
  const materials   = await RawMaterial.find({
    _id:      { $in: materialIds.map(id => new mongoose.Types.ObjectId(id)) },
    isActive: true,
  }).lean()

  const matMap = new Map(materials.map(m => [m._id.toString(), m]))

  // Validate every item references a real, active material
  for (const item of input.items) {
    if (!matMap.has(item.materialId)) {
      throw new Error(
        `Material "${item.materialId}" was not found or has been deactivated`
      )
    }
  }

  // ── Build enriched line items ─────────────────────────────────────────────
  const items = input.items.map(item => {
    const mat       = matMap.get(item.materialId)!
    const lineTotal = calcLineTotal(item.quantityOrdered, item.unitCost)
    return {
      materialId:       new mongoose.Types.ObjectId(item.materialId),
      materialName:     mat.name,       // snapshot
      materialNameAr:   mat.nameAr,     // snapshot
      quantityOrdered:  item.quantityOrdered,
      quantityReceived: 0,              // nothing received yet (still draft)
      unitCost:         item.unitCost,
      unit:             mat.unit,       // snapshot — unit can't change beneath us
      lineTotal,
    }
  })

  const poNumber  = await generatePoNumber()
  const totalCost = calcTotalCost(items)

  const po = await PurchaseOrder.create({
    poNumber,
    supplierId:       input.supplierId
      ? new mongoose.Types.ObjectId(input.supplierId)
      : null,
    supplierName,
    items,
    totalCost,
    purchaseCurrency: input.purchaseCurrency,
    status:           'draft',
    purchaseDate:     input.purchaseDate
      ? new Date(input.purchaseDate)
      : new Date(),
    notes:            input.notes,
    createdBy:        new mongoose.Types.ObjectId(createdBy),
  })

  return po.toObject()
}

// ─────────────────────────────────────────────────────────────────────────────

export async function updatePurchaseOrder(id: string, input: UpdatePurchaseOrderInput) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  // Guard: only draft POs can be edited
  const existing = await PurchaseOrder.findById(id)
  if (!existing) return null

  if (existing.status !== 'draft') {
    throw new Error(
      `This purchase log is "${existing.status}" and can no longer be edited. ` +
      `Cancel it and create a new entry instead.`
    )
  }

  const update: Record<string, unknown> = {}

  if (input.notes            !== undefined) update.notes            = input.notes
  if (input.purchaseCurrency !== undefined) update.purchaseCurrency = input.purchaseCurrency
  if (input.purchaseDate     !== undefined) update.purchaseDate     = new Date(input.purchaseDate)

  // Supplier change: re-snapshot
  if (input.supplierId !== undefined) {
    if (input.supplierId) {
      const supplier = await Supplier.findOne({ _id: input.supplierId, isActive: true })
      if (!supplier) throw new Error('Supplier not found')
      update.supplierId   = new mongoose.Types.ObjectId(input.supplierId)
      update.supplierName = supplier.name
    } else {
      update.supplierId   = null
      update.supplierName = 'Unknown Supplier'
    }
  }

  // Items change: re-validate and re-snapshot
  if (input.items) {
    const materialIds = input.items.map(i => i.materialId)
    const materials   = await RawMaterial.find({
      _id:      { $in: materialIds.map(id => new mongoose.Types.ObjectId(id)) },
      isActive: true,
    }).lean()

    const matMap = new Map(materials.map(m => [m._id.toString(), m]))
    for (const item of input.items) {
      if (!matMap.has(item.materialId)) {
        throw new Error(`Material "${item.materialId}" not found`)
      }
    }

    const items = input.items.map(item => {
      const mat       = matMap.get(item.materialId)!
      const lineTotal = calcLineTotal(item.quantityOrdered, item.unitCost)
      return {
        materialId:       new mongoose.Types.ObjectId(item.materialId),
        materialName:     mat.name,
        materialNameAr:   mat.nameAr,
        quantityOrdered:  item.quantityOrdered,
        quantityReceived: 0,
        unitCost:         item.unitCost,
        unit:             mat.unit,
        lineTotal,
      }
    })

    update.items     = items
    update.totalCost = calcTotalCost(items)
  }

  return PurchaseOrder.findByIdAndUpdate(id, { $set: update }, { new: true }).lean()
}

// ─────────────────────────────────────────────────────────────────────────────

export async function cancelPurchaseOrder(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const po = await PurchaseOrder.findById(id)
  if (!po) return null

  if (!['draft', 'partially_received'].includes(po.status)) {
    throw new Error(
      `Cannot cancel a "${po.status}" purchase log. ` +
      `Only draft or partially received entries can be cancelled.`
    )
  }

  // NOTE: We do NOT reverse any stock that was already received.
  // If items were partially received and then the entry is cancelled,
  // a manager must create a manual stock Adjustment to correct any over-count.
  // This is intentional — automatic reversals are complex and error-prone.
  // A note on the PO explains why stock may need manual correction.

  return PurchaseOrder.findByIdAndUpdate(
    id,
    {
      $set: {
        status: 'cancelled',
        notes:  po.notes
          ? po.notes + '\n[Cancelled — check if manual stock adjustment is needed]'
          : '[Cancelled — check if manual stock adjustment is needed]',
      },
    },
    { new: true }
  ).lean()
}

// ─────────────────────────────────────────────────────────────────────────────

// The core function of the entire purchase module.
// Called when the manager physically has the goods and logs what arrived.
//
// Flow:
//   1. Validate PO exists and is in a receivable state
//   2. For each receipt item:
//      a. Determine the actual cost to use for AVCO
//      b. Call moveStock() — this is where inventory is updated
//      c. Update quantityReceived on the PO item
//      d. Recalculate lineTotal based on what was actually received
//   3. Recalculate PO totalCost
//   4. Determine new status: received vs partially_received
//   5. Resolve any open StockAlerts for received materials
export async function receivePurchaseOrder(
  id: string,
  input: ReceivePOInput,
  receivedBy: string
) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const po = await PurchaseOrder.findById(id)
  if (!po) return null

  if (!['draft', 'partially_received'].includes(po.status)) {
    throw new Error(
      `Cannot log receipt for a "${po.status}" purchase. ` +
      `Only draft or partially received logs can be updated.`
    )
  }

  // Lazy import to avoid circular dependency at module load time.
  // purchase.service → inventory.ts ← potential circular if inventory imported purchase.
  // Lazy import resolves at call time, safely breaking the potential cycle.
  const { moveStock } = await import('@/lib/inventory')

  // Build a map of PO items for O(1) lookup
  const poItemMap = new Map(po.items.map(item => [item.materialId.toString(), item]))

  // Process each receipt item
  for (const receipt of input.receipts) {
    if (receipt.quantityReceived <= 0) continue   // skip zeros

    const poItem = poItemMap.get(receipt.materialId)
    if (!poItem) continue   // material not on this PO — skip silently

    // Actual cost: use the override if provided, else use the PO's recorded cost.
    // Real-world case: "I wrote $2/kg on the draft but paid $2.10 at the market."
    const actualUnitCost = receipt.unitCostOverride ?? poItem.unitCost

    // ← The only call into the inventory module from this service
    await moveStock({
      materialId:    poItem.materialId,
      type:          'purchase',
      quantity:      receipt.quantityReceived,   // positive = stock in
      unitCost:      actualUnitCost,
      referenceType: 'purchase_order',
      referenceId:   po._id as mongoose.Types.ObjectId,
      note:          input.notes ?? `Received via ${po.poNumber}`,
      createdBy:     new mongoose.Types.ObjectId(receivedBy),
    })

    // Update quantityReceived and lineTotal on the matched PO item.
    // $inc on 'items.$.quantityReceived' uses MongoDB's positional operator
    // to update only the matched array element — not the whole items array.
    const newQtyReceived = poItem.quantityReceived + receipt.quantityReceived
    await PurchaseOrder.updateOne(
      {
        _id:                po._id,
        'items.materialId': new mongoose.Types.ObjectId(receipt.materialId),
      },
      {
        $set: {
          'items.$.quantityReceived': newQtyReceived,
          'items.$.lineTotal':        calcLineTotal(newQtyReceived, actualUnitCost),
          // Also update unitCost on the item if overridden — keeps the record accurate
          ...(receipt.unitCostOverride !== undefined
            ? { 'items.$.unitCost': receipt.unitCostOverride }
            : {}
          ),
        },
      }
    )
  }

  // Reload after all updates to determine final status
  // Reload after all updates to determine final status
const updated = await PurchaseOrder.findById(id)
if (!updated) return null   // ← TypeScript knows updated is non-null after this

// Recalculate total cost from current item state
const newTotalCost = calcTotalCost(updated.items)
const allReceived  = updated.items.every(
  item => item.quantityReceived >= item.quantityOrdered
)

const newStatus = allReceived ? 'received' : 'partially_received'
const now       = new Date()

const finalPO = await PurchaseOrder.findByIdAndUpdate(
  id,
  {
    $set: {
      status:    newStatus,
      totalCost: newTotalCost,
      ...(allReceived ? { receivedAt: now } : { partiallyReceivedAt: now }),
      ...(input.notes ? { notes: input.notes } : {}),
    },
  },
  { new: true }
).populate('items.materialId', 'name nameAr unit avcoUnitCost currentStock')
 .lean()

// ── Finance logging ────────────────────────────────────────────────────────
// Use `updated` here (not `po`) — TypeScript already narrowed it above.
// `po` is technically still `IPurchaseOrder | null` at this point
// because TS loses the narrowing through async operations.
try {
  const { logPurchaseReceipt } = await import('@/lib/services/finance.service')

  await logPurchaseReceipt({
    purchaseOrderId: updated._id,              // ← updated, not po
    poNumber:        updated.poNumber,          // ← updated, not po
    supplierName:    updated.supplierName,      // ← updated, not po
    amount:          newTotalCost,
    currency:        updated.purchaseCurrency,  // ← updated, not po
    date:            updated.purchaseDate,      // ← updated, not po
    createdBy:       new mongoose.Types.ObjectId(receivedBy),
  })
} catch (err) {
  console.error('[Finance] Failed to log purchase receipt:', err)
}

return finalPO
}