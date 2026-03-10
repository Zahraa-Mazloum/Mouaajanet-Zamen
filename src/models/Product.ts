// src/models/Product.ts
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IBomItem {
  materialId: mongoose.Types.ObjectId
  quantity: number
  unit: string
}

export interface IProduct extends Document {
  _id: mongoose.Types.ObjectId
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  priceUSD: number
  priceLBP: number
  category: mongoose.Types.ObjectId
  images: string[]
  isAvailable: boolean
  isFeatured: boolean
  allergens: string[]
  bom: IBomItem[]
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const BomItemSchema = new Schema<IBomItem>({
  materialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  quantity:   { type: Number, required: true },
  unit:       { type: String, required: true },
}, { _id: false })

const ProductSchema = new Schema<IProduct>({
  name:          { type: String, required: true, trim: true },
  nameAr:        { type: String, required: true, trim: true },
  description:   { type: String, default: '' },
  descriptionAr: { type: String, default: '' },
  priceUSD:      { type: Number, required: true },
  priceLBP:      { type: Number, required: true },
  category:      { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  images:        [{ type: String }],
  isAvailable:   { type: Boolean, default: true },
  isFeatured:    { type: Boolean, default: false },
  allergens:     [{ type: String }],
  bom:           [BomItemSchema],
  createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
  collection: 'products',
})

ProductSchema.index({ category: 1 })
ProductSchema.index({ isAvailable: 1 })
ProductSchema.index({ isFeatured: 1 })

export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema)