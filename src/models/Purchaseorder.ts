// src/models/PurchaseOrder.ts



import mongoose, { Schema, Document, Model } from 'mongoose'

export type PurchaseOrderStatus =
  | 'draft'               
  | 'received'            
  | 'partially_received'  
  | 'cancelled'       

export interface IPurchaseOrderItem {
  materialId:        mongoose.Types.ObjectId
  materialName:      string   
  materialNameAr:    string    
  quantityOrdered:   number    
  quantityReceived:  number    
  unitCost:          number  
  unit:              string   
  lineTotal:         number  
}

export interface IPurchaseOrder extends Document {
  _id:      mongoose.Types.ObjectId
  poNumber: string   

  // ── Supplier ──────────────────────────────────────────────────────────────
  supplierId:   mongoose.Types.ObjectId | null   
  supplierName: string    

  // ── Items ─────────────────────────────────────────────────────────────────
  items: IPurchaseOrderItem[]

  // ── Financials ────────────────────────────────────────────────────────────
  totalCost:        number   
  purchaseCurrency: 'USD' | 'LBP'   

  // ── Status ────────────────────────────────────────────────────────────────
  status: PurchaseOrderStatus

  // ── Metadata ──────────────────────────────────────────────────────────────
  purchaseDate: Date    
                        
  notes:        string  

  // Dates when status transitions happened — useful for reports
  receivedAt:          Date | null
  partiallyReceivedAt: Date | null

  // ── Audit ─────────────────────────────────────────────────────────────────
  createdBy: mongoose.Types.ObjectId   
  createdAt: Date
  updatedAt: Date
}

// ── Sub-schema: line item ─────────────────────────────────────────────────────
const PurchaseOrderItemSchema = new Schema<IPurchaseOrderItem>(
  {
    materialId:       { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    materialName:     { type: String, required: true },
    materialNameAr:   { type: String, default: '' },
    quantityOrdered:  { type: Number, required: true, min: 0 },
    quantityReceived: { type: Number, default: 0,     min: 0 },
    unitCost:         { type: Number, required: true, min: 0 },
    unit:             { type: String, required: true },
    lineTotal:        { type: Number, required: true, min: 0 },
  },
  { _id: false }
)

// ── Main schema ───────────────────────────────────────────────────────────────
const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    poNumber:     { type: String, required: true, unique: true },

    supplierId:   { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplierName: { type: String, default: 'Unknown Supplier' },

    items: [PurchaseOrderItemSchema],

    totalCost:        { type: Number, default: 0 },
    purchaseCurrency: { type: String, enum: ['USD', 'LBP'], default: 'USD' },

    status: {
      type:    String,
      enum:    ['draft', 'received', 'partially_received', 'cancelled'],
      default: 'draft',
    },

    // Separate from createdAt — you might log a Monday purchase on Tuesday
    purchaseDate: { type: Date, required: true },

    notes: { type: String, default: '' },

    receivedAt:          { type: Date, default: null },
    partiallyReceivedAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'purchase_orders',
  }
)

// ── Indexes ───────────────────────────────────────────────────────────────────
PurchaseOrderSchema.index({ status: 1, createdAt: -1 })
PurchaseOrderSchema.index({ supplierId: 1, createdAt: -1 })
PurchaseOrderSchema.index({ purchaseDate: -1 })   // for date-range reports

export const PurchaseOrder: Model<IPurchaseOrder> =
  mongoose.models.PurchaseOrder ||
  mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema)