
// src/lib/inventory.ts


import { RawMaterial } from '@/models/RawMaterial'
import { StockMovement, MovementType, ReferenceType } from '@/models/Stockmovement'
import { StockAlert } from '@/models/StockAlert'
import mongoose from 'mongoose'

interface MoveStockParams {
  materialId: mongoose.Types.ObjectId
  type: MovementType
  quantity: number           
  unitCost?: number          
  referenceType: ReferenceType
  referenceId?: mongoose.Types.ObjectId | null
  note?: string
  createdBy: mongoose.Types.ObjectId
}

/**
 * The single function that should be called for EVERY stock change.
 * It:
 *   1. Recalculates AVCO (if incoming stock)
 *   2. Updates RawMaterial.currentStock (atomic $inc)
 *   3. Creates a StockMovement record
 *   4. Fires a StockAlert if stock falls to/below reorderLevel
 */
export async function moveStock(params: MoveStockParams) {
  const {
    materialId, type, quantity, unitCost = 0,
    referenceType, referenceId = null, note = '', createdBy,
  } = params

  const material = await RawMaterial.findById(materialId)
  if (!material) throw new Error(`RawMaterial ${materialId} not found`)

  // ── AVCO recalculation (only for incoming stock) ──────────────────────────
  let newAvco = material.avcoUnitCost

  if (quantity > 0 && unitCost > 0) {
    // Weighted average: blend existing stock cost with incoming cost
    const totalStock = material.currentStock + quantity
    newAvco = totalStock > 0
      ? (material.currentStock * material.avcoUnitCost + quantity * unitCost) / totalStock
      : unitCost
  }

  // ── Update stock atomically ───────────────────────────────────────────────
  const stockAfter = material.currentStock + quantity

  await RawMaterial.findByIdAndUpdate(materialId, {
    $inc:  { currentStock: quantity },
    $set:  { avcoUnitCost: newAvco },
  })

  // ── Create movement record ────────────────────────────────────────────────
  await StockMovement.create({
    materialId,
    type,
    quantity,
    unitCost:    quantity > 0 ? unitCost : newAvco,   // outbound uses current AVCO
    avcoAfter:   newAvco,
    stockAfter,
    referenceType,
    referenceId,
    note,
    createdBy,
  })

  // ── Low stock alert ───────────────────────────────────────────────────────
  if (stockAfter <= material.reorderLevel && quantity < 0) {
    // upsert: only creates if no open alert exists for this material
    await StockAlert.updateOne(
      { materialId, status: 'open' },
      {
        $setOnInsert: {
          materialId,
          stockAtAlert:        stockAfter,
          reorderLevelAtAlert: material.reorderLevel,
          status:              'open',
        },
      },
      { upsert: true }
    )
  
  }

  return { stockAfter, newAvco }
}

/**
 * Deduct stock for all BOM items when an Order is confirmed.
 * Call this inside your order confirmation handler.
 *
 * @param orderId   - the confirmed order's _id
 * @param lineItems - array of { variantId, quantity } from the order
 * @param createdBy - staff member who confirmed the order
 */
export async function deductStockForOrder(
  orderId: mongoose.Types.ObjectId,
  lineItems: Array<{ variantId: mongoose.Types.ObjectId; quantity: number }>,
  createdBy: mongoose.Types.ObjectId
) {
  // Lazy import to avoid circular deps
  const { ProductVariant } = await import('@/models/Productvariant')

  for (const item of lineItems) {
    const variant = await ProductVariant.findById(item.variantId).lean()
    if (!variant) continue

    for (const bomLine of variant.bom) {
      const totalConsumption = bomLine.quantity * item.quantity

      await moveStock({
        materialId:    bomLine.materialId as mongoose.Types.ObjectId,
        type:          'order_deduction',
        quantity:      -totalConsumption,          // negative = stock out
        referenceType: 'order',
        referenceId:   orderId,
        note:          `Order deduction for variant ${item.variantId}`,
        createdBy,
      })
    }
  }
}

/**
 * Receive a PurchaseOrder: add stock and recalculate AVCO for each item.
 * Call this when PO status transitions to 'received' or 'partially_received'.
 *
 * @param poId      - PurchaseOrder _id
 * @param receipts  - what actually arrived: [{ materialId, quantityReceived, unitCost }]
 * @param createdBy - manager who clicked "Receive"
 */
export async function receivePurchaseOrder(
  poId: mongoose.Types.ObjectId,
  receipts: Array<{
    materialId: mongoose.Types.ObjectId
    quantityReceived: number
    unitCost: number
  }>,
  createdBy: mongoose.Types.ObjectId
) {
  for (const receipt of receipts) {
    if (receipt.quantityReceived <= 0) continue

    await moveStock({
      materialId:    receipt.materialId,
      type:          'purchase',
      quantity:      receipt.quantityReceived,
      unitCost:      receipt.unitCost,
      referenceType: 'purchase_order',
      referenceId:   poId,
      note:          `Received via PO ${poId}`,
      createdBy,
    })

    // Resolve any open alert for this material if stock is now above reorder level
    const material = await RawMaterial.findById(receipt.materialId)
    if (material && material.currentStock > material.reorderLevel) {
      await StockAlert.updateOne(
        { materialId: receipt.materialId, status: { $in: ['open', 'acknowledged'] } },
        { $set: { status: 'resolved', resolvedAt: new Date() } }
      )
    }
  }
}