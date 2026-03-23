// src/app/api/auth/send-otp/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import dbConnect from '@/lib/dbConnect'
import { OtpVerification } from '@/models/OtpVerification'
import { SinchClient, Verification } from '@sinch/sdk-core'

const sendOtpSchema = z.object({
  phone:   z.string().regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format e.g. +9611234567'),
  purpose: z.enum(['register', 'reset']),
})

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parsed = sendOtpSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }

    const { phone, purpose } = parsed.data

    await dbConnect()

    // ── Rate limit: max 3 OTP requests per phone per 15 min ──
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
    const recentCount = await OtpVerification.countDocuments({
      phone,
      purpose,
      createdAt: { $gte: fifteenMinutesAgo },
    })

    if (recentCount >= 3) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait 15 minutes.' },
        { status: 429 }
      )
    }

    // ── For register: phone must NOT exist ───────────────
    if (purpose === 'register') {
      const { User } = await import('@/models/User')
      const exists = await User.findOne({ phone }).lean()
      if (exists) {
        return NextResponse.json(
          { error: 'An account with this number already exists. Please log in.' },
          { status: 409 }
        )
      }
    }

    // ── For reset: phone MUST exist ───────────────────────
    if (purpose === 'reset') {
      const { User } = await import('@/models/User')
      const exists = await User.findOne({ phone }).lean()
      if (!exists) {
        return NextResponse.json(
          { error: 'No account found with this number.' },
          { status: 404 }
        )
      }
    }

    // ── DEV MODE: skip Sinch, use fixed code ──────────────────
if (process.env.NODE_ENV === 'development') {
  await OtpVerification.create({
    phone,
    code:    'DEV_BYPASS', // special marker
    purpose,
  })

  return NextResponse.json({
    success: true,
    message: 'DEV MODE: use code 123456',
    devCode: '123456', 
  })
}
    // ── Start Sinch SMS verification ──────────────────────
    // Sinch generates and sends its own code
    // We store the sinchId so we can report against it in verify-otp
    const sinch = new SinchClient({
      applicationKey:    process.env.SINCH_APP_KEY!,
      applicationSecret: process.env.SINCH_APP_SECRET!,
    })


    const requestData = Verification.startVerificationHelper.buildSmsRequest(phone)

    let sinchId: string
    try {
      const response = await sinch.verification.verifications.startSms(requestData)

      if (!response.id) throw new Error('Sinch did not return a verification ID')
      sinchId = response.id

      console.log(`Sinch verification started. ID: ${sinchId}`)
    } catch (sinchError) {
      console.error('Sinch error:', sinchError)
      return NextResponse.json(
        { error: 'Could not send SMS. Please check your number and try again.' },
        { status: 502 }
      )
    }

    await OtpVerification.create({
      phone,
      code:    sinchId, // sinchId stored here — used in verify step
      purpose,
    })

    return NextResponse.json(
      { success: true, message: 'SMS sent successfully' },
      { status: 200 }
    )

  } catch (error) {
    console.error('send-otp error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}