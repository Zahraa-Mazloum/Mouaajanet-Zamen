// src/app/api/auth/register/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { jwtVerify } from 'jose'
import dbConnect from '@/lib/dbConnect'
import { User } from '@/models/User'

const registerSchema = z.object({
  // The token issued by verify-otp
  // Proves the user completed OTP verification
  verificationToken: z.string().min(1),

  fullName: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { verificationToken, fullName, password } = parsed.data

    // ── Step 1: Verify the phone verification token ───────
    // This proves the user completed the OTP step
    // If token is expired (>15min) or tampered → jwtVerify throws
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

    let phone: string
    let purpose: string

    try {
      const { payload } = await jwtVerify(verificationToken, secret)
      phone   = payload.phone as string
      purpose = payload.purpose as string
    } catch {
      return NextResponse.json(
        { error: 'Verification expired. Please start over.' },
        { status: 401 }
      )
    }

    // Paranoia check: this token must be for registration, not reset
    if (purpose !== 'register') {
      return NextResponse.json(
        { error: 'Invalid verification token.' },
        { status: 400 }
      )
    }

    await dbConnect()


    const existing = await User.findOne({ phone }).lean()
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this number already exists.' },
        { status: 409 }
      )
    }

    // ── Step 3: Hash the password ─────────────────────────
    const passwordHash = await bcrypt.hash(password, 12)


    // ── Step 4: Create the user ───────────────────────────
    const newUser = await User.create({
      phone,
      phoneVerified:   true, 
      passwordHash,
      fullName,
      role:            'customer',
      isActive:        true,
      customerProfile: {
        loyaltyPoints:     0,
        whatsappOptIn:     true,
        totalOrders:       0,
        totalSpentLBP:     0,
        allergies:         [],
        favoriteItems:     [],
      },
    })

    // ── Step 5: Return success ────────────────────────────
    // Don't auto-login here — let the frontend call NextAuth's signIn()
    //   This endpoint: creates the user
    //   NextAuth signIn(): creates the session
    return NextResponse.json(
      {
        success: true,
        userId:  newUser._id.toString(),
        message: 'Account created successfully',
      },
      { status: 201 } 
    )

  } catch (error) {
    console.error('register error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}