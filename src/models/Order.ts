// src/models/Order.ts
import mongoose, { Schema, Document, Model } from 'mongoose'

export type OrderStatus =
  | 'pending' | 'confirmed' | 'preparing'
  | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'

export type OrderChannel = 'online' | 'pos' | 'phone'
export type OrderType    = 'pickup' | 'delivery'
export type PaymentMethod = 'cash_usd' | 'cash_lbp' | 'split' | 'card' | 'loyalty_only'

export interface IOrderItem {
  productId:    mongoose.Types.ObjectId
  productName:  string   // snapshot at order time
  unitPriceLBP: number   // snapshot at order time
  unitPriceUSD: number   // snapshot at order time
  quantity:     number
  subtotalLBP:  number
}

export interface IOrderPayment {
  amountUSD:    number
  amountLBP:    number
  exchangeRate: number   // snapshot — never changes after order placed
  totalInLBP:   number   // canonical: USD converted + LBP added
  totalInUSD:   number   // derived
  method:       PaymentMethod
  loyaltyUsed:  number
  status:       'pending' | 'paid' | 'refunded'
}

export interface IOrder extends Document {
  _id:              mongoose.Types.ObjectId
  orderNumber:      string
  userId:           mongoose.Types.ObjectId | null
  branchId:         mongoose.Types.ObjectId
  channel:          OrderChannel
  type:             OrderType
  status:           OrderStatus
  items:            IOrderItem[]
  payment:          IOrderPayment
  deliveryAddress:  { street: string; city: string } | null
  assignedDriverId: mongoose.Types.ObjectId | null
  notes:            string | null
  offlineId:        string | null   // POS offline deduplication UUID
  syncedAt:         Date | null
  createdAt:        Date
  updatedAt:        Date
}

const OrderItemSchema = new Schema<IOrderItem>({
  productId:    { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  productName:  { type: String, required: true },
  unitPriceLBP: { type: Number, required: true },
  unitPriceUSD: { type: Number, required: true },
  quantity:     { type: Number, required: true },
  subtotalLBP:  { type: Number, required: true },
}, { _id: false })

const OrderPaymentSchema = new Schema<IOrderPayment>({
  amountUSD:    { type: Number, default: 0 },
  amountLBP:    { type: Number, default: 0 },
  exchangeRate: { type: Number, required: true },
  totalInLBP:   { type: Number, required: true },
  totalInUSD:   { type: Number, required: true },
  method:       { type: String, enum: ['cash_usd','cash_lbp','split','card','loyalty_only'], required: true },
  loyaltyUsed:  { type: Number, default: 0 },
  status:       { type: String, enum: ['pending','paid','refunded'], default: 'pending' },
}, { _id: false })

const OrderSchema = new Schema<IOrder>({
  orderNumber:      { type: String, required: true, unique: true },
  userId:           { type: Schema.Types.ObjectId, ref: 'User', default: null },
  branchId:         { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  channel:          { type: String, enum: ['online','pos','phone'], required: true },
  type:             { type: String, enum: ['pickup','delivery'], required: true },
  status:           { type: String, enum: ['pending','confirmed','preparing','ready','out_for_delivery','delivered','cancelled'], default: 'pending' },
  items:            [OrderItemSchema],
  payment:          { type: OrderPaymentSchema, required: true },
  deliveryAddress:  { type: Schema.Types.Mixed, default: null },
  assignedDriverId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  notes:            { type: String, default: null },
  offlineId:        { type: String, default: null },
  syncedAt:         { type: Date, default: null },
}, {
  timestamps: true,
  collection: 'orders',
})

OrderSchema.index({ userId: 1 })
OrderSchema.index({ branchId: 1, status: 1 })
OrderSchema.index({ createdAt: -1 })
OrderSchema.index({ orderNumber: 1 }, { unique: true })
OrderSchema.index({ offlineId: 1 }, { sparse: true, unique: true })

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema)