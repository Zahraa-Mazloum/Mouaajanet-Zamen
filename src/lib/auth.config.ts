// src/lib/auth.config.ts
import type { NextAuthConfig } from 'next-auth'
import type { UserRole } from '@/lib/rbac'

export const authConfig: NextAuthConfig = {
  trustHost: true,

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
  },

  pages: {
    signIn: '/en/login',
    error:  '/en/login',
  },

  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const pathname   = request.nextUrl.pathname
      const path       = pathname.replace(/^\/(en|ar)/, '') || '/'

      const PROTECTED_PATHS = ['/account', '/dashboard', '/pos']
      const isProtected = PROTECTED_PATHS.some(p => path.startsWith(p))

      if (isProtected && !isLoggedIn) {
        const locale   = pathname.startsWith('/ar') ? 'ar' : 'en'
        const loginUrl = new URL(`/${locale}/login`, request.nextUrl.origin)
        loginUrl.searchParams.set('from', path)
        return Response.redirect(loginUrl)
      }

      return true
    },

    async jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; phone: string; role: UserRole; permissions: string[] }
        token.id          = u.id
        token.phone       = u.phone
        token.role        = u.role
        token.permissions = u.permissions
      }
      return token
    },

    async session({ session, token }) {
      session.user.id          = token.id as string
      session.user.phone       = token.phone as string
      session.user.role        = token.role as UserRole
      session.user.permissions = token.permissions as string[]
      return session
    },
  },

  providers: [],
}