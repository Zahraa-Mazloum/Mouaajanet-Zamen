// src/models/Product.ts


import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IProduct extends Document {
  _id: mongoose.Types.ObjectId

  // Bilingual identity
  name: string
  nameAr: string
  description: string
  descriptionAr: string

  // Classification
  category: mongoose.Types.ObjectId      
  allergens: string[]                      
  tags: string[]                           

  // Media
  images: string[]                         

  // Visibility flags
  isFeatured: boolean                   
  isAvailableInWeb: boolean                               
  isActive: boolean                      

  // Audit
  createdBy: mongoose.Types.ObjectId       
  createdAt: Date
  updatedAt: Date
}

const ProductSchema = new Schema<IProduct>(
  {
    name:             { type: String, required: true, trim: true },
    nameAr:           { type: String, required: true, trim: true },
    description:      { type: String, default: '' },
    descriptionAr:    { type: String, default: '' },

    category:         { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    allergens:        [{ type: String }],
    tags:             [{ type: String }],

    images:           [{ type: String }],

    isFeatured:       { type: Boolean, default: false },
    isAvailableInWeb: { type: Boolean, default: false },  // opt-in for online orders
    isActive:         { type: Boolean, default: true },   // soft delete

    createdBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'products',
  }
)

ProductSchema.index({ category: 1 })
ProductSchema.index({ isFeatured: 1 })
ProductSchema.index({ isAvailableInWeb: 1, isActive: 1 })

export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema)