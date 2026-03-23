// src/app/[locale]/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Cairo } from 'next/font/google'
import { notFound } from 'next/navigation'
import { getMessages } from 'next-intl/server'
import { routing } from '../../../i18n/routing'
import { Providers } from '@/providers'
import Navbar from '@/components/Navbar'
import '../globals.css'

// ── English font ──────────────────────────────────────────
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// ── Arabic font ───────────────────────────────────────────
const cairo = Cairo({
  subsets: ['arabic', 'latin'], 
  variable: '--font-cairo',
  display: 'swap',
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: 'معجنات زمان — Mouaajanet Zamen',
  description: 'Fresh bakery — online ordering and in-store experience',
}

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params

  if (!routing.locales.includes(locale as 'en' | 'ar')) {
    notFound()
  }

  const messages = await getMessages()

  const isArabic = locale === 'ar'


  return (
  <html
    lang={locale}
    dir={isArabic ? 'rtl' : 'ltr'}
    className={isArabic ? cairo.variable : inter.variable}
    suppressHydrationWarning
  >
    <head>
 
    </head>
    <body className="antialiased">
      <Providers locale={locale} messages={messages}>
        <Navbar />
        {children}
      </Providers>
    </body>
  </html>
)}
