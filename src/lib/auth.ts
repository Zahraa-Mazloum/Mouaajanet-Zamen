// src/lib/auth.ts
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { User } from '@/models/User'
import dbConnect from '@/lib/dbConnect'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { UserRole } from '@/lib/rbac'


class AuthError extends CredentialsSignin {
  constructor(message: string) {
    super(message)
    this.message = message
    this.code = message  

  }
}

// ── Zod schema ─────────────────────────────────────────────
const credentialsSchema = z.object({
  phone:    z.string().regex(/^\+[1-9]\d{7,14}$/, 'Invalid phone format'),
  password: z.string().min(1, 'Password is required'),
})

// ── What authorize() returns ───────────────────────────────
interface AuthorizedUser {
  id:          string
  phone:       string
  name:        string
  role:        UserRole
  permissions: string[]
}

// ── NextAuth config ────────────────────────────────────────
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,

  // Silence terminal noise during development
  logger: {
    error: () => {},
    warn:  () => {},
    debug: () => {},
  },

  session: {
    strategy: 'jwt',       // session lives in a cookie — no database needed
    maxAge: 24 * 60 * 60,  // 24 hours
  },

  providers: [
    Credentials({
      credentials: {
        phone:    { label: 'Phone',    type: 'tel'      },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials): Promise<AuthorizedUser | null> {

        // ── Validate input ───────────────────────────────
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) {
          throw new AuthError(parsed.error.issues[0].message)
        }

        const { phone, password } = parsed.data

        // ── Query database ───────────────────────────────
        await dbConnect()
        const user = await User.findOne({ phone }).lean()

        if (!user) {
          // Same message for wrong phone AND wrong password
          // Never tell attackers which one was wrong
          throw new AuthError('Invalid phone number or password')
        }

        if (!user.isActive) {
          throw new AuthError('Your account has been deactivated.')
        }

        if (!user.phoneVerified) {
          throw new AuthError('Please verify your phone number first.')
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash)
        if (!passwordMatch) {
          throw new AuthError('Invalid phone number or password')
        }

        // Non-critical update — fire and forget
        User.updateOne(
          { _id: user._id },
          { $set: { lastLoginAt: new Date() } }
        ).exec()

        return {
          id:          user._id.toString(),
          phone:       user.phone,
          name:        user.fullName,
          role:        user.role as UserRole,
          permissions: user.staffProfile?.permissions ?? [],
        }
      },
    }),
  ],

  callbacks: {
    // Fires on login (user present) + every request (token only)
    async jwt({ token, user }) {
      if (user) {
        const u = user as AuthorizedUser
        token.id          = u.id
        token.phone       = u.phone
        token.role        = u.role
        token.permissions = u.permissions
      }
      return token
    },

    // Fires when useSession() or auth() is called
    async session({ session, token }) {
      session.user.id          = token.id as string
      session.user.phone       = token.phone as string
      session.user.role        = token.role as UserRole
      session.user.permissions = token.permissions as string[]
      return session
    },
  },

  pages: {
    signIn: '/en/login',
    error:  '/en/login',
  },
})