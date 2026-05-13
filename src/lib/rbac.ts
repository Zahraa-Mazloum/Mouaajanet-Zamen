// // src/lib/rbac.ts

// // ── Role type ──────────────────────────────────────────────
// export type UserRole = 'developer' | 'manager' | 'staff' | 'customer'

// // ── Permission map ─────────────────────────────────────────
// // Format: 'resource:action'
// // '*' = wildcard, grants everything
// const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
//   developer: ['*'],

//   manager: [
//     'dashboard:read',
//     'orders:read',    'orders:write',    'orders:delete',
//     'products:read',  'products:write',  'products:delete',
//     'staff:read',     'staff:write',
//     'customers:read', 'customers:write',
//     'inventory:read', 'inventory:write',
//     'accounting:read','accounting:write',
//     'reports:read',
//     'branches:read',  'branches:write',
//     'whatsapp:send',
//     'pos:access',
//     'settings:read',  'settings:write',
//   ],

//   staff: [
//     'orders:read',   'orders:write',
//     'products:read',
//     'pos:access',
//     'customers:read',
//     'inventory:read',
//   ],

//   customer: [
//     'profile:read',    'profile:write',
//     'orders:own:read',
//     'products:read',
//     'cart:write',
//   ],
// }

// // ── can() ──────────────────────────────────────────────────
// // to check a permission
// // Examples:
// //   can('manager', 'orders:delete')  → true
// //   can('staff', 'accounting:read')  → false
// //   can('developer', 'anything')     → true (wildcard)
// export function can(role: UserRole, permission: string): boolean {
//   const perms = ROLE_PERMISSIONS[role]
//   if (!perms) return false
//   return perms.includes('*') || perms.includes(permission)
// }

// // ── requirePermission() ────────────────────────────────────
// //  to gate access
// // Throws UNAUTHORIZED or FORBIDDEN so the route can return 401/403
// export async function requirePermission(permission: string): Promise<void> {
//   const { auth } = await import('@/lib/auth') 
//   const session = await auth()

//   if (!session?.user) {
//     throw new Error('UNAUTHORIZED')
//   }

//   if (!can(session.user.role as UserRole, permission)) {
//     throw new Error('FORBIDDEN')
//   }
// }


// src/lib/rbac.ts
//
// ─── ROLE-BASED ACCESS CONTROL ────────────────────────────────────────────────
// This file is the single source of truth for who can do what.
//
// KEY DESIGN DECISION: Purchase and Inventory are SEPARATE resources.
// A staff member at the counter may have inventory:read (to check stock)
// but never purchase:write (they shouldn't be creating supplier POs).
// A purchasing manager may have purchase:write but limited inventory access.
//
// ─── HOW TO READ THE PERMISSION MAP ──────────────────────────────────────────
//   '*' in the actions array = full access (read + write + delete)
//   The key is the resource name (must match what's passed to requireAuth())
// ─────────────────────────────────────────────────────────────────────────────

type Action   = 'read' | 'write' | 'delete'
type Resource =
  | 'products'
  | 'categories'
  | 'inventory'   // stock alerts, raw materials, adjustments, stock movements
  | 'purchase'    // suppliers, purchase orders, receiving — SEPARATE from inventory
  | 'orders'
  | 'pos'
  | 'staff'
  | 'customers'
  | 'reports'
  | 'settings'

type Permissions = Partial<Record<Resource, Action[] | ['*']>>

// ─────────────────────────────────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<string, Permissions> = {

  // Developer: unrestricted access to everything
  developer: {
    products:   ['*'],
    categories: ['*'],
    inventory:  ['*'],
    purchase:   ['*'],   
    orders:     ['*'],
    pos:        ['*'],
    staff:      ['*'],
    customers:  ['*'],
    reports:    ['*'],
    settings:   ['*'],
  },

  // Manager: full operational control, no system settings
  manager: {
    products:   ['read', 'write', 'delete'],
    categories: ['read', 'write', 'delete'],
    inventory:  ['read', 'write'],   // can adjust stock, manage materials
    purchase:   ['read', 'write'],   // can create/confirm/receive POs, manage suppliers
    orders:     ['read', 'write', 'delete'],
    pos:        ['read', 'write'],
    staff:      ['read', 'write'],
    customers:  ['read', 'write'],
    reports:    ['read'],
    settings:   ['read', 'write'],
  },

  // Staff: operational tasks only — no purchasing, no destructive actions
  staff: {
    products:  ['read'],               // can browse products at POS
    inventory: ['read'],              // can check if something is in stock
    purchase:  [],                    // CANNOT create or view purchase orders
    orders:    ['read', 'write'],     // can take and manage orders
    pos:       ['read', 'write'],     // full POS access
    customers: ['read'],              // can look up customers
  },

  // Customer: self-service only — web store and own account
  customer: {
    products:  ['read'],
    orders:    ['read'],
    customers: ['read', 'write'],     // can edit their own profile/orders
  },
}

// ─────────────────────────────────────────────────────────────────────────────

export function checkPermission(
  role:     string | undefined,
  resource: Resource,
  action:   Action
): boolean {
  if (!role) return false

  const permissions = ROLE_PERMISSIONS[role]
  if (!permissions) return false

  const allowed = permissions[resource]
  if (!allowed || allowed.length === 0) return false

    if ((allowed as (Action | '*')[]).includes('*')) return true

  return (allowed as Action[]).includes(action)
}