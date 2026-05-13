// src/lib/apiAuth.ts



import { auth } from '@/lib/auth'                 
import { checkPermission } from '@/lib/rbac'      
import { unauthorized, forbidden } from './apiResponse'
import { NextResponse } from 'next/server'

export type Resource =
  | 'products' | 'categories' | 'inventory' | 'orders'
  | 'staff' | 'customers' | 'reports' | 'settings' | 'pos'

export type Action = 'read' | 'write' | 'delete'

export interface AuthResult {
  session: {
    user: {
      id: string
      role: 'developer' | 'manager' | 'staff' | 'customer'
      name?: string | null
      email?: string | null
    }
  }
}


export async function requireAuth(
  _request: Request,
  resource: Resource,
  action: Action
): Promise<AuthResult | NextResponse> {
    
  const session = await auth()

  if (!session?.user) {
    return unauthorized()
  }

  const role = (session.user as { role?: string }).role
  const hasPermission = checkPermission(role, resource, action)

  if (!hasPermission) {
    return forbidden(`Your role (${role}) cannot perform '${action}' on '${resource}'`)
  }

  return { session: session as AuthResult['session'] }
}


export async function requireSession(): Promise<AuthResult | NextResponse> {
  const session = await auth()
  if (!session?.user) return unauthorized()
  return { session: session as AuthResult['session'] }
}