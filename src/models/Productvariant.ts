    // src/models/ProductVariant.ts
//
// Each ProductVariant belongs to one Product and carries:
//   - its own price (USD + LBP)
//   - its own Bill of Materials (which raw materials and how much)
//   - its own availability flags (POS + web)


import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IBomItem {
  materialId: mongoose.Types.ObjectId     
  quantity: number                       
  unit: string                          
}

export interface IProductVariant extends Document {
  _id: mongoose.Types.ObjectId
  productId: mongoose.Types.ObjectId     

  // Variant identity (empty = single default variant)
  name: string                            // e.g. "Large", "With Nuts", ""
  nameAr: string                          // e.g. "كبير", "مع مكسرات", ""
  sku: string                             // unique stock-keeping unit code

  // Pricing
  priceUSD: number
  priceLBP: number

  // Bill of Materials for this variant
  bom: IBomItem[]

  // Availability
  isDefault: boolean                      
  isAvailable: boolean                  
  isAvailableInWeb: boolean               

  // Display
  displayOrder: number                   
  images: string[]                    

  // Audit
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const BomItemSchema = new Schema<IBomItem>(
  {
    materialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    quantity:   { type: Number, required: true, min: 0 },
    unit:       { type: String, required: true },
  },
  { _id: false }
)

const ProductVariantSchema = new Schema<IProductVariant>(
  {
    productId:        { type: Schema.Types.ObjectId, ref: 'Product', required: true },

    name:             { type: String, default: '', trim: true },
    nameAr:           { type: String, default: '', trim: true },
    sku:              { type: String, required: true, unique: true, uppercase: true, trim: true },

    priceUSD:         { type: Number, required: true, min: 0 },
    priceLBP:         { type: Number, required: true, min: 0 },

    bom:              [BomItemSchema],

    isDefault:        { type: Boolean, default: false },
    isAvailable:      { type: Boolean, default: true },
    isAvailableInWeb: { type: Boolean, default: false },

    displayOrder:     { type: Number, default: 0 },
    images:           [{ type: String }],

    createdBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'product_variants',
  }
)


ProductVariantSchema.index(
  { productId: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
)

ProductVariantSchema.index({ productId: 1, displayOrder: 1 })
ProductVariantSchema.index({ isAvailable: 1 })
ProductVariantSchema.index({ isAvailableInWeb: 1 })

export const ProductVariant: Model<IProductVariant> =
  mongoose.models.ProductVariant ||
  mongoose.model<IProductVariant>('ProductVariant', ProductVariantSchema)