// src/app/[locale]/account/page.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'

export default async function AccountPage() {
  const session = await auth()
  const locale  = await getLocale()

  // ── Not logged in → redirect to login ─────────────────
  // This happens on the SERVER before any HTML is sent
  // The user never sees a flash of the protected page
  if (!session?.user) {
    redirect(`/${locale}/login?from=account`)
    // ?from=account → after login we can redirect back here
  }

  const { name, phone, role } = session.user as {
    name:  string
    phone: string
    role:  string
  }

  return (
    <main className="min-h-screen px-4 py-12 max-w-2xl mx-auto">

      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--mainheading)' }}>
          My Account
        </h1>
        <p style={{ color: 'var(--mutedtext)' }}>
          Welcome back, {name?.split(' ')[0]}
        </p>
      </div>

      {/* ── Profile Card ── */}
      <div className="rounded-2xl p-6 space-y-4 shadow-sm"
        style={{ background: 'var(--cardbackground)', border: '1px solid var(--borderaccent)' }}>

        <h2 className="text-lg font-semibold" style={{ color: 'var(--mainheading)' }}>
          Profile Information
        </h2>

        <ProfileRow label="Full Name"     value={name} />
        <ProfileRow label="Phone Number"  value={phone} />
        <ProfileRow label="Account Type"  value={role.charAt(0).toUpperCase() + role.slice(1)} />

      </div>

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <QuickLink href={`/${locale}/account/orders`}  label="My Orders"    emoji="📦" />
        <QuickLink href={`/${locale}/account/wishlist`} label="Wishlist"    emoji="❤️" />
        <QuickLink href={`/${locale}/account/settings`} label="Settings"   emoji="⚙️" />
        <QuickLink href={`/${locale}/account/loyalty`}  label="Loyalty Points" emoji="⭐" />
      </div>

    </main>
  )
}

// ── Sub-components ─────────────────────────────────────────

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-3"
      style={{ borderBottom: '1px solid var(--borderaccent)' }}>
      <span className="text-sm" style={{ color: 'var(--mutedtext)' }}>
        {label}
      </span>
      <span className="font-medium" style={{ color: 'var(--primarytext)' }}>
        {value}
      </span>
    </div>
  )
}

function QuickLink({ href, label, emoji }: { href: string; label: string; emoji: string }) {
  return (
    <a href={href}
      className="flex items-center gap-3 p-4 rounded-xl transition hover:scale-[1.02]"
      style={{
        background:  'var(--bgcolor)',
        border:      '1px solid var(--borderaccent)',
      }}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="font-medium text-sm" style={{ color: 'var(--primarytext)' }}>
        {label}
      </span>
    </a>
  )
}