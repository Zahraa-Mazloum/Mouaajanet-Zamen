// src/lib/auth.ts
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from './auth.config'        
import { User } from '@/models/User'
import dbConnect from '@/lib/dbConnect'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { UserRole } from '@/lib/rbac'

class AuthError extends CredentialsSignin {
  constructor(message: string) {
    super(message)
    this.message = message
    this.code    = message
  }
}

const credentialsSchema = z.object({
  phone:    z.string().regex(/^\+[1-9]\d{7,14}$/, 'Invalid phone format'),
  password: z.string().min(1, 'Password is required'),
})

interface AuthorizedUser {
  id:          string
  phone:       string
  name:        string
  role:        UserRole
  permissions: string[]
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,                    // ← spreads session, pages, callbacks

  logger: {
    error: () => {},
    warn:  () => {},
    debug: () => {},
  },

  providers: [
    Credentials({
      credentials: {
        phone:    { label: 'Phone',    type: 'tel'      },
        password: { label: 'Password', type: 'password' },
      },

      async authorize(credentials): Promise<AuthorizedUser | null> {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) {
          throw new AuthError(parsed.error.issues[0].message)
        }

        const { phone, password } = parsed.data

        await dbConnect()
        const user = await User.findOne({ phone }).lean()

        if (!user)             throw new AuthError('Invalid phone number or password')
        if (!user.isActive)    throw new AuthError('Your account has been deactivated.')
        if (!user.phoneVerified) throw new AuthError('Please verify your phone number first.')

        const passwordMatch = await bcrypt.compare(password, user.passwordHash)
        if (!passwordMatch)    throw new AuthError('Invalid phone number or password')

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
})