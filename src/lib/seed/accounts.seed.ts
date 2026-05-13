// src/lib/seed/accounts.seed.ts
//
// ─── WHAT THIS FILE IS ─────────────────────────────────────────────────────────
// A one-time setup script that populates the minimum required accounts
// for Mouaajanet Zamen to function.
//
// ─── WHEN TO RUN IT ───────────────────────────────────────────────────────────
// Run ONCE when setting up the system for the first time.
// It is safe to run multiple times — it uses upsert so it never duplicates.
//
// ─── HOW TO RUN IT ────────────────────────────────────────────────────────────
// Option A — One-time API route (recommended for production):
//   Create GET /api/admin/seed (protected, developer-only)
//   Call it once from the browser, then remove the route.
//
// Option B — npm script (for local dev):
//   Add to package.json scripts:
//     "seed:accounts": "npx tsx src/lib/seed/accounts.seed.ts"
//   Then run: npm run seed:accounts
//
// Option C — App startup (only if you want it truly automatic):
//   In src/app/layout.tsx or a server action called on first load.
//   Be careful: this adds startup time and runs on every cold start.
//
// ─── WHAT GETS SEEDED ─────────────────────────────────────────────────────────
// Only the SYSTEM accounts — the ones other modules auto-post to.
// The manager adds their own accounts (rent, marketing, etc.) through the UI.
// ─────────────────────────────────────────────────────────────────────────────

import dbConnect from '@/lib/dbConnect'
import { Account } from '@/models/Account'

// These are the minimum accounts needed for the system to function.
// The purchase module, POS module, and expense module reference these
// by their `subtype` field — not by ID or code.
//
// The manager can create additional accounts (e.g. a second cash drawer,
// a petty cash account, a specific marketing account) through the UI.
const SYSTEM_ACCOUNTS = [
  // ── ASSETS ─────────────────────────────────────────────────────────────────
  {
    code:              '1000',
    name:              'Cash - USD',
    nameAr:            'نقدية - دولار',
    type:              'asset'    as const,
    subtype:           'cash'     as const,
    isSystem:          true,
    isBalanceSheet:    true,
    isIncomeStatement: false,
    description:       'US Dollar cash in the register and on hand',
  },
  {
    code:              '1001',
    name:              'Cash - LBP',
    nameAr:            'نقدية - ليرة لبنانية',
    type:              'asset'    as const,
    subtype:           'cash'     as const,
    isSystem:          true,
    isBalanceSheet:    true,
    isIncomeStatement: false,
    description:       'Lebanese Pound cash in the register and on hand',
  },
  {
    code:              '1200',
    name:              'Raw Materials Inventory',
    nameAr:            'مخزون المواد الخام',
    type:              'asset'    as const,
    subtype:           'inventory' as const,
    isSystem:          true,
    isBalanceSheet:    true,
    isIncomeStatement: false,
    description:       'Current value of raw materials stock (AVCO-valued)',
  },

  // ── REVENUE ─────────────────────────────────────────────────────────────────
  {
    code:              '4000',
    name:              'Sales Revenue',
    nameAr:            'إيرادات المبيعات',
    type:              'revenue' as const,
    subtype:           'sales'   as const,
    isSystem:          true,
    isBalanceSheet:    false,
    isIncomeStatement: true,
    description:       'All POS and online order revenue — auto-posted on sale completion',
  },

  // ── EXPENSES ─────────────────────────────────────────────────────────────────
  {
    code:              '5000',
    name:              'Raw Material Purchases',
    nameAr:            'مشتريات المواد الخام',
    type:              'expense'              as const,
    subtype:           'raw_material_purchase' as const,
    isSystem:          true,
    isBalanceSheet:    false,
    isIncomeStatement: true,
    description:       'Auto-posted when a purchase order is received',
  },
  {
    code:              '5001',
    name:              'Salaries & Wages',
    nameAr:            'الرواتب والأجور',
    type:              'expense' as const,
    subtype:           'salary'  as const,
    isSystem:          false,    // manager-managed but pre-seeded for convenience
    isBalanceSheet:    false,
    isIncomeStatement: true,
    description:       'Monthly salaries and daily wages for all staff',
  },
] as const

export async function seedChartOfAccounts() {
  await dbConnect()

  let created = 0
  let skipped = 0

  for (const acc of SYSTEM_ACCOUNTS) {
    const result = await Account.findOneAndUpdate(
      { code: acc.code },          // match by code
      { $setOnInsert: {            // only insert if it doesn't exist yet
          ...acc,
          createdBy: null,         // system-seeded, no user
        }
      },
      { upsert: true, new: false } // new:false → returns old doc if existed
    )

    if (result) {
      skipped++   // document already existed
    } else {
      created++   // new document inserted
    }
  }

  console.log(
    `✓ Account seed complete: ${created} created, ${skipped} already existed`
  )

  return { created, skipped }
}