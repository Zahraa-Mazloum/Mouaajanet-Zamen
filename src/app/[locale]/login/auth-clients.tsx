// src/app/[locale]/login/auth-clients.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import BgElements from '@/components/BgElements'

// ── Types ──────────────────────────────────────────────────
// Each step of the multi-step form
type AuthMode = 'login' | 'register' | 'forgot'

// Registration has 3 steps, login has 1, forgot has 2
type RegisterStep = 'phone' | 'otp' | 'password'
type ForgotStep   = 'phone' | 'otp' | 'newpassword'

// API response shape — every endpoint returns { error? } or { success? }
interface ApiResponse {
  error?:             string
  success?:           boolean
  verificationToken?: string
  message?:           string
}

// ── Component ──────────────────────────────────────────────
export default function AuthClients() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('auth')

  // Which form are we showing?
  const [mode, setMode] = useState<AuthMode>('login')

  // Multi-step form state
  const [registerStep, setRegisterStep] = useState<RegisterStep>('phone')
  const [forgotStep,   setForgotStep]   = useState<ForgotStep>('phone')

  // Form field values
  const [phone,    setPhone]    = useState<string>('')
  const [otp,      setOtp]      = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [confirm,  setConfirm]  = useState<string>('')
  const [fullName, setFullName] = useState<string>('')

  // The verification token received after OTP success
  // Carried from Step 2 → Step 3 of registration/forgot
  const [verificationToken, setVerificationToken] = useState<string>('')

  // UI state
  const [loading, setLoading] = useState<boolean>(false)
  const [error,   setError]   = useState<string>('')
  const [resendTimer, setResendTimer] = useState<number>(0)

  // ── Reset everything when switching modes ─────────────
  function switchMode(newMode: AuthMode) {
    setMode(newMode)
    setRegisterStep('phone')
    setForgotStep('phone')
    setPhone('')
    setOtp('')
    setPassword('')
    setConfirm('')
    setFullName('')
    setVerificationToken('')
    setError('')
  }

  // ── Resend OTP countdown timer ─────────────────────────
  function startResendTimer() {
    setResendTimer(60) // 60 second cooldown
    const interval = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  // ── Generic API caller ─────────────────────────────────
  // Reduces repetition — every API call follows same pattern
  async function callApi(
    endpoint: string,
    body: Record<string, string>
  ): Promise<ApiResponse> {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    return res.json() as Promise<ApiResponse>
  }

  // ══════════════════════════════════════════════════════
  // HANDLER 1 — Login
  // ══════════════════════════════════════════════════════
  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // signIn() calls your authorize() function in auth.ts
      // redirect: false → we handle the redirect ourselves
      const result = await signIn('credentials', {
        phone,
        password,
        redirect: false,
      })

      // if (result?.error) {
      //   // NextAuth passes the error message from authorize()'s throw
      //   setError(result.code)
      //   return
      // }
      if (result?.code && result.code !== 'null') {
	  setError(result.code)   
  return
	}


      if (result?.ok) {
        // Login success → go to account page (or wherever they came from)
        router.push(`/${locale}/account`)
        router.refresh() // Force server components to re-render with new session
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════
  // HANDLER 2 — Send OTP (used by both register and forgot)
  // ══════════════════════════════════════════════════════
  async function handleSendOtp(purpose: 'register' | 'reset') {
    setError('')
    setLoading(true)

    try {
      const data = await callApi('/api/auth/send-otp', { phone, purpose })

      if (data.error) {
        setError(data.error)
        return
      }

      // OTP sent → move to OTP entry step
      if (purpose === 'register') setRegisterStep('otp')
      else setForgotStep('otp')

      startResendTimer()

    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════
  // HANDLER 3 — Verify OTP
  // ══════════════════════════════════════════════════════
  async function handleVerifyOtp(purpose: 'register' | 'reset') {
    setError('')
    setLoading(true)

    try {
      const data = await callApi('/api/auth/verify-otp', { phone, code: otp, purpose })

      if (data.error) {
        setError(data.error)
        return
      }

      // Save the verification token — we need it for the next step
      if (data.verificationToken) {
        setVerificationToken(data.verificationToken)
      }

      // Move to password step
      if (purpose === 'register') setRegisterStep('password')
      else setForgotStep('newpassword')

    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════
  // HANDLER 4 — Complete Registration
  // ══════════════════════════════════════════════════════
  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    // Client-side check before API call
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      // Step A: Create the account
      const data = await callApi('/api/auth/register', {
        verificationToken,
        fullName,
        password,
      })

      if (data.error) {
        setError(data.error)
        return
      }

      // Step B: Auto-login after account creation
      // No need to make the user log in manually
      const result = await signIn('credentials', {
        phone,
        password,
        redirect: false,
      })

      if (result?.ok) {
        router.push(`/${locale}/account`)
        router.refresh()
      }

    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════
  // HANDLER 5 — Reset Password
  // ══════════════════════════════════════════════════════
  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const data = await callApi('/api/auth/reset-password', {
        verificationToken,
        newPassword: password,
      })

      if (data.error) {
        setError(data.error)
        return
      }

      // Auto-login after password reset
      const result = await signIn('credentials', {
        phone,
        password,
        redirect: false,
      })

      if (result?.ok) {
        router.push(`/${locale}/account`)
        router.refresh()
      }

    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── What title and subtitle to show ───────────────────
  function getTitle(): string {
    if (mode === 'login')  return t('welcomeBack')
    if (mode === 'forgot') return t('forgotPassword')
    const titles: Record<RegisterStep, string> = {
      phone:    t('createAccount'),
      otp:     t('enterOtp'),
      password: t('setPassword'),
    }
    return titles[registerStep]
  }

  function getSubtitle(): string {
    if (mode === 'login')  return t('signInToContinue')
    if (mode === 'forgot' && forgotStep === 'otp') return t('otpSent').replace('{phone}', phone)
    if (mode === 'register' && registerStep === 'otp') return t('otpSent').replace('{phone}', phone)
    if (mode === 'register' && registerStep === 'password') return t('setPasswordHint')
    return ''
  }

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-28 md:py-11">
      <BgElements />

      <div className="relative z-10 w-full max-w-sm sm:max-w-md md:max-w-xl lg:max-w-2xl rounded-4xl sm:rounded-[40px] overflow-hidden shadow-2xl"
        style={{ background: 'var(--cardbackground)' }}
      >
        {/* ── Cheese drip image — your design preserved ── */}
        <div className="w-full overflow-hidden max-h-30 sm:max-h-40 md:max-h-41">
          <Image
            src="/backgroundElements/Cheese.png"
            alt="Cheese Drip"
            width={800}
            height={300}
            className="w-full h-auto object-cover object-top"
          />
        </div>

        <div className="relative px-6 sm:px-10 md:px-12 pb-6 sm:pb-8 pt-4 sm:pt-5">

          {/* ── Title ── */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold"
              style={{ color: 'var(--mainheading)' }}>
              {getTitle()}
            </h1>
            {getSubtitle() && (
              <p className="text-sm sm:text-base mt-1"
                style={{ color: 'var(--mutedtext)' }}>
                {getSubtitle()}
              </p>
            )}
          </div>

          {/* ── Step indicator for registration ── */}
          {mode === 'register' && (
            <div className="flex items-center justify-center gap-2 mb-6">
              {(['phone', 'otp', 'password'] as RegisterStep[]).map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                    style={{
                      background: registerStep === step || (i < ['phone','otp','password'].indexOf(registerStep))
                        ? 'var(--primarybutton)' : 'var(--bgcolor)',
                      color: registerStep === step || (i < ['phone','otp','password'].indexOf(registerStep))
                        ? 'white' : 'var(--mutedtext)',
                    }}
                  >
                    {i + 1}
                  </div>
                  {i < 2 && (
                    <div className="w-8 h-0.5 rounded"
                      style={{ background: 'var(--borderaccent)' }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Error message ── */}
          {error && (
            <div className="mb-4 p-3 rounded-lg border text-sm"
              style={{
                background:   'rgba(255,77,79,0.08)',
                borderColor:  'var(--errortext)',
                color:        'var(--errortext)',
              }}>
              {error}
            </div>
          )}

          {/* ════════════════════════════════════════════
              FORM SECTIONS — conditionally rendered
          ════════════════════════════════════════════ */}

          {/* ── LOGIN FORM ── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <PhoneInput value={phone} onChange={setPhone} />
              <PasswordInput
                label={t('password')}
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={setPassword}
              />

              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs hover:underline"
                style={{ color: 'var(--mutedtext)' }}
              >
                {t('forgotPassword')}
              </button>

              <SubmitButton loading={loading}>
                {loading ? t('signingIn') : t('signIn')}
              </SubmitButton>
            </form>
          )}

          {/* ── REGISTER: Step 1 — Phone ── */}
          {mode === 'register' && registerStep === 'phone' && (
            <form onSubmit={(e) => { e.preventDefault(); handleSendOtp('register') }}
              className="space-y-4">
              <Input label={t('fullName')} type="text"
                placeholder={t('fullNamePlaceholder')}
                value={fullName} onChange={setFullName} required />
              <PhoneInput value={phone} onChange={setPhone} />
              <SubmitButton loading={loading}>
                {loading ? 'Sending...' : 'Send WhatsApp Code'}
              </SubmitButton>
            </form>
          )}

          {/* ── REGISTER: Step 2 — OTP ── */}
          {mode === 'register' && registerStep === 'otp' && (
            <form onSubmit={(e) => { e.preventDefault(); handleVerifyOtp('register') }}
              className="space-y-4">
              <OtpInput value={otp} onChange={setOtp} />
              <SubmitButton loading={loading}>
                {loading ? t('verifying') : t('verify')}
              </SubmitButton>
              <ResendButton
                timer={resendTimer}
                onResend={() => handleSendOtp('register')}
              />
              <BackButton onClick={() => { setRegisterStep('phone'); setError('') }} />
            </form>
          )}

          {/* ── REGISTER: Step 3 — Password ── */}
          {mode === 'register' && registerStep === 'password' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <PasswordInput
                label={t('password')}
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={setPassword}
              />
              <PasswordInput
                label={t('confirmPassword')}
                placeholder={t('passwordPlaceholder')}
                value={confirm}
                onChange={setConfirm}
              />
              <PasswordStrength password={password} />
              <SubmitButton loading={loading}>
                {loading ? t('creating') : t('createBtn')}
              </SubmitButton>
            </form>
          )}

          {/* ── FORGOT: Step 1 — Phone ── */}
          {mode === 'forgot' && forgotStep === 'phone' && (
            <form onSubmit={(e) => { e.preventDefault(); handleSendOtp('reset') }}
              className="space-y-4">
              <PhoneInput value={phone} onChange={setPhone} />
              <SubmitButton loading={loading}>
                {loading ? 'Sending...' : 'Send Reset Code'}
              </SubmitButton>
              <BackButton onClick={() => switchMode('login')} />
            </form>
          )}

          {/* ── FORGOT: Step 2 — OTP ── */}
          {mode === 'forgot' && forgotStep === 'otp' && (
            <form onSubmit={(e) => { e.preventDefault(); handleVerifyOtp('reset') }}
              className="space-y-4">
              <OtpInput value={otp} onChange={setOtp} />
              <SubmitButton loading={loading}>
                {loading ? t('verifying') : t('verify')}
              </SubmitButton>
              <ResendButton
                timer={resendTimer}
                onResend={() => handleSendOtp('reset')}
              />
            </form>
          )}

          {/* ── FORGOT: Step 3 — New Password ── */}
          {mode === 'forgot' && forgotStep === 'newpassword' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <PasswordInput
                label="New Password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={setPassword}
              />
              <PasswordInput
                label={t('confirmPassword')}
                placeholder={t('passwordPlaceholder')}
                value={confirm}
                onChange={setConfirm}
              />
              <PasswordStrength password={password} />
              <SubmitButton loading={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </SubmitButton>
            </form>
          )}

          {/* ── Mode toggle at bottom ── */}
          <div className="text-center mt-6">
            {mode === 'login' ? (
              <button type="button" onClick={() => switchMode('register')}
                className="text-sm font-medium hover:underline"
                style={{ color: 'var(--mutedtext)' }}>
                {t('noAccount')}
              </button>
            ) : mode === 'register' ? (
              <button type="button" onClick={() => switchMode('login')}
                className="text-sm font-medium hover:underline"
                style={{ color: 'var(--mutedtext)' }}>
                {t('hasAccount')}
              </button>
            ) : null}
          </div>

        </div>
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════════
// SMALL REUSABLE SUB-COMPONENTS
// Extracted to keep the main component readable
// ══════════════════════════════════════════════════════════

function Input({
  label, type, placeholder, value, onChange, required = true,
}: {
  label: string; type: string; placeholder: string
  value: string; onChange: (v: string) => void; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1"
        style={{ color: 'var(--secondarytext)' }}>
        {label}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none transition"
        style={{
          background:   'var(--input-bg)',
          borderColor:  'var(--input-border)',
          color:        'var(--input-text)',
        }}
      />
    </div>
  )
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1"
        style={{ color: 'var(--secondarytext)' }}>
        Phone Number
      </label>
      <input
        type="tel"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="+9611234567"
        className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none transition"
        style={{
          background:  'var(--input-bg)',
          borderColor: 'var(--input-border)',
          color:       'var(--input-text)',
        }}
      />
      <p className="text-xs mt-1" style={{ color: 'var(--mutedtext)' }}>
        Include country code, e.g. +961 for Lebanon
  </p>
    </div>
  )
}

function PasswordInput({
  label, placeholder, value, onChange
}: {
  label: string; placeholder: string
  value: string; onChange: (v: string) => void
}) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <label className="block text-sm font-medium mb-1"
        style={{ color: 'var(--secondarytext)' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-2.5 pr-10 rounded-lg border text-sm focus:outline-none transition"
          style={{
            background:  'var(--input-bg)',
            borderColor: 'var(--input-border)',
            color:       'var(--input-text)',
          }}
        />
        {/* Show/hide password toggle */}
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
          style={{ color: 'var(--mutedtext)' }}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-center"
        style={{ color: 'var(--secondarytext)' }}>
        6-Digit Code
      </label>
      <input
        type="text"
        inputMode="numeric"   // shows number keyboard on mobile
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={value}
        // Strip non-digits as they type
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        autoFocus
        className="w-full px-4 py-3 rounded-lg border text-center text-2xl
                   tracking-[0.5em] font-mono focus:outline-none transition"
        style={{
          background:  'var(--input-bg)',
          borderColor: 'var(--input-border)',
          color:       'var(--input-text)',
        }}
      />
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  // Calculate strength score 0-4
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length

  const colors = ['var(--errortext)', 'var(--errortext)', '#f59e0b', '#22c55e']
  const labels = ['Too short', 'Weak', 'Fair', 'Strong', 'Very strong']

  if (!password) return null

  return (
    <div>
      <div className="flex gap-1 mb-1">
        {[0,1,2,3].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i < score ? colors[score - 1] : 'var(--borderaccent)' }} />
        ))}
      </div>
      <p className="text-xs" style={{ color: colors[score - 1] || 'var(--mutedtext)' }}>
        {labels[score]}
      </p>
    </div>
  )
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-3 rounded-lg font-medium text-white transition disabled:opacity-60"
      style={{ background: 'var(--primarybutton)' }}
    >
      {children}
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full py-2 text-sm hover:underline"
      style={{ color: 'var(--mutedtext)' }}>
      ← Go back
    </button>
  )
}

function ResendButton({ timer, onResend }: { timer: number; onResend: () => void }) {
  return (
    <p className="text-center text-sm" style={{ color: 'var(--mutedtext)' }}>
      Didn&apos;t receive it?{' '}
      {timer > 0 ? (
        <span>Resend in {timer}s</span>
      ) : (
        <button type="button" onClick={onResend}
          className="font-medium hover:underline"
          style={{ color: 'var(--primarybutton)' }}>
          Resend code
        </button>
      )}
    </p>
  )
}

