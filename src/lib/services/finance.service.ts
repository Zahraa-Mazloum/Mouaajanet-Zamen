// src/lib/services/finance.service.ts


import mongoose from 'mongoose'
import { z }    from 'zod'
import { Transaction } from '@/models/Transaction'
import dbConnect       from '@/lib/dbConnect'

// ── ISO Week number helper ────────────────────────────────────────────────────
function getISOWeek(date: Date): number {
  const d   = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Build the pre-computed period fields from a date
function getPeriodFields(date: Date) {
  return {
    periodYear:  date.getFullYear(),
    periodMonth: date.getMonth() + 1,  // 1-12
    periodWeek:  getISOWeek(date),
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═════════════════════════════════════════════════════════════════════════════

export const CreateTransactionSchema = z.object({
  type: z.literal('expense'),

  amount:      z.number().positive('Amount must be greater than 0'),
  currency:    z.enum(['USD', 'LBP']),
  description: z.string().min(1, 'Description is required').max(300).trim(),

  category: z.enum([
    'raw_materials', 'salary', 'rent', 'utility', 'equipment', 'marketing', 'other',
  ]),

  date: z.string().datetime({ offset: true }),

  notes:   z.string().max(500).default(''),

  staffId:           z.string().optional().nullable(),
})

export const UpdateTransactionSchema = z.object({
  amount:      z.number().positive().optional(),
  currency:    z.enum(['USD', 'LBP']).optional(),
  description: z.string().min(1).max(300).trim().optional(),
  category:    z.enum([
    'raw_materials', 'salary', 'rent', 'utility', 'equipment', 'marketing', 'other',
  ]).optional(),
  date:        z.string().datetime({ offset: true }).optional(),
  notes:       z.string().max(500).optional(),
  staffId:     z.string().optional().nullable(),
})

export const ListTransactionsQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(30),
  type:     z.enum(['income', 'expense']).optional(),
  category: z.enum([
    'sale', 'raw_materials', 'salary', 'rent', 'utility', 'equipment', 'marketing', 'other',
  ]).optional(),
  source:   z.enum(['pos_sale', 'purchase_receipt', 'manual']).optional(),
  currency: z.enum(['USD', 'LBP']).optional(),
  staffId:  z.string().optional(),
  from:     z.string().optional(),   
  to:       z.string().optional(),   
})

export const PnLQuerySchema = z.object({
  year:     z.coerce.number().int().min(2020).max(2099),
  month:    z.coerce.number().int().min(1).max(12).optional(),
  week:     z.coerce.number().int().min(1).max(53).optional(),
  currency: z.enum(['USD', 'LBP']).optional(),
})

export type CreateTransactionInput  = z.infer<typeof CreateTransactionSchema>
export type UpdateTransactionInput  = z.infer<typeof UpdateTransactionSchema>
export type ListTransactionsQuery   = z.infer<typeof ListTransactionsQuerySchema>
export type PnLQuery                = z.infer<typeof PnLQuerySchema>

// ═════════════════════════════════════════════════════════════════════════════
// AUTO-LOGGING HOOKS
// ═════════════════════════════════════════════════════════════════════════════

// Called by the Order service when a POS order is paid.
// Creates an income transaction automatically.
export async function logPOSSale(params: {
  orderId:     mongoose.Types.ObjectId
  orderRef:    string   
  amount:      number
  currency:    'USD' | 'LBP'
  date:        Date
  createdBy:   mongoose.Types.ObjectId
}) {
  await dbConnect()

  await Transaction.updateOne(
    {
      source:   'pos_sale',
      sourceId: params.orderId,
    },
    {
      $setOnInsert: {
        type:        'income',
        amount:      params.amount,
        currency:    params.currency,
        description: `POS Sale — ${params.orderRef}`,
        category:    'sale',
        source:      'pos_sale',
        sourceId:    params.orderId,
        sourceRef:   params.orderRef,
        date:        params.date,
        staffId:     null,
        ...getPeriodFields(params.date),
        notes:       '',
        createdBy:   params.createdBy,
      },
    },
    { upsert: true }
  )
}

export async function logPurchaseReceipt(params: {
  purchaseOrderId: mongoose.Types.ObjectId
  poNumber:        string   // e.g. "PO-2026-0003"
  supplierName:    string
  amount:          number
  currency:        'USD' | 'LBP'
  date:            Date
  createdBy:       mongoose.Types.ObjectId
}) {
  await dbConnect()

  await Transaction.updateOne(
    {
      source:   'purchase_receipt',
      sourceId: params.purchaseOrderId,
    },
    {
      $setOnInsert: {
        type:        'expense',
        amount:      params.amount,
        currency:    params.currency,
        description: `Purchase — ${params.poNumber} from ${params.supplierName}`,
        category:    'raw_materials',
        source:      'purchase_receipt',
        sourceId:    params.purchaseOrderId,
        sourceRef:   params.poNumber,
        date:        params.date,
        staffId:     null,
        ...getPeriodFields(params.date),
        notes:       '',
        createdBy:   params.createdBy,
      },
    },
    { upsert: true }
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MANUAL TRANSACTIONS (manager-created expenses)
// ═════════════════════════════════════════════════════════════════════════════

export async function listTransactions(query: ListTransactionsQuery) {
  await dbConnect()

  const filter: Record<string, unknown> = {}

  if (query.type)     filter.type     = query.type
  if (query.category) filter.category = query.category
  if (query.source)   filter.source   = query.source
  if (query.currency) filter.currency = query.currency
  if (query.staffId)  filter.staffId  = new mongoose.Types.ObjectId(query.staffId)

  if (query.from || query.to) {
    filter.date = {
      ...(query.from ? { $gte: new Date(query.from) } : {}),
      ...(query.to   ? { $lte: new Date(query.to)   } : {}),
    }
  }

  const skip  = (query.page - 1) * query.limit
  const total = await Transaction.countDocuments(filter)

  const transactions = await Transaction.find(filter)
    .sort({ date: -1 })
    .skip(skip)
    .limit(query.limit)
    .populate('staffId',  'fullName')
    .populate('createdBy', 'fullName')
    .lean()

  return { transactions, total }
}

export async function getTransactionById(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  return Transaction.findById(id)
    .populate('staffId',  'fullName')
    .populate('createdBy', 'fullName')
    .lean()
}

export async function createTransaction(input: CreateTransactionInput, createdBy: string) {
  await dbConnect()

  const date = new Date(input.date)

  const tx = await Transaction.create({
    type:        'expense',
    amount:      input.amount,
    currency:    input.currency,
    description: input.description,
    category:    input.category,
    source:      'manual',
    sourceId:    null,
    sourceRef:   '',
    date,
    staffId:     input.staffId ? new mongoose.Types.ObjectId(input.staffId) : null,
    ...getPeriodFields(date),
    notes:       input.notes,
    createdBy:   new mongoose.Types.ObjectId(createdBy),
  })

  return tx.toObject()
}

export async function updateTransaction(id: string, input: UpdateTransactionInput) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const tx = await Transaction.findById(id)
  if (!tx) return null

  if (tx.source !== 'manual') {
    throw new Error(
      `This transaction was auto-created from a ${tx.source.replace('_', ' ')} ` +
      `and cannot be edited directly. Fix the original record instead.`
    )
  }

  const update: Record<string, unknown> = { ...input }

  if (input.date) {
    const newDate = new Date(input.date)
    update.date = newDate
    Object.assign(update, getPeriodFields(newDate))
  }

  if (input.staffId !== undefined) {
    update.staffId = input.staffId
      ? new mongoose.Types.ObjectId(input.staffId)
      : null
  }

  return Transaction.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true, runValidators: true }
  ).lean()
}

export async function deleteTransaction(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const tx = await Transaction.findById(id)
  if (!tx) return null

  if (tx.source !== 'manual') {
    throw new Error(
      `This transaction was auto-created and cannot be deleted. ` +
      `To remove it, cancel the original ${tx.source.replace('_', ' ')}.`
    )
  }

  return Transaction.findByIdAndDelete(id).lean()
}

// ═════════════════════════════════════════════════════════════════════════════
// P&L REPORT — The main event
// ═════════════════════════════════════════════════════════════════════════════

export async function getProfitAndLoss(query: PnLQuery) {
  await dbConnect()

  // ── Build the period filter ───────────────────────────────────────────────
  const filter: Record<string, unknown> = { periodYear: query.year }
  if (query.month)    filter.periodMonth = query.month
  if (query.week)     filter.periodWeek  = query.week
  if (query.currency) filter.currency    = query.currency

  // ── One aggregation query does all the math ───────────────────────────────
  // Group all transactions by type and category,
  // sum the amounts, and return the totals.
  const result = await Transaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id:   { type: '$type', category: '$category' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ])


  type BreakdownRow = { category: string; total: number; count: number }

  const incomeBreakdown:  BreakdownRow[] = []
  const expenseBreakdown: BreakdownRow[] = []

  for (const row of result) {
    const entry = {
      category: row._id.category,
      total:    parseFloat(row.total.toFixed(2)),
      count:    row.count,
    }
    if (row._id.type === 'income')  incomeBreakdown.push(entry)
    if (row._id.type === 'expense') expenseBreakdown.push(entry)
  }

  // Sort by total descending (biggest categories first)
  incomeBreakdown.sort( (a, b) => b.total - a.total)
  expenseBreakdown.sort((a, b) => b.total - a.total)

  const totalIncome   = incomeBreakdown.reduce( (s, r) => s + r.total, 0)
  const totalExpenses = expenseBreakdown.reduce((s, r) => s + r.total, 0)
  const netProfit     = totalIncome - totalExpenses

  // Period label for display
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]
  const period = query.week
    ? `Week ${query.week}, ${query.year}`
    : query.month
    ? `${monthNames[query.month - 1]} ${query.year}`
    : String(query.year)

  return {
    period,
    currency:       query.currency ?? 'USD',

    // Income section
    income:         incomeBreakdown,
    totalIncome:    parseFloat(totalIncome.toFixed(2)),

    // Expense breakdown by category
    expenses:       expenseBreakdown,
    totalExpenses:  parseFloat(totalExpenses.toFixed(2)),

    // The bottom line
    netProfit:      parseFloat(netProfit.toFixed(2)),
    isProfit:       netProfit >= 0,
    // Profit margin: what % of income is kept as profit
    // e.g. 62% means for every $1 you earn, you keep $0.62
    profitMargin:   totalIncome > 0
      ? parseFloat(((netProfit / totalIncome) * 100).toFixed(1))
      : 0,
  }
}

export async function getSummary(currency?: 'USD' | 'LBP') {
  await dbConnect()

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const week  = getISOWeek(now)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const baseFilter: Record<string, unknown> = {}
  if (currency) baseFilter.currency = currency

  // Run three aggregations in parallel — one for each period
  const [todayData, weekData, monthData] = await Promise.all([
    // Today
    Transaction.aggregate([
      { $match: { ...baseFilter, date: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
    // This week
    Transaction.aggregate([
      { $match: { ...baseFilter, periodYear: year, periodWeek: week } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
    // This month
    Transaction.aggregate([
      { $match: { ...baseFilter, periodYear: year, periodMonth: month } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
  ])

  // Helper to extract totals from aggregation result
  function extractTotals(data: Array<{ _id: string; total: number }>) {
    const income   = data.find(d => d._id === 'income')?.total  ?? 0
    const expenses = data.find(d => d._id === 'expense')?.total ?? 0
    return {
      income:   parseFloat(income.toFixed(2)),
      expenses: parseFloat(expenses.toFixed(2)),
      profit:   parseFloat((income - expenses).toFixed(2)),
    }
  }

  return {
    today:     extractTotals(todayData),
    thisWeek:  extractTotals(weekData),
    thisMonth: extractTotals(monthData),
  }
}