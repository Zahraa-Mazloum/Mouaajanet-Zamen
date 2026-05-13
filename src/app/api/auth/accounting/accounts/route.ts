// src/app/api/accounting/accounts/route.ts
//
// GET  /api/accounting/accounts          → Chart of accounts list
// POST /api/accounting/accounts          → Create a new account
//
// Query params for GET:
//   ?type=expense                        → filter by type
//   ?subtype=salary                      → filter by subtype
//   ?search=cash                         → search name, nameAr, code
//   ?active=true                         → only active accounts (default: all)

import { NextResponse } from 'next/server'
import { requireAuth }  from '@/lib/apiAuth'
import { ok, created, serverError, badRequest } from '@/lib/apiResponse'
import { validateBody, validateQuery } from '@/lib/apiValidate'
import {
  listAccounts,
  createAccount,
  CreateAccountSchema,
  ListAccountsQuerySchema,
} from '@/lib/services/account.service'

export async function GET(request: Request) {
  // Any manager or developer can read the chart of accounts
  const guard = await requireAuth(request, 'settings', 'read')
  if (guard instanceof NextResponse) return guard

  const query = validateQuery(request, ListAccountsQuerySchema)
  if (query instanceof NextResponse) return query

  try {
    const accounts = await listAccounts(query)
    return ok(accounts)
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(request: Request) {
  // Only managers and developers can create accounts
  const guard = await requireAuth(request, 'settings', 'write')
  if (guard instanceof NextResponse) return guard

  const body = await validateBody(request, CreateAccountSchema)
  if (body instanceof NextResponse) return body

  try {
    const account = await createAccount(body, guard.session.user.id)
    return created(account)
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message)
    return serverError(err)
  }
}

// =============================================================================
// src/app/api/accounting/accounts/[id]/route.ts
//
// GET    /api/accounting/accounts/:id
// PATCH  /api/accounting/accounts/:id   → name, nameAr, description, isActive only
// DELETE /api/accounting/accounts/:id   → blocked for system accounts and used accounts
// =============================================================================

import { notFound, noContent } from '@/lib/apiResponse'
import {
  getAccountById,
  updateAccount,
  deleteAccount,
  UpdateAccountSchema,
} from '@/lib/services/account.service'

type Params = { params: Promise<{ id: string }> }

export async function getAccount(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'settings', 'read')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    const account = await getAccountById(id)
    if (!account) return notFound('Account')
    return ok(account)
  } catch (err) {
    return serverError(err)
  }
}

export async function patchAccount(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'settings', 'write')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const body = await validateBody(request, UpdateAccountSchema)
  if (body instanceof NextResponse) return body

  try {
    const updated = await updateAccount(id, body)
    if (!updated) return notFound('Account')
    return ok(updated)
  } catch (err) {
    return serverError(err)
  }
}

export async function deleteAccountRoute(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'settings', 'delete')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    const deleted = await deleteAccount(id)
    if (!deleted) return notFound('Account')
    return noContent()
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message)
    return serverError(err)
  }
}

// =============================================================================
// src/app/api/accounting/accounts/preview-code/route.ts
//
// GET /api/accounting/accounts/preview-code?type=expense
//
// Returns the code that WILL be assigned when a new account of this type
// is created. The UI shows this to the manager before they save:
//   "This account will be assigned code: 5006"
//
// This is a read-only preview — it does not reserve the code.
// Note: in the rare case of concurrent account creation, the actual
// assigned code may be different. The UI should refresh after save.
// =============================================================================

import { previewNextCode } from '@/lib/services/account.service'
import { z }               from 'zod'

const PreviewQuerySchema = z.object({
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
})

export async function previewCode(request: Request) {
  const guard = await requireAuth(request, 'settings', 'read')
  if (guard instanceof NextResponse) return guard

  const query = validateQuery(request, PreviewQuerySchema)
  if (query instanceof NextResponse) return query

  try {
    const preview = await previewNextCode(query.type)
    return ok(preview)
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message)
    return serverError(err)
  }
}

// =============================================================================
// src/app/api/admin/seed/route.ts
//
// GET /api/admin/seed
//
// One-time setup endpoint. Run it once after deployment to create the
// minimum system accounts. Protected to developer-only.
// After running, this route can be removed or kept for re-seeding.
// =============================================================================

import { seedChartOfAccounts } from '@/lib/seed/accounts.seed'

export async function runSeed(request: Request) {
  // Developer-only — the most restrictive permission
  const guard = await requireAuth(request, 'settings', 'delete')
  if (guard instanceof NextResponse) return guard

  // Extra safety: only allow in development or with explicit env flag
  if (
    process.env.NODE_ENV !== 'development' &&
    process.env.ALLOW_SEED !== 'true'
  ) {
    return badRequest(
      'Seeding is disabled in production. ' +
      'Set ALLOW_SEED=true in environment variables to enable it.'
    )
  }

  try {
    const result = await seedChartOfAccounts()
    return ok({
      message: 'Chart of accounts seeded successfully',
      ...result,
    })
  } catch (err) {
    return serverError(err)
  }
}