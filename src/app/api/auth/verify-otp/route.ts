// src/app/api/auth/verify-otp/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { SignJWT } from 'jose'
import { SinchClient, Verification } from '@sinch/sdk-core'
import dbConnect from '@/lib/dbConnect'
import { OtpVerification } from '@/models/OtpVerification'

const verifyOtpSchema = z.object({
  phone:   z.string().regex(/^\+[1-9]\d{7,14}$/),
  code:    z.string().min(1, 'Code is required'),
  purpose: z.enum(['register', 'reset']),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parsed = verifyOtpSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[1].message },
        { status: 400 }
      )
    }

    const { phone, code, purpose } = parsed.data

    await dbConnect()

    // ── Find the active OTP record for this phone ─────────
    const otpDoc = await OtpVerification.findOne({
      phone,
      purpose,
      verified:  false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 })

    if (!otpDoc) {
      return NextResponse.json(
        { error: 'Code expired or not found. Please request a new one.' },
        { status: 400 }
      )
    }

    if (otpDoc.attempts >= 3) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please request a new code.' },
        { status: 429 }
      )
    }

    const sinch = new SinchClient({
      applicationKey:    process.env.SINCH_APP_KEY!,
      applicationSecret: process.env.SINCH_APP_SECRET!,
    })

    const reportData = Verification.reportVerificationByIdHelper.buildSmsRequest(
      otpDoc.code, // sinchId — which verification to report against
      code,        // the code the user typed
    )
if (process.env.NODE_ENV === 'development' && otpDoc.code === 'DEV_BYPASS') {
  if (code !== '123456') {
    await OtpVerification.updateOne(
      { _id: otpDoc._id },
      { $inc: { attempts: 1 } }
    )
    return NextResponse.json(
      { error: 'Invalid code. Dev mode code is 123456' },
      { status: 400 }
    )
  }
}

// ── PRODUCTION: Sinch verification ────────────────────────
else {
    try {
      const response = await sinch.verification.verifications.reportSmsById(reportData)

      // Sinch returns status: 'SUCCESSFUL' | 'FAIL' | 'ERROR'
      if (response.status !== 'SUCCESSFUL') {
        await OtpVerification.updateOne(
          { _id: otpDoc._id },
          { $inc: { attempts: 1 } }
        )
        const attemptsLeft = 2 - otpDoc.attempts
        return NextResponse.json(
          { error: `Invalid code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.` },
          { status: 400 }
        )
      }
    } catch (sinchError) {
      // Sinch throws on wrong code too — treat same as invalid
      console.error('Sinch report error:', sinchError)

      await OtpVerification.updateOne(
        { _id: otpDoc._id },
        { $inc: { attempts: 1 } }
      )
      const attemptsLeft = 2 - otpDoc.attempts
      return NextResponse.json(
        { error: `Invalid code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.` },
        { status: 400 }
      )
    }}

    // ── Code is correct  ────────────────────────────────
    await OtpVerification.updateOne(
      { _id: otpDoc._id },
      { $set: { verified: true } }
    )


    const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

    const verificationToken = await new SignJWT({ phone, purpose, verified: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .setIssuedAt()
      .sign(secret)

    return NextResponse.json({ success: true, verificationToken })

  } catch (error) {
    console.error('verify-otp error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}


