// src/lib/services/accounting.service.ts
//
// ─── THE ACCOUNTING SERVICE ────────────────────────────────────────────────────
// This service is the single point of truth for all financial records.
// No other service writes journal entries directly — they call functions here.
//
// ─── INTEGRATION POINTS (how other modules call this) ─────────────────────────
//
//  Purchase module → postPurchaseOrderEntry(po)
//    Called by: purchase.service.receivePurchaseOrder()
//    Creates: DR 5100 Raw Material Purchases / CR 1000 Cash
//
//  POS module → postPOSSaleEntry(order)
//    Called by: order service when order status → 'delivered' or 'paid'
//    Creates: DR 1000 Cash / CR 4000 Sales Revenue
//
//  Expense module → postExpenseEntry(expense)
//    Called by: expense route when manager clicks "Post"
//    Creates: DR [expense account] / CR [cash account]
//
// ─── THE P&L REPORT ───────────────────────────────────────────────────────────
// getProfitAndLoss({ year, month?, week? })
// Aggregates all POSTED journal lines grouped by account type.
// Revenue - Expenses = Net Profit
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { z }    from 'zod'
import { Account }      from '@/models/Account'
import { JournalEntry } from '@/models/JournalEntry'
import { Expense }      from '@/models/Expense'
import dbConnect        from '@/lib/dbConnect'

// ── Utility: ISO week number from a Date ──────────────────────────────────────
function getISOWeek(date: Date): number {
  const d    = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day  = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const year = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - year.getTime()) / 86400000) + 1) / 7)
}

// ── Entry Number Generator ────────────────────────────────────────────────────
// Format: JE-2026-0001
async function generateEntryNumber(): Promise<string> {
  const year  = new Date().getFullYear()
  const start = new Date(`${year}-01-01T00:00:00.000Z`)
  const end   = new Date(`${year + 1}-01-01T00:00:00.000Z`)

  const count = await JournalEntry.countDocuments({
    createdAt: { $gte: start, $lt: end },
  })

  return `JE-${year}-${String(count + 1).padStart(4, '0')}`
}

// ── Account Lookup Helper ─────────────────────────────────────────────────────
// Looks up a system account by its subtype — used internally by posting functions.
// Throws a clear error if the account doesn't exist (means seeding wasn't run).
async function getSystemAccount(subtype: string) {
  const account = await Account.findOne({ subtype, isActive: true }).lean()
  if (!account) {
    throw new Error(
      `System account with subtype "${subtype}" not found. ` +
      `Run seedChartOfAccounts() first.`
    )
  }
  return account
}

// ═════════════════════════════════════════════════════════════════════════════
// CORE: CREATE AND POST A JOURNAL ENTRY
// ═════════════════════════════════════════════════════════════════════════════

export interface JournalLineInput {
  accountId:   string   // ObjectId string
  description: string
  debit:       number
  credit:      number
}

export interface CreateJournalEntryInput {
  date:        Date
  description: string
  source:      'purchase_order' | 'pos_order' | 'expense' | 'adjustment'
  sourceId?:   mongoose.Types.ObjectId | null
  sourceRef?:  string
  currency:    'USD' | 'LBP'
  lines:       JournalLineInput[]
  notes?:      string
  createdBy:   string   // User ObjectId string
  // If true, immediately posts the entry (no draft step)
  // Used for automated entries from purchase/POS — no manual review needed
  autoPost?:   boolean
}

export async function createJournalEntry(input: CreateJournalEntryInput) {
  await dbConnect()

  // ── Validation: debits must equal credits ─────────────────────────────────
  // This is the fundamental accounting equation.
  // If this throws, there's a bug in the calling code — not a user error.
  const totalDebit  = input.lines.reduce((s, l) => s + l.debit,  0)
  const totalCredit = input.lines.reduce((s, l) => s + l.credit, 0)

  // Use toFixed(4) comparison to avoid floating point issues
  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    throw new Error(
      `Journal entry is unbalanced: debits ${totalDebit.toFixed(4)} ≠ credits ${totalCredit.toFixed(4)}`
    )
  }

  // ── Snapshot account codes and names ──────────────────────────────────────
  // We store the account code and name on each line at posting time.
  // WHY: If an account is renamed later, historical entries still show
  // the original name. Also makes P&L queries faster (no join needed).
  const accountIds = input.lines.map(l => new mongoose.Types.ObjectId(l.accountId))
  const accounts   = await Account.find({ _id: { $in: accountIds } }).lean()
  const accMap     = new Map(accounts.map(a => [a._id.toString(), a]))

  const lines = input.lines.map(line => {
    const acc = accMap.get(line.accountId)
    if (!acc) throw new Error(`Account "${line.accountId}" not found`)

    return {
      accountId:   new mongoose.Types.ObjectId(line.accountId),
      accountCode: acc.code,
      accountName: acc.name,
      description: line.description,
      debit:       parseFloat(line.debit.toFixed(4)),
      credit:      parseFloat(line.credit.toFixed(4)),
    }
  })

  // ── Compute period fields ──────────────────────────────────────────────────
  const periodYear  = input.date.getFullYear()
  const periodMonth = input.date.getMonth() + 1   // 1-12
  const periodWeek  = getISOWeek(input.date)

  const entryNumber = await generateEntryNumber()

  const entry = await JournalEntry.create({
    entryNumber,
    date:        input.date,
    description: input.description,
    source:      input.source,
    sourceId:    input.sourceId  ?? null,
    sourceRef:   input.sourceRef ?? '',
    currency:    input.currency,
    lines,
    totalDebit:  parseFloat(totalDebit.toFixed(4)),
    totalCredit: parseFloat(totalCredit.toFixed(4)),
    status:      input.autoPost ? 'posted' : 'draft',
    reversalOf:  null,
    periodYear,
    periodMonth,
    periodWeek,
    notes:       input.notes ?? '',
    createdBy:   new mongoose.Types.ObjectId(input.createdBy),
  })

  return entry.toObject()
}

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRATION HOOK: PURCHASE ORDER → JOURNAL ENTRY
// Called by purchase.service.receivePurchaseOrder() after stock is updated.
// ═════════════════════════════════════════════════════════════════════════════

// The shape of a received PO item passed to this function
interface ReceivedPOItem {
  materialName:     string
  quantityReceived: number
  unitCost:         number
  unit:             string
  lineTotal:        number
}

interface ReceivedPO {
  _id:              mongoose.Types.ObjectId
  poNumber:         string
  supplierName:     string
  purchaseDate:     Date
  purchaseCurrency: 'USD' | 'LBP'
  totalCost:        number
  items:            ReceivedPOItem[]
}

export async function postPurchaseOrderEntry(
  po: ReceivedPO,
  postedBy: string
): Promise<void> {
  await dbConnect()

  // DR: 5100 Raw Material Purchases
  const purchaseAccount = await getSystemAccount('raw_material_purchase')

  // CR: 1000 Cash USD  or  1001 Cash LBP
  const cashSubtype = po.purchaseCurrency === 'USD' ? 'cash' : 'cash'
  const cashAccount = await Account.findOne({
    subtype: 'cash',
    // Pick the right cash account based on currency
    // We use a naming convention: "Cash - USD" vs "Cash - LBP"
    name: po.purchaseCurrency === 'USD' ? 'Cash - USD' : 'Cash - LBP',
    isActive: true,
  }).lean()

  if (!cashAccount) throw new Error(`Cash account for ${po.purchaseCurrency} not found`)

  // Build one line per item for traceability (you can see exactly what was purchased)
  // Plus a total credit line on cash
  const lines: JournalLineInput[] = [
    // One debit line per item → detailed breakdown of what was bought
    ...po.items
      .filter(item => item.quantityReceived > 0)
      .map(item => ({
        accountId:   purchaseAccount._id.toString(),
        description: `${item.materialName} — ${item.quantityReceived}${item.unit} × ${po.purchaseCurrency === 'USD' ? '$' : 'LL'}${item.unitCost}`,
        debit:       parseFloat((item.quantityReceived * item.unitCost).toFixed(4)),
        credit:      0,
      })),

    // One credit line: total cash paid
    {
      accountId:   cashAccount._id.toString(),
      description: `Cash paid for ${po.poNumber}`,
      debit:       0,
      credit:      parseFloat(po.totalCost.toFixed(4)),
    },
  ]

  await createJournalEntry({
    date:        po.purchaseDate,
    description: `Purchase receipt — ${po.poNumber} from ${po.supplierName}`,
    source:      'purchase_order',
    sourceId:    po._id,
    sourceRef:   po.poNumber,
    currency:    po.purchaseCurrency,
    lines,
    createdBy:   postedBy,
    autoPost:    true,   // ← auto-post: no manual review needed for purchase receipts
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRATION HOOK: POS ORDER → JOURNAL ENTRY
// Called by order service when a POS order is completed/paid.
// ═════════════════════════════════════════════════════════════════════════════

interface CompletedOrder {
  _id:         mongoose.Types.ObjectId
  orderNumber: string
  totalUSD:    number
  totalLBP:    number
  paidCurrency:'USD' | 'LBP'
  paidAt:      Date
}

export async function postPOSSaleEntry(
  order: CompletedOrder,
  postedBy: string
): Promise<void> {
  await dbConnect()

  const revenueAccount = await getSystemAccount('sales')
  const cashAccount    = await Account.findOne({
    subtype:  'cash',
    name:     order.paidCurrency === 'USD' ? 'Cash - USD' : 'Cash - LBP',
    isActive: true,
  }).lean()

  if (!cashAccount) throw new Error(`Cash account for ${order.paidCurrency} not found`)

  const amount = order.paidCurrency === 'USD' ? order.totalUSD : order.totalLBP

  await createJournalEntry({
    date:        order.paidAt,
    description: `POS Sale — ${order.orderNumber}`,
    source:      'pos_order',
    sourceId:    order._id,
    sourceRef:   order.orderNumber,
    currency:    order.paidCurrency,
    lines: [
      // DR Cash — money came in
      {
        accountId:   cashAccount._id.toString(),
        description: `Cash received for ${order.orderNumber}`,
        debit:       amount,
        credit:      0,
      },
      // CR Revenue — sale is recorded
      {
        accountId:   revenueAccount._id.toString(),
        description: `Sales — ${order.orderNumber}`,
        debit:       0,
        credit:      amount,
      },
    ],
    createdBy: postedBy,
    autoPost:  true,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPENSE POSTING
// When a manager clicks "Post" on a salary/rent/utility expense.
// ═════════════════════════════════════════════════════════════════════════════

export async function postExpenseEntry(expenseId: string, postedBy: string) {
  await dbConnect()

  const expense = await Expense.findById(expenseId)
    .populate('debitAccountId')
    .populate('creditAccountId')
    .lean()

  if (!expense) throw new Error('Expense not found')
  if (expense.status !== 'draft') throw new Error(`Expense is already ${expense.status}`)

  const debitAcc  = expense.debitAccountId  as unknown as { _id: mongoose.Types.ObjectId; code: string; name: string }
  const creditAcc = expense.creditAccountId as unknown as { _id: mongoose.Types.ObjectId; code: string; name: string }

  const entry = await createJournalEntry({
    date:        expense.expenseDate,
    description: expense.description,
    source:      'expense',
    sourceId:    expense._id as mongoose.Types.ObjectId,
    sourceRef:   expense.description,
    currency:    expense.currency,
    lines: [
      // DR: Expense account (5200 Salaries, 5300 Rent, etc.)
      {
        accountId:   debitAcc._id.toString(),
        description: expense.description,
        debit:       expense.amount,
        credit:      0,
      },
      // CR: Cash account (1000 USD or 1001 LBP)
      {
        accountId:   creditAcc._id.toString(),
        description: `Cash paid — ${expense.description}`,
        debit:       0,
        credit:      expense.amount,
      },
    ],
    createdBy: postedBy,
    autoPost:  true,
  })

  // Link journal entry back to the expense and mark it posted
  await Expense.findByIdAndUpdate(expenseId, {
    $set: { status: 'posted', journalEntryId: entry._id },
  })

  return entry
}

// ═════════════════════════════════════════════════════════════════════════════
// VOID A JOURNAL ENTRY
// Creates a reversal entry (opposite debits/credits) and voids the original.
// NEVER deletes posted entries — the audit trail must be preserved.
// ═════════════════════════════════════════════════════════════════════════════

export async function voidJournalEntry(entryId: string, voidedBy: string, reason: string) {
  await dbConnect()

  const original = await JournalEntry.findById(entryId)
  if (!original) throw new Error('Journal entry not found')
  if (original.status === 'void') throw new Error('Entry is already void')
  if (original.status === 'draft') {
    // Draft entries can just be deleted — no reversal needed
    await JournalEntry.findByIdAndDelete(entryId)
    return null
  }

  // Posted entries: create a reversal (all debits become credits and vice versa)
  const reversalLines: JournalLineInput[] = original.lines.map(line => ({
    accountId:   line.accountId.toString(),
    description: `REVERSAL: ${line.description}`,
    debit:       line.credit,   // flip debit and credit
    credit:      line.debit,
  }))

  const reversal = await createJournalEntry({
    date:        new Date(),
    description: `VOID — ${original.description} (Reason: ${reason})`,
    source:      original.source,
    sourceId:    original.sourceId,
    sourceRef:   original.sourceRef,
    currency:    original.currency,
    lines:       reversalLines,
    notes:       `Reversal of ${original.entryNumber}. Reason: ${reason}`,
    createdBy:   voidedBy,
    autoPost:    true,
  })

  // Mark the original as void and link to the reversal
  await JournalEntry.findByIdAndUpdate(entryId, {
    $set: { status: 'void' },
  })

  return reversal
}

// ═════════════════════════════════════════════════════════════════════════════
// P&L REPORT
// The report every bakery owner wants to see every week.
// ═════════════════════════════════════════════════════════════════════════════

export const PnLQuerySchema = z.object({
  year:       z.coerce.number().int().min(2020).max(2099),
  month:      z.coerce.number().int().min(1).max(12).optional(),
  week:       z.coerce.number().int().min(1).max(53).optional(),
  currency:   z.enum(['USD', 'LBP']).optional(),
})

export type PnLQuery = z.infer<typeof PnLQuerySchema>

export interface PnLLine {
  accountCode: string
  accountName: string
  total:       number   // sum of (debit - credit) for expense, (credit - debit) for revenue
}

export interface PnLReport {
  period:       string   // "March 2026" or "Week 13 — 2026"
  currency:     string

  revenue:      PnLLine[]
  totalRevenue: number

  expenses:     PnLLine[]
  totalExpenses: number

  grossProfit:  number
  netProfit:    number   // totalRevenue - totalExpenses
  margin:       number   // netProfit / totalRevenue × 100  (percentage)
}

export async function getProfitAndLoss(query: PnLQuery): Promise<PnLReport> {
  await dbConnect()

  // Build the period filter for the MongoDB aggregation
  const periodFilter: Record<string, unknown> = {
    status:     'posted',
    periodYear: query.year,
  }
  if (query.month) periodFilter.periodMonth = query.month
  if (query.week)  periodFilter.periodWeek  = query.week
  if (query.currency) periodFilter.currency = query.currency

  // ── MongoDB aggregation: sum debit and credit per account ─────────────────
  // We unwind the lines array so each line becomes its own document,
  // then group by accountCode to sum up debits and credits.
  const result = await JournalEntry.aggregate([
    { $match: periodFilter },
    { $unwind: '$lines' },
    {
      $group: {
        _id: {
          accountCode: '$lines.accountCode',
          accountName: '$lines.accountName',
        },
        totalDebit:  { $sum: '$lines.debit' },
        totalCredit: { $sum: '$lines.credit' },
      },
    },
    { $sort: { '_id.accountCode': 1 } },
  ])

  // ── Join with Account to get account type (revenue vs expense) ───────────
  const codes    = result.map(r => r._id.accountCode)
  const accounts = await Account.find({ code: { $in: codes } }).lean()
  const accTypeMap = new Map(accounts.map(a => [a.code, a.type]))

  // ── Separate into revenue and expense lines ───────────────────────────────
  const revenue:  PnLLine[] = []
  const expenses: PnLLine[] = []

  for (const row of result) {
    const type  = accTypeMap.get(row._id.accountCode)
    // Revenue accounts have a credit-normal balance: credit - debit = balance
    // Expense accounts have a debit-normal balance:  debit - credit = balance
    const total = type === 'revenue'
      ? row.totalCredit - row.totalDebit
      : row.totalDebit  - row.totalCredit

    const line: PnLLine = {
      accountCode: row._id.accountCode,
      accountName: row._id.accountName,
      total:       parseFloat(total.toFixed(2)),
    }

    if (type === 'revenue') revenue.push(line)
    if (type === 'expense') expenses.push(line)
  }

  const totalRevenue  = revenue.reduce((s, l) => s + l.total, 0)
  const totalExpenses = expenses.reduce((s, l) => s + l.total, 0)
  const netProfit     = totalRevenue - totalExpenses
  const margin        = totalRevenue > 0
    ? parseFloat(((netProfit / totalRevenue) * 100).toFixed(2))
    : 0

  // Format the period label
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const period = query.week
    ? `Week ${query.week} — ${query.year}`
    : query.month
    ? `${monthNames[query.month - 1]} ${query.year}`
    : String(query.year)

  return {
    period,
    currency:      query.currency ?? 'all currencies',
    revenue,       totalRevenue:  parseFloat(totalRevenue.toFixed(2)),
    expenses,      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
    grossProfit:   parseFloat((totalRevenue - totalExpenses).toFixed(2)),
    netProfit:     parseFloat(netProfit.toFixed(2)),
    margin,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS FOR ROUTES
// ═════════════════════════════════════════════════════════════════════════════

export const CreateExpenseSchema = z.object({
  category:       z.enum(['salary','rent','utility','equipment','packaging','marketing','other']),
  description:    z.string().min(1).max(300).trim(),
  descriptionAr:  z.string().max(300).trim().default(''),
  amount:         z.number().positive('Amount must be greater than 0'),
  currency:       z.enum(['USD', 'LBP']),
  debitAccountId:  z.string().min(1),
  creditAccountId: z.string().min(1),
  expenseDate:    z.string().datetime({ offset: true }),
  notes:          z.string().max(500).default(''),
  // Salary-specific fields
  staffId:           z.string().optional().nullable(),
  salaryPeriodMonth: z.number().int().min(1).max(12).optional().nullable(),
  salaryPeriodYear:  z.number().int().optional().nullable(),
})

export const ListExpensesQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  category:   z.enum(['salary','rent','utility','equipment','packaging','marketing','other']).optional(),
  status:     z.enum(['draft','posted','void']).optional(),
  staffId:    z.string().optional(),
  from:       z.string().optional(),
  to:         z.string().optional(),
})

export type CreateExpenseInput   = z.infer<typeof CreateExpenseSchema>
export type ListExpensesQuery    = z.infer<typeof ListExpensesQuerySchema>

// ── Expense CRUD ──────────────────────────────────────────────────────────────

export async function listExpenses(query: ListExpensesQuery) {
  await dbConnect()

  const filter: Record<string, unknown> = {}
  if (query.category) filter.category = query.category
  if (query.status)   filter.status   = query.status
  if (query.staffId)  filter.staffId  = new mongoose.Types.ObjectId(query.staffId)

  if (query.from || query.to) {
    filter.expenseDate = {
      ...(query.from ? { $gte: new Date(query.from) } : {}),
      ...(query.to   ? { $lte: new Date(query.to)   } : {}),
    }
  }

  const skip  = (query.page - 1) * query.limit
  const total = await Expense.countDocuments(filter)
  const items = await Expense.find(filter)
    .sort({ expenseDate: -1 })
    .skip(skip)
    .limit(query.limit)
    .populate('staffId',         'fullName')
    .populate('debitAccountId',  'code name')
    .populate('creditAccountId', 'code name')
    .lean()

  return { items, total }
}

export async function createExpense(input: CreateExpenseInput, createdBy: string) {
  await dbConnect()

  const expense = await Expense.create({
    ...input,
    debitAccountId:  new mongoose.Types.ObjectId(input.debitAccountId),
    creditAccountId: new mongoose.Types.ObjectId(input.creditAccountId),
    staffId:         input.staffId ? new mongoose.Types.ObjectId(input.staffId) : null,
    expenseDate:     new Date(input.expenseDate),
    status:          'draft',
    createdBy:       new mongoose.Types.ObjectId(createdBy),
  })

  return expense.toObject()
}