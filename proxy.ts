//proxy.ts  
import createMiddleware from 'next-intl/middleware'
import { auth } from '@/lib/auth'
import { routing } from './i18n/routing'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const intlMiddleware = createMiddleware(routing)

// ── Routes that require login ──────────────────────────────
const PROTECTED_PATHS = [
  '/account',
  '/dashboard',
  '/pos',
]

export default async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Strip locale prefix to get the real path
  // e.g. '/en/account' → '/account'
  const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/'

  // Check if this is a protected path
  const isProtected = PROTECTED_PATHS.some(p => pathWithoutLocale.startsWith(p))

  if (isProtected) {
    const session = await auth()

    if (!session?.user) {
      // Not logged in → redirect to login
      // Preserve the locale in the redirect URL
      const locale = pathname.startsWith('/ar') ? 'ar' : 'en'
      const loginUrl = new URL(`/${locale}/login`, request.url)

      // Tell login page where to redirect after success
      loginUrl.searchParams.set('from', pathWithoutLocale)

      return NextResponse.redirect(loginUrl)
    }
  }

  // Not a protected path → hand off to next-intl
  return intlMiddleware(request)
}