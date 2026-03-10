// src/lib/auth.ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import clientPromise from '@/lib/db'
import { User } from '@/models/User'
import dbConnect from '@/lib/dbConnect'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import type { UserRole } from '@/lib/rbac'

// ── Zod validation schema ──────────────────────────────────
// Validates credentials BEFORE hitting the database
// If phone or password are missing/malformed, we reject immediately
const credentialsSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Invalid phone format'),
  password: z.string().min(1, 'Password is required'),
})

// ──  authorize() returns ───────────────────────────────
interface AuthorizedUser {
  id:          string
  phone:       string
  name:        string
  role:        UserRole
  permissions: string[]
}

// ── NextAuth config ────────────────────────────────────────
export const { handlers, auth, signIn, signOut } = NextAuth({


  adapter: MongoDBAdapter(clientPromise),

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, 
  },

  providers: [
    Credentials({
      name: 'Phone & Password',

      // These tell NextAuth what fields to expect
      // from your signIn('credentials', { phone, password }) call
      credentials: {
        phone:    { label: 'Phone', type: 'tel' },
        password: { label: 'Password', type: 'password' },
      },

      // ── The heart of authentication ────────────────────
      // Return user object → login succeeds
      // Return null / throw → login fails
      async authorize(credentials): Promise<AuthorizedUser | null> {

        // Step 1: Validate input shape with Zod
        // This runs BEFORE any DB call — fast rejection of bad data
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) {
          // Throwing gives NextAuth the error message to pass back
          throw new Error(parsed.error.message)
        }

        const { phone, password } = parsed.data

        // Step 2: Connect to MongoDB via Mongoose
        await dbConnect()

        // Step 3: Find user by phone number
        // .select('+passwordHash') needed because we might exclude it by default later
        const user = await User.findOne({ phone }).lean()

        if (!user) {
          throw new Error('Invalid phone number or password')
        }

        // Step 4: Check account is active
        // Inactive = manager has deactivated this account
        if (!user.isActive) {
          throw new Error('Your account has been deactivated. Please contact support.')
        }

        // Step 5: Check phone is verified
        // Unverified = registered but never completed OTP step
        if (!user.phoneVerified) {
          throw new Error('Please verify your phone number first.')
        }

        // Step 6: Compare password against bcrypt hash
        // bcrypt.compare() is intentionally slow — makes brute force expensive
        const passwordMatch = await bcrypt.compare(password, user.passwordHash)

        if (!passwordMatch) {
          throw new Error('Invalid phone number or password')
        }

        // Step 7: Update last login timestamp
        User.updateOne(
          { _id: user._id },
          { $set: { lastLoginAt: new Date() } }
        ).exec()

        // Step 8: Return the user object
        // This gets passed to the jwt() callback as the 'user' parameter
        // Only return what you need in the session — not passwordHash!
        return {
          id:          user._id.toString(),
          phone:       user.phone,
          name:        user.fullName,
          role:        user.role as UserRole,
          // Staff get their custom permissions, others get empty array
          // Role-level permissions are checked via can() in rbac.ts
          permissions: user.staffProfile?.permissions ?? [],
        }
      },
    }),
  ],

  callbacks: {
    // ── jwt() ────────────────────────────────────────────
    // Fires when:
    //   1. User first logs in → 'user' object is present
    //   2. Every subsequent request → only 'token' is present
    //
    async jwt({ token, user }) {
      if (user) {
        // First login — enrich the token with our custom fields
        // Cast because NextAuth's User type doesn't know about our fields
        const u = user as AuthorizedUser
        token.id          = u.id
        token.phone       = u.phone
        token.role        = u.role
        token.permissions = u.permissions
      }
      return token
    },

    // ── session() ────────────────────────────────────────
    // Fires when useSession() or auth() is called
    // Takes fields from the token and exposes them to your app
    //
    // Think of this as: "what comes OUT of the cookie"
    // Only include what the frontend actually needs
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