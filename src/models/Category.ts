// src/models/Category.ts
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ICategory extends Document {
  _id: mongoose.Types.ObjectId
  name: string                             
  nameAr: string                           
  slug: string                              
  parent: mongoose.Types.ObjectId | null    
  image: string                            
  displayOrder: number                      
  isActive: boolean
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const CategorySchema = new Schema<ICategory>(
  {
    name:         { type: String, required: true, trim: true },
    nameAr:       { type: String, required: true, trim: true },
    slug:         { type: String, required: true, unique: true, lowercase: true, trim: true },
    parent:       { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    image:        { type: String, default: '' },
    displayOrder: { type: Number, default: 0 },
    isActive:     { type: Boolean, default: true },
    createdBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'categories',
  }
)

CategorySchema.index({ parent: 1, displayOrder: 1 })
CategorySchema.index({ isActive: 1 })

export const Category: Model<ICategory> =
  mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema)