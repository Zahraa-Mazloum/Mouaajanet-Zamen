// src/app/api/auth/reset-password/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { jwtVerify } from 'jose'
import dbConnect from '@/lib/dbConnect'
import { User } from '@/models/User'

const resetSchema = z.object({
  verificationToken: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parsed = resetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { verificationToken, newPassword } = parsed.data

    // Verify token — same pattern as register
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
    let phone: string
    let purpose: string

    try {
      const { payload } = await jwtVerify(verificationToken, secret)
      phone   = payload.phone as string
      purpose = payload.purpose as string
    } catch {
      return NextResponse.json(
        { error: 'Reset link expired. Please start over.' },
        { status: 401 }
      )
    }

    if (purpose !== 'reset') {
      return NextResponse.json(
        { error: 'Invalid token.' },
        { status: 400 }
      )
    }

    await dbConnect()

    const passwordHash = await bcrypt.hash(newPassword, 12)

    // Find and update in one operation
    const updated = await User.findOneAndUpdate(
      { phone, isActive: true },
      { $set: { passwordHash } },
      { new: true }
    ).lean()

    if (!updated) {
      return NextResponse.json(
        { error: 'Account not found.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: 'Password updated.' })

  } catch (error) {
    console.error('reset-password error:', error)
    return NextResponse.json(
      { error: 'Something went wrong.' },
      { status: 500 }
    )
  }
}