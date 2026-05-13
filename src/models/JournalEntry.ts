// src/models/JournalEntry.ts
//
// ─── THE JOURNAL ENTRY — HEART OF THE ACCOUNTING SYSTEM ───────────────────────
//
// Every financial event creates ONE JournalEntry with TWO OR MORE lines.
// The sum of all DEBIT lines must always equal the sum of all CREDIT lines.
// This is the fundamental rule of double-entry bookkeeping.
//
// ─── ANATOMY OF A JOURNAL ENTRY ───────────────────────────────────────────────
//
//  JournalEntry (the transaction header)
//  ├── entryNumber:  "JE-2026-0001"
//  ├── date:         2026-03-30
//  ├── description:  "Purchase receipt - PO-2026-0003"
//  ├── source:       { type: 'purchase_order', id: ObjectId }
//  ├── status:       'posted'
//  └── lines:
//       ├── { account: '5100 Raw Material Purchases', debit: 50.00, credit: 0 }
//       └── { account: '1000 Cash USD',               debit: 0,     credit: 50.00 }
//
// ─── SOURCE TYPES — WHERE ENTRIES COME FROM ───────────────────────────────────
//
//  'purchase_order' → Auto-created when PO is received
//                     DR: 5100 Raw Material Purchases
//                     CR: 1000 Cash USD (or LBP)
//
//  'pos_order'      → Auto-created when POS order is completed
//                     DR: 1000 Cash
//                     CR: 4000 Sales Revenue
//
//  'expense'        → Created from manual Expense entries (salary, rent, etc.)
//                     DR: 5200 Salaries / 5300 Rent / 5400 Utilities
//                     CR: 1000 Cash
//
//  'adjustment'     → Manual correction entries by accountant
//                     Any debit/credit combination
//
// ─── STATUS ───────────────────────────────────────────────────────────────────
//  'draft'  → Created but not yet included in reports (can be edited/deleted)
//  'posted' → Finalized and included in P&L (immutable — never edit posted entries)
//  'void'   → Cancelled (creates a reversal entry — never deletes)
//
// WHY NEVER DELETE POSTED ENTRIES?
// Financial records are an audit trail. Deleting them is like shredding receipts.
// When you need to correct a posted entry, you create a REVERSAL (opposite entry)
// and then a new correct entry. The original always remains in the ledger.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Model } from 'mongoose'

export type JournalEntryStatus = 'draft' | 'posted' | 'void'
export type JournalEntrySource =
  | 'purchase_order'
  | 'pos_order'
  | 'expense'
  | 'adjustment'

export type JournalCurrency = 'USD' | 'LBP'

// One line in a journal entry — always either a debit OR credit, not both
export interface IJournalLine {
  accountId:   mongoose.Types.ObjectId  // ref: Account
  accountCode: string   // snapshot: "5100" — for fast P&L queries without joining
  accountName: string   // snapshot: "Raw Material Purchases"
  description: string   // line-level note (e.g. "25kg Semolina @ $2.10/kg")
  debit:       number   // amount on the debit side (0 if this is a credit line)
  credit:      number   // amount on the credit side (0 if this is a debit line)
  // One line is either debit OR credit — never both nonzero at the same time
}

export interface IJournalEntry extends Document {
  _id:         mongoose.Types.ObjectId
  entryNumber: string   // "JE-2026-0001" — auto-generated, unique

  date:        Date     // Transaction date (when the event happened)
  description: string   // Human-readable summary of the transaction

  // Where this entry came from — links back to the originating record
  source:     JournalEntrySource
  sourceId:   mongoose.Types.ObjectId | null   // the PO, order, or expense that created it
  sourceRef:  string   // snapshot of the source number: "PO-2026-0003" or "ORD-00123"

  currency:   JournalCurrency   // All lines in this entry share one currency
  // Future: add exchangeRate here for multi-currency entries

  lines:  IJournalLine[]

  // Computed totals — stored for fast validation and display
  totalDebit:  number   // must equal totalCredit when status = 'posted'
  totalCredit: number

  status: JournalEntryStatus

  // If this entry was voided, the reversal entry is linked here
  reversalOf:  mongoose.Types.ObjectId | null

  // Accounting period — for grouping in reports
  // Stored separately so reports don't have to parse dates
  periodYear:  number   // 2026
  periodMonth: number   // 3 (March)
  periodWeek:  number   // ISO week number (1-52)

  notes:     string
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

// ── Sub-schema: journal line ──────────────────────────────────────────────────
const JournalLineSchema = new Schema<IJournalLine>(
  {
    accountId:   { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    accountCode: { type: String, required: true },
    accountName: { type: String, required: true },
    description: { type: String, default: '' },
    debit:       { type: Number, default: 0, min: 0 },
    credit:      { type: Number, default: 0, min: 0 },
  },
  { _id: false }
)

// ── Main schema ───────────────────────────────────────────────────────────────
const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    entryNumber: { type: String, required: true, unique: true },

    date:        { type: Date, required: true },
    description: { type: String, required: true, trim: true },

    source:    {
      type: String,
      enum: ['purchase_order', 'pos_order', 'expense', 'adjustment'],
      required: true,
    },
    sourceId:  { type: Schema.Types.ObjectId, default: null },
    sourceRef: { type: String, default: '' },

    currency:  { type: String, enum: ['USD', 'LBP'], default: 'USD' },

    lines: [JournalLineSchema],

    totalDebit:  { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },

    status: {
      type:    String,
      enum:    ['draft', 'posted', 'void'],
      default: 'draft',
    },

    reversalOf: { type: Schema.Types.ObjectId, ref: 'JournalEntry', default: null },

    // Pre-computed period fields for fast report aggregations
    periodYear:  { type: Number, required: true },
    periodMonth: { type: Number, required: true },
    periodWeek:  { type: Number, required: true },

    notes:     { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    // updatedAt intentionally tracked even though posted entries shouldn't change —
    // we need to know when a void happened
    timestamps: true,
    collection: 'journal_entries',
  }
)

// ── Indexes ───────────────────────────────────────────────────────────────────
JournalEntrySchema.index({ status: 1, date: -1 })
JournalEntrySchema.index({ source: 1, sourceId: 1 })
// P&L queries filter by period — these make weekly/monthly reports fast
JournalEntrySchema.index({ status: 1, periodYear: 1, periodMonth: 1 })
JournalEntrySchema.index({ status: 1, periodYear: 1, periodWeek: 1 })
// Account-level queries (ledger view for a single account)
JournalEntrySchema.index({ 'lines.accountId': 1, status: 1, date: -1 })

export const JournalEntry: Model<IJournalEntry> =
  mongoose.models.JournalEntry ||
  mongoose.model<IJournalEntry>('JournalEntry', JournalEntrySchema)