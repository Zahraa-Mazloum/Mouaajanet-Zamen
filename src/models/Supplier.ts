// src/models/Supplier.ts


import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ISupplier extends Document {
  _id: mongoose.Types.ObjectId

  // ── Identity ──────────────────────────────────────────────────────────────
  name:   string     
  nameAr: string        

  // ── Contact ───────────────────────────────────────────────────────────────

  phone:         string
  contactPerson: string   
  address:       string   
  notes:         string   

  // ── What they supply ──────────────────────────────────────────────────────

  materials: mongoose.Types.ObjectId[]

  // ── Status ────────────────────────────────────────────────────────────────
  isActive: boolean   
  // ── Audit ─────────────────────────────────────────────────────────────────
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const SupplierSchema = new Schema<ISupplier>(
  {
    name:          { type: String, required: true, trim: true },
    nameAr:        { type: String, default: '',   trim: true },

    phone:         { type: String, default: '', trim: true },
    contactPerson: { type: String, default: '', trim: true },
    address:       { type: String, default: '', trim: true },
    notes:         { type: String, default: '', trim: true },

    materials: [{ type: Schema.Types.ObjectId, ref: 'RawMaterial' }],

    isActive:  { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'suppliers',
  }
)

// Find active suppliers sorted by name
SupplierSchema.index({ isActive: 1, name: 1 })

// "Which suppliers carry flour?" — used on the low-stock alert page
SupplierSchema.index({ materials: 1 })

export const Supplier: Model<ISupplier> =
  mongoose.models.Supplier ||
  mongoose.model<ISupplier>('Supplier', SupplierSchema)