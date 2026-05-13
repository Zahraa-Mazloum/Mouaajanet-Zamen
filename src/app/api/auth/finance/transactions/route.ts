// ═════════════════════════════════════════════════════════════════════════════
// src/app/api/finance/transactions/route.ts
//
// GET  /api/finance/transactions   → list all transactions (income + expenses)
// POST /api/finance/transactions   → manually log an expense
//
// QUERY PARAMS FOR GET:
//   ?type=expense              → only expenses
//   ?type=income               → only income
//   ?category=salary           → only salary expenses
//   ?source=manual             → only manually entered (not auto-created)
//   ?currency=USD
//   ?from=2026-03-01&to=2026-03-31   → date range
//   ?staffId=<id>              → salary payments for one staff member
//   ?page=1&limit=30
// ═════════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireAuth }  from '@/lib/apiAuth'
import { ok, created, serverError, badRequest } from '@/lib/apiResponse'
import { validateBody, validateQuery }           from '@/lib/apiValidate'
import { buildMeta }    from '@/lib/apiResponse'

import {
  listTransactions,
  createTransaction,
  ListTransactionsQuerySchema,
  CreateTransactionSchema,
} from '@/lib/services/finance.service'

export async function GET(request: Request) {
  const guard = await requireAuth(request, 'reports', 'read')
  if (guard instanceof NextResponse) return guard

  const query = validateQuery(request, ListTransactionsQuerySchema)
  if (query instanceof NextResponse) return query

  try {
    const { transactions, total } = await listTransactions(query)
    return ok(transactions, buildMeta(total, query.page, query.limit))
  } catch (err) {
    return serverError(err)
  }
}

export async function POST(request: Request) {
  const guard = await requireAuth(request, 'reports', 'write')
  if (guard instanceof NextResponse) return guard

  const body = await validateBody(request, CreateTransactionSchema)
  if (body instanceof NextResponse) return body

  try {
    const tx = await createTransaction(body, guard.session.user.id)
    return created(tx)
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message)
    return serverError(err)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// src/app/api/finance/transactions/[id]/route.ts
//
// GET    /api/finance/transactions/:id
// PATCH  /api/finance/transactions/:id   → edit manual transactions only
// DELETE /api/finance/transactions/:id   → delete manual transactions only
// ═════════════════════════════════════════════════════════════════════════════

import { notFound, noContent } from '@/lib/apiResponse'
import {
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  UpdateTransactionSchema,
} from '@/lib/services/finance.service'

type Params = { params: Promise<{ id: string }> }

export async function getOne(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'reports', 'read')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    const tx = await getTransactionById(id)
    if (!tx) return notFound('Transaction')
    return ok(tx)
  } catch (err) {
    return serverError(err)
  }
}

export async function patchOne(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'reports', 'write')
  if (guard instanceof NextResponse) return guard

  const { id }   = await params
  const body     = await validateBody(request, UpdateTransactionSchema)
  if (body instanceof NextResponse) return body

  try {
    const updated = await updateTransaction(id, body)
    if (!updated) return notFound('Transaction')
    return ok(updated)
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message)
    return serverError(err)
  }
}

export async function deleteOne(request: Request, { params }: Params) {
  const guard = await requireAuth(request, 'reports', 'write')
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  try {
    const deleted = await deleteTransaction(id)
    if (!deleted) return notFound('Transaction')
    return noContent()
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message)
    return serverError(err)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// src/app/api/finance/reports/pnl/route.ts
//
// GET /api/finance/reports/pnl
//
// THE MAIN REPORT. Income vs Expenses = Profit.
//
// EXAMPLES:
//   ?year=2026                  → full year P&L
//   ?year=2026&month=3          → March 2026
//   ?year=2026&week=13          → Week 13 of 2026
//   ?year=2026&month=3&currency=USD  → March 2026, USD only
//
// RESPONSE EXAMPLE:
// {
//   "period": "March 2026",
//   "currency": "USD",
//   "income": [
//     { "category": "sale", "total": 4250.00, "count": 182 }
//   ],
//   "totalIncome": 4250.00,
//   "expenses": [
//     { "category": "raw_materials", "total": 1200.00, "count": 8 },
//     { "category": "salary",        "total": 1600.00, "count": 4 },
//     { "category": "rent",          "total": 500.00,  "count": 1 },
//     { "category": "utility",       "total": 120.00,  "count": 2 }
//   ],
//   "totalExpenses": 3420.00,
//   "netProfit": 830.00,
//   "isProfit": true,
//   "profitMargin": 19.5
// }
// ═════════════════════════════════════════════════════════════════════════════

import {
  getProfitAndLoss,
  PnLQuerySchema,
} from '@/lib/services/finance.service'

export async function getPnL(request: Request) {
  const guard = await requireAuth(request, 'reports', 'read')
  if (guard instanceof NextResponse) return guard

  const query = validateQuery(request, PnLQuerySchema)
  if (query instanceof NextResponse) return query

  try {
    const report = await getProfitAndLoss(query)
    return ok(report)
  } catch (err) {
    return serverError(err)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// src/app/api/finance/reports/summary/route.ts
//
// GET /api/finance/reports/summary?currency=USD
//
// Quick numbers for the dashboard home screen.
// Returns today, this week, and this month — all at once.
//
// RESPONSE:
// {
//   "today":     { "income": 340.00, "expenses": 52.00,  "profit": 288.00 },
//   "thisWeek":  { "income": 1820.00,"expenses": 640.00, "profit": 1180.00 },
//   "thisMonth": { "income": 4250.00,"expenses": 3420.00,"profit": 830.00 }
// }
// ═════════════════════════════════════════════════════════════════════════════

import { getSummary } from '@/lib/services/finance.service'
import { z }          from 'zod'

export async function getSummaryRoute(request: Request) {
  const guard = await requireAuth(request, 'reports', 'read')
  if (guard instanceof NextResponse) return guard

  const url      = new URL(request.url)
  const currency = url.searchParams.get('currency') as 'USD' | 'LBP' | null

  try {
    const summary = await getSummary(currency ?? undefined)
    return ok(summary)
  } catch (err) {
    return serverError(err)
  }
}