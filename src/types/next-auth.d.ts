// src/types/next-auth.d.ts
// Extends NextAuth's built-in types so TypeScript knows
// about our custom fields on session.user

import { DefaultSession, DefaultJWT } from 'next-auth'
import { UserRole } from '@/lib/rbac'

declare module 'next-auth' {
  interface Session {
    user: {
      id:          string
      phone:       string
      role:        UserRole
      permissions: string[]
    } & DefaultSession['user']  
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id:          string
    phone:       string
    role:        UserRole
    permissions: string[]
  }
}

