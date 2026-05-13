// src/models/StockAlert.ts
//
// A StockAlert is created automatically after any outbound StockMovement
// if the material's currentStock drops to or below its reorderLevel.
//
// One open alert per material at a time (enforced by partial unique index).
// When the admin creates a PurchaseOrder linked to this alert, the alert
// moves to 'acknowledged'. When the PO is received and stock recovers
// above reorderLevel, the alert moves to 'resolved'.

import mongoose, { Schema, Document, Model } from 'mongoose'

export type StockAlertStatus = 'open' | 'acknowledged' | 'resolved'

export interface IStockAlert extends Document {
  _id: mongoose.Types.ObjectId

  materialId: mongoose.Types.ObjectId     // ref: RawMaterial

  // Snapshot at the time the alert fired
  stockAtAlert: number
  reorderLevelAtAlert: number

  status: StockAlertStatus

  // Set when admin links a PurchaseOrder to this alert
  purchaseOrderId: mongoose.Types.ObjectId | null

  resolvedAt: Date | null

  createdAt: Date
  updatedAt: Date
}

const StockAlertSchema = new Schema<IStockAlert>(
  {
    materialId:          { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },

    stockAtAlert:        { type: Number, required: true },
    reorderLevelAtAlert: { type: Number, required: true },

    status:              {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
    },

    purchaseOrderId:     { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    resolvedAt:          { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'stock_alerts',
  }
)

// Only one open alert per material at a time
StockAlertSchema.index(
  { materialId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
)
StockAlertSchema.index({ status: 1, createdAt: -1 })

export const StockAlert: Model<IStockAlert> =
  mongoose.models.StockAlert ||
  mongoose.model<IStockAlert>('StockAlert', StockAlertSchema)

