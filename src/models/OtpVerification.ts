// src/models/OtpVerification.ts
import mongoose, { Schema, Document, Model } from 'mongoose'

export type OtpPurpose = 'register' | 'reset'

export interface IOtpVerification extends Document {
  _id: mongoose.Types.ObjectId
  phone: string
  code: string
  purpose: OtpPurpose
  attempts: number
  verified: boolean
  expiresAt: Date
  createdAt: Date
}

const OtpVerificationSchema = new Schema<IOtpVerification>({
  phone:     { type: String, required: true },
  code:      { type: String, required: true },     // bcrypt hashed
  purpose:   { type: String, enum: ['register','reset'], required: true },
  attempts:  { type: Number, default: 0 },
  verified:  { type: Boolean, default: false },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 min
  },
}, {
  timestamps: true,
  collection: 'otp_verifications',
})

// TTL index — MongoDB auto-deletes expired OTPs
OtpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
OtpVerificationSchema.index({ phone: 1 })

export const OtpVerification: Model<IOtpVerification> =
  mongoose.models.OtpVerification ||
  mongoose.model<IOtpVerification>('OtpVerification', OtpVerificationSchema)