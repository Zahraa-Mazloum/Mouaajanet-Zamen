// src/models/User.ts
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IStaffProfile {
  employeeId: string
  department: 'kitchen' | 'front' | 'management' | 'delivery'
  hireDate: Date
  posPin: string
  permissions: string[]
  createdBy: mongoose.Types.ObjectId
}

export interface ICustomerProfile {
  loyaltyPoints: number
  birthday: Date | null
  whatsappOptIn: boolean
  totalOrders: number
  totalSpentLBP: number
  favoriteItems: mongoose.Types.ObjectId[]
  preferredLang: 'en' | 'ar' | null
  preferredCurrency: 'LBP' | 'USD' | null
  preferredTheme: 'light' | 'dark' | null
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId
  phone: string
  phoneVerified: boolean
  passwordHash: string
  fullName: string
  avatarUrl: string | null
  role: 'developer' | 'manager' | 'staff' | 'customer'
  isActive: boolean
  lastLoginAt: Date | null
  staffProfile: IStaffProfile | null
  customerProfile: ICustomerProfile | null
  createdAt: Date
  updatedAt: Date
}

// ── Sub-schemas ────────────────────────────────────────────

const StaffProfileSchema = new Schema<IStaffProfile>({
  employeeId:  { type: String, required: true },
  department:  { type: String, enum: ['kitchen','front','management','delivery'], required: true },
  hireDate:    { type: Date, required: true },
  posPin:      { type: String, required: true },
  permissions: [{ type: String }],
  createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: false })

const CustomerProfileSchema = new Schema<ICustomerProfile>({
  loyaltyPoints:     { type: Number, default: 0 },
  birthday:          { type: Date, default: null },
  whatsappOptIn:     { type: Boolean, default: true },
  totalOrders:       { type: Number, default: 0 },
  totalSpentLBP:     { type: Number, default: 0 },
  favoriteItems:     [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  preferredLang:     { type: String, enum: ['en','ar'], default: null },
  preferredCurrency: { type: String, enum: ['LBP','USD'], default: null },
  preferredTheme:    { type: String, enum: ['light','dark'], default: null },
}, { _id: false })

// ── Main schema ────────────────────────────────────────────

const UserSchema = new Schema<IUser>({
  phone:           { type: String, required: true, unique: true, trim: true },
  phoneVerified:   { type: Boolean, default: false },
  passwordHash:    { type: String, required: true },
  fullName:        { type: String, required: true, trim: true },
  avatarUrl:       { type: String, default: null },
  role:            { type: String, enum: ['developer','manager','staff','customer'], required: true },
  isActive:        { type: Boolean, default: true },
  lastLoginAt:     { type: Date, default: null },
  staffProfile:    { type: StaffProfileSchema, default: null },
  customerProfile: { type: CustomerProfileSchema, default: null },
}, {
  timestamps: true,
  collection: 'users',
})

// ── Indexes ────────────────────────────────────────────────
UserSchema.index({ phone: 1 }, { unique: true })
UserSchema.index({ role: 1 })
UserSchema.index({ 'staffProfile.employeeId': 1 }, { sparse: true })

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema)