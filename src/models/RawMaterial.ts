// src/models/RawMaterial.ts
//
// Costing method: AVCO (Average Cost / Weighted Average)
//
// Formula applied on every purchase receipt:
//   newAvco = (currentStock * avcoUnitCost + incomingQty * incomingUnitCost)
//             / (currentStock + incomingQty)
//
// Low stock alert:
//   After every outbound StockMovement (order_deduction, waste),
//   if currentStock <= reorderLevel → create a StockAlert.

import mongoose, { Schema, Document, Model } from 'mongoose'

export type RawMaterialUnit = 'g' | 'kg' | 'ml' | 'l' | 'pcs' | 'box'

export interface IRawMaterial extends Document {
  _id: mongoose.Types.ObjectId

  // Identity
  name: string
  nameAr: string
  unit: RawMaterialUnit         

  // Stock
  currentStock: number         
  reorderLevel: number          

  // AVCO costing
  avcoUnitCost: number          
                                

  // Optional supplier link 
  supplierId: mongoose.Types.ObjectId | null

  // Status
  isActive: boolean             

  // Audit
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const RawMaterialSchema = new Schema<IRawMaterial>(
  {
    name:          { type: String, required: true, trim: true },
    nameAr:        { type: String, required: true, trim: true },
    unit:          {
      type: String,
      enum: ['g', 'kg', 'ml', 'l', 'pcs', 'box'],
      required: true,
    },

    currentStock:  { type: Number, required: true, default: 0, min: 0 },
    reorderLevel:  { type: Number, required: true, default: 0, min: 0 },

    avcoUnitCost:  { type: Number, required: true, default: 0, min: 0 },

    supplierId:    { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },

    isActive:      { type: Boolean, default: true },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'raw_materials',
  }
)

RawMaterialSchema.index({ isActive: 1 })
RawMaterialSchema.index({ supplierId: 1 })
// Quickly find all materials at or below reorder level (for alert dashboard)
RawMaterialSchema.index({ currentStock: 1, reorderLevel: 1 })

export const RawMaterial: Model<IRawMaterial> =
  mongoose.models.RawMaterial ||
  mongoose.model<IRawMaterial>('RawMaterial', RawMaterialSchema)