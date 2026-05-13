// src/models/Expense.ts
//
// ─── WHAT IS AN EXPENSE RECORD? ───────────────────────────────────────────────
// An Expense is a manually-logged financial outflow that is NOT a purchase order.
//
// Purchase orders are logged through the Purchase module (raw materials).
// Everything else — salaries, rent, electricity, generator fuel, phone bills —
// goes through the Expense model.
//
// When an Expense is POSTED, it automatically creates a JournalEntry:
//   DR: The expense account (e.g. 5200 Salaries)
//   CR: Cash (1000 USD or 1001 LBP)
//
// ─── EXPENSE CATEGORIES ───────────────────────────────────────────────────────
//  'salary'    → Monthly salary or daily wage for a staff member
//  'rent'      → Monthly shop/kitchen rent
//  'utility'   → Electricity (EDL + generator), water, internet, gas
//  'equipment' → Small equipment purchase or repair (oven, fridge, mixer)
//  'packaging' → Boxes, bags, stickers (if not tracked as raw materials)
//  'marketing' → Social media ads, print flyers, promotions
//  'other'     → Anything that doesn't fit the above
//
// ─── SALARY SPECIFICS ─────────────────────────────────────────────────────────
// A salary expense links to a staff user for traceability:
//   "Ali - March 2026 Salary - $800"
// Future: bulk salary posting for the whole team in one action.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Model } from 'mongoose'

export type ExpenseCategory =
  | 'salary'
  | 'rent'
  | 'utility'
  | 'equipment'
  | 'packaging'
  | 'marketing'
  | 'other'

export type ExpenseStatus = 'draft' | 'posted' | 'void'

export interface IExpense extends Document {
  _id: mongoose.Types.ObjectId

  // ── Classification ────────────────────────────────────────────────────────
  category:    ExpenseCategory
  description: string   // "March 2026 Salary - Ali Khalil" or "EDL Bill - March"
  descriptionAr: string

  // ── Amount ────────────────────────────────────────────────────────────────
  amount:   number
  currency: 'USD' | 'LBP'

  // ── The target accounting accounts ────────────────────────────────────────
  // debitAccountId:  which expense account to debit (e.g. 5200 Salaries)
  // creditAccountId: which cash account to credit (e.g. 1000 Cash USD)
  // These are set from the frontend — manager picks which accounts apply.
  // For salaries the debit is always 5200; for rent always 5300, etc.
  // Sensible defaults are pre-filled by category in the UI.
  debitAccountId:  mongoose.Types.ObjectId   // ref: Account (expense account)
  creditAccountId: mongoose.Types.ObjectId   // ref: Account (cash account)

  // ── For salary expenses: which staff member ───────────────────────────────
  // Optional — links the expense to a User for payroll reporting
  staffId: mongoose.Types.ObjectId | null   // ref: User

  // ── For salary: the period this covers ───────────────────────────────────
  // e.g. periodMonth: 3, periodYear: 2026 = "March 2026 salary"
  salaryPeriodMonth: number | null
  salaryPeriodYear:  number | null

  // ── Date ──────────────────────────────────────────────────────────────────
  expenseDate: Date   // when the expense was paid (may differ from createdAt)

  // ── Status + Journal link ─────────────────────────────────────────────────
  status:         ExpenseStatus
  journalEntryId: mongoose.Types.ObjectId | null   // created when status → posted

  notes:     string
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ExpenseSchema = new Schema<IExpense>(
  {
    category:      {
      type: String,
      enum: ['salary', 'rent', 'utility', 'equipment', 'packaging', 'marketing', 'other'],
      required: true,
    },
    description:   { type: String, required: true, trim: true },
    descriptionAr: { type: String, default: '',    trim: true },

    amount:   { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['USD', 'LBP'], required: true },

    debitAccountId:  { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    creditAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },

    // Salary-specific fields
    staffId:           { type: Schema.Types.ObjectId, ref: 'User', default: null },
    salaryPeriodMonth: { type: Number, min: 1, max: 12, default: null },
    salaryPeriodYear:  { type: Number, default: null },

    expenseDate: { type: Date, required: true },

    status:         { type: String, enum: ['draft', 'posted', 'void'], default: 'draft' },
    journalEntryId: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },

    notes:     { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    collection: 'expenses',
  }
)

ExpenseSchema.index({ status: 1, expenseDate: -1 })
ExpenseSchema.index({ category: 1, expenseDate: -1 })
ExpenseSchema.index({ staffId: 1, salaryPeriodYear: 1, salaryPeriodMonth: 1 })

export const Expense: Model<IExpense> =
  mongoose.models.Expense ||
  mongoose.model<IExpense>('Expense', ExpenseSchema)