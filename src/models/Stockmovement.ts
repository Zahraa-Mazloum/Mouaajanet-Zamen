// src/models/StockMovement.ts
//
// Every change to a RawMaterial's currentStock creates one StockMovement.
// This is an append-only audit log — records are never updated or deleted.
//
// Movement types:
//   purchase          → stock received from a PurchaseOrder (positive quantity)
//   order_deduction   → stock consumed when an Order is confirmed (negative)
//   adjustment        → manual correction by manager (positive or negative)
//   waste             → damaged/expired stock written off (negative)
//   return            → supplier return or customer return of raw stock (negative)
//
// AVCO snapshot:
//   avcoAfter is the AVCO value on this material AFTER this movement is applied.
//   This lets you reconstruct the cost curve over time for accounting.

import mongoose, { Schema, Document, Model } from 'mongoose'

export type MovementType =
  | 'purchase'
  | 'order_deduction'
  | 'adjustment'
  | 'waste'
  | 'return'

export type ReferenceType = 'order' | 'purchase_order' | 'manual'

export interface IStockMovement extends Document {
  _id: mongoose.Types.ObjectId

  materialId: mongoose.Types.ObjectId       

  type: MovementType

  // Positive = stock added, Negative = stock removed
  quantity: number

  // Cost info (snapshotted at the time of movement)
  unitCost: number                          // USD cost per unit for this movement
  avcoAfter: number                         // AVCO of the material after this movement
  stockAfter: number                        // currentStock of the material after this movement

  // What triggered this movement
  referenceType: ReferenceType
  referenceId: mongoose.Types.ObjectId | null  // orderId or purchaseOrderId

  note: string                              // free-text note (required for adjustments/waste)

  createdBy: mongoose.Types.ObjectId        // ref: User
  createdAt: Date
}

const StockMovementSchema = new Schema<IStockMovement>(
  {
    materialId:    { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },

    type:          {
      type: String,
      enum: ['purchase', 'order_deduction', 'adjustment', 'waste', 'return'],
      required: true,
    },

    quantity:      { type: Number, required: true },  // can be negative

    unitCost:      { type: Number, required: true, default: 0 },
    avcoAfter:     { type: Number, required: true, default: 0 },
    stockAfter:    { type: Number, required: true },

    referenceType: {
      type: String,
      enum: ['order', 'purchase_order', 'manual'],
      required: true,
    },
    referenceId:   { type: Schema.Types.ObjectId, default: null },

    note:          { type: String, default: '' },

    createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    // updatedAt is intentionally excluded — movements are immutable
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'stock_movements',
  }
)

StockMovementSchema.index({ materialId: 1, createdAt: -1 })
StockMovementSchema.index({ referenceType: 1, referenceId: 1 })
StockMovementSchema.index({ type: 1 })

export const StockMovement: Model<IStockMovement> =
  mongoose.models.StockMovement ||
  mongoose.model<IStockMovement>('StockMovement', StockMovementSchema)