// src/models/Transaction.ts

import mongoose, { Schema, Document, Model } from 'mongoose'

export type TransactionType = 'income' | 'expense'

export type TransactionSource =
  | 'pos_sale'          
  | 'purchase_receipt'  
  | 'manual'            

export type ExpenseCategory =
  | 'raw_materials'  
  | 'salary'          
  | 'rent'          
  | 'utility'         
  | 'equipment'     
  | 'marketing'      
  | 'other'    

export interface ITransaction extends Document {
  _id: mongoose.Types.ObjectId

  type:   TransactionType   
  amount: number            

  description: string      

  category: ExpenseCategory | 'sale'

  source:      TransactionSource

  sourceId:    mongoose.Types.ObjectId | null
  sourceRef:   string   

  currency:    'USD' | 'LBP'
  date:        Date     

  staffId:     mongoose.Types.ObjectId | null

  periodYear:  number   
  periodMonth: number   
  periodWeek:  number 

  notes:     string
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const TransactionSchema = new Schema<ITransaction>(
  {
    type:   { type: String, enum: ['income', 'expense'], required: true },
    amount: { type: Number, required: true, min: 0 },

    description: { type: String, required: true, trim: true },

    category: {
      type: String,
      enum: [
        'sale',                                           
        'raw_materials','salary','rent','utility',        
        'equipment','marketing','other',                  
      ],
      required: true,
    },

    source:    { type: String, enum: ['pos_sale','purchase_receipt','manual'], required: true },
    sourceId:  { type: Schema.Types.ObjectId, default: null },
    sourceRef: { type: String, default: '' },

    currency: { type: String, enum: ['USD','LBP'], required: true },
    date:     { type: Date, required: true },

    staffId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    periodYear:  { type: Number, required: true },
    periodMonth: { type: Number, required: true },
    periodWeek:  { type: Number, required: true },

    notes:     { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'transactions',
  }
)

TransactionSchema.index({ type: 1, periodYear: 1, periodMonth: 1 })
TransactionSchema.index({ type: 1, periodYear: 1, periodWeek:  1 })
TransactionSchema.index({ source: 1, sourceId: 1 }, { unique: true, sparse: true })
TransactionSchema.index({ date: -1 })
TransactionSchema.index({ category: 1, date: -1 })
TransactionSchema.index({ staffId: 1, periodYear: 1, periodMonth: 1 })

export const Transaction: Model<ITransaction> =
  mongoose.models.Transaction ||
  mongoose.model<ITransaction>('Transaction', TransactionSchema)