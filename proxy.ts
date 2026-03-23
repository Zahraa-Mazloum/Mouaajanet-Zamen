// proxy.ts
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'   // ← Edge-safe, no bcrypt
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import type { NextRequest } from 'next/server'

const { auth } = NextAuth(authConfig)
const intl     = createIntlMiddleware(routing)

export default auth(function middleware(request: NextRequest) {

  return intl(request)
})

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\\.png|.*\\.jpg).*)',
  ],
}