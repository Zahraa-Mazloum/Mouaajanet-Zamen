// src/lib/rbac.ts

// ── Role type ──────────────────────────────────────────────
export type UserRole = 'developer' | 'manager' | 'staff' | 'customer'

// ── Permission map ─────────────────────────────────────────
// Format: 'resource:action'
// '*' = wildcard, grants everything
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  developer: ['*'],

  manager: [
    'dashboard:read',
    'orders:read',    'orders:write',    'orders:delete',
    'products:read',  'products:write',  'products:delete',
    'staff:read',     'staff:write',
    'customers:read', 'customers:write',
    'inventory:read', 'inventory:write',
    'accounting:read','accounting:write',
    'reports:read',
    'branches:read',  'branches:write',
    'whatsapp:send',
    'pos:access',
    'settings:read',  'settings:write',
  ],

  staff: [
    'orders:read',   'orders:write',
    'products:read',
    'pos:access',
    'customers:read',
    'inventory:read',
  ],

  customer: [
    'profile:read',    'profile:write',
    'orders:own:read',
    'products:read',
    'cart:write',
  ],
}

// ── can() ──────────────────────────────────────────────────
// to check a permission
// Examples:
//   can('manager', 'orders:delete')  → true
//   can('staff', 'accounting:read')  → false
//   can('developer', 'anything')     → true (wildcard)
export function can(role: UserRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  return perms.includes('*') || perms.includes(permission)
}

// ── requirePermission() ────────────────────────────────────
//  to gate access
// Throws UNAUTHORIZED or FORBIDDEN so the route can return 401/403
export async function requirePermission(permission: string): Promise<void> {
  const { auth } = await import('@/lib/auth') 
  const session = await auth()

  if (!session?.user) {
    throw new Error('UNAUTHORIZED')
  }

  if (!can(session.user.role as UserRole, permission)) {
    throw new Error('FORBIDDEN')
  }
}