// src/lib/services/account.service.ts
//
// ─── ACCOUNT MANAGEMENT ────────────────────────────────────────────────────────
// Handles all Chart of Accounts operations.
// The key feature: sequential code generation.
// The manager never types a code — they pick a type, we assign the next number.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import { z }    from 'zod'
import { Account, AccountType, ACCOUNT_CODE_RANGES } from '@/models/Account'
import dbConnect from '@/lib/dbConnect'

// ── Zod Schemas ───────────────────────────────────────────────────────────────

export const CreateAccountSchema = z.object({
  name:        z.string().min(1, 'Account name is required').max(200).trim(),
  nameAr:      z.string().max(200).trim().default(''),
  type:        z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  subtype:     z.enum([
    'cash', 'bank', 'accounts_receivable', 'inventory', 'fixed_asset', 'other_asset',
    'accounts_payable', 'loan', 'other_liability',
    'owners_equity', 'retained_earnings', 'other_equity',
    'sales', 'other_income',
    'raw_material_purchase', 'cogs', 'salary', 'rent',
    'utility', 'equipment', 'marketing', 'other_expense',
  ]),
  description: z.string().max(500).trim().default(''),
})

// Updates are limited — type and subtype cannot change after creation.
// Changing the type of an account (e.g. from expense to asset) after journal
// entries exist would corrupt P&L calculations. If you need a different type,
// deactivate this account and create a new one.
export const UpdateAccountSchema = z.object({
  name:        z.string().min(1).max(200).trim().optional(),
  nameAr:      z.string().max(200).trim().optional(),
  description: z.string().max(500).trim().optional(),
  isActive:    z.boolean().optional(),
  // type and subtype are intentionally excluded — immutable after creation
})

export const ListAccountsQuerySchema = z.object({
  type:    z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']).optional(),
  subtype: z.string().optional(),
  search:  z.string().optional(),
  active:  z.coerce.boolean().optional(),
})

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>
export type ListAccountsQuery  = z.infer<typeof ListAccountsQuerySchema>

// ─────────────────────────────────────────────────────────────────────────────

// Auto-generate the next sequential code for a given account type.
//
// HOW IT WORKS:
//   1. Look up the code range for the type (e.g. expense → 5000–5999)
//   2. Find the highest existing code in that range
//   3. Return highest + 1
//
// Example:
//   Existing expense accounts: 5000, 5001, 5005 (user created 5005 via old system)
//   Next code → 5006 (not 5002 — we always take max + 1, not fill gaps)
//
// WHY NOT FILL GAPS?
//   Filling gaps (finding the first missing number) is complex and creates
//   race conditions. Max+1 is simple, correct, and safe under concurrent requests.
//   Account codes don't need to be gapless — they just need to be unique and
//   within the right range.
async function generateNextCode(type: AccountType): Promise<string> {
  const range = ACCOUNT_CODE_RANGES[type]

  // Find the highest existing code in this type's range
  const highest = await Account.findOne({
    // Match codes numerically within the range using $expr
    $expr: {
      $and: [
        { $gte: [{ $toInt: '$code' }, range.start] },
        { $lte: [{ $toInt: '$code' }, range.end]   },
      ],
    },
  })
  .sort({ code: -1 })   // sort descending to get the max first
  .select('code')
  .lean()

  if (!highest) {
    // No accounts of this type yet — start at the range beginning
    return String(range.start)
  }

  const nextCode = parseInt(highest.code, 10) + 1

  if (nextCode > range.end) {
    throw new Error(
      `Cannot create more ${type} accounts. ` +
      `The range ${range.start}–${range.end} is full (${range.end - range.start + 1} accounts maximum).`
    )
  }

  return String(nextCode)
}

// Derive the correct flags based on account type.
// These are facts about accounting — not choices the manager makes.
function deriveAccountFlags(type: AccountType) {
  return {
    isIncomeStatement: type === 'revenue' || type === 'expense',
    isBalanceSheet:    type === 'asset'   || type === 'liability' || type === 'equity',
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function listAccounts(query: ListAccountsQuery) {
  await dbConnect()

  const filter: Record<string, unknown> = {}

  if (query.type)   filter.type    = query.type
  if (query.subtype) filter.subtype = query.subtype
  if (query.active !== undefined) filter.isActive = query.active

  if (query.search) {
    const rx = new RegExp(query.search, 'i')
    filter.$or = [{ name: rx }, { nameAr: rx }, { code: rx }]
  }

  return Account.find(filter)
    .sort({ code: 1 })   // always sorted by code for the Chart of Accounts view
    .lean()
}

export async function getAccountById(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null
  return Account.findById(id).lean()
}

export async function createAccount(input: CreateAccountInput, createdBy: string) {
  await dbConnect()

  // Auto-generate the sequential code
  const code = await generateNextCode(input.type)

  // Derive flags from type — not from the manager's input
  const flags = deriveAccountFlags(input.type)

  const account = await Account.create({
    code,
    name:        input.name,
    nameAr:      input.nameAr,
    type:        input.type,
    subtype:     input.subtype,
    description: input.description,
    isSystem:    false,   // manager-created accounts are never system accounts
    isActive:    true,
    createdBy:   new mongoose.Types.ObjectId(createdBy),
    ...flags,
  })

  return account.toObject()
}

export async function updateAccount(id: string, input: UpdateAccountInput) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  return Account.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true }
  ).lean()
}

export async function deleteAccount(id: string) {
  await dbConnect()
  if (!mongoose.Types.ObjectId.isValid(id)) return null

  const account = await Account.findById(id)
  if (!account) return null

  // System accounts cannot be deleted — other modules depend on them
  if (account.isSystem) {
    throw new Error(
      `"${account.name}" is a system account used for automatic journal entries. ` +
      `It cannot be deleted. You can rename it but not remove it.`
    )
  }

  // Check for existing journal entries referencing this account
  // Deleting it would leave orphaned journal lines
  const { JournalEntry } = await import('@/models/JournalEntry')  // avoid circular dependency
  const usedInJournal = await JournalEntry.exists({
    'lines.accountId': id,
  })

  if (usedInJournal) {
    throw new Error(
      `This account has journal entries linked to it and cannot be deleted. ` +
      `Deactivate it instead — it will be hidden from new entries but preserved in history.`
    )
  }

  return Account.findByIdAndDelete(id).lean()
}

// Preview what the next code will be — useful for showing "will be assigned: 5006"
// in the UI before the manager clicks Save.
export async function previewNextCode(type: AccountType) {
  await dbConnect()
  const code = await generateNextCode(type)
  return { type, nextCode: code }
}