# معجنات زمان — Mouaajanet Zamen

A full-stack web & back-office application for **Mouaajanet Zamen**, a Lebanese bakery/pastry business.
The platform combines a customer-facing online store with an internal management suite covering POS, inventory, purchasing, and double-entry accounting — all in **English and Arabic**.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Models](#data-models)
- [Role-Based Access Control](#role-based-access-control)
- [Authentication & OTP Flow](#authentication--otp-flow)
- [Internationalization](#internationalization)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Available Scripts](#available-scripts)

---

## Features

### Customer-Facing
- Bilingual storefront (English / Arabic) with RTL support
- Product catalog with categories, allergen info, and variant pricing
- Shopping cart, wishlist, and online ordering
- Loyalty points programme
- Account management (preferred language, currency, theme)
- Phone + WhatsApp OTP registration & login

### Back-Office / Management
- **POS** — in-store point-of-sale with offline deduplication
- **Inventory** — raw material tracking with AVCO (weighted-average) costing, reorder alerts, and stock movement history
- **Purchasing** — supplier management and purchase order lifecycle (draft → confirmed → received)
- **Accounting** — double-entry journal entries, chart of accounts, and financial transaction ledger
- **Reporting** — (planned) sales, inventory, and P&L reports
- **Staff management** — employee profiles with department, POS PIN, and granular permissions

### Platform
- Multi-currency support (LBP / USD) with snapshots at order time
- Light / Dark theme
- Smooth-scroll animations (GSAP, Framer Motion, Lenis)
- Spline 3D scene integration

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, TailwindCSS v4, tw-animate-css |
| Animations | Framer Motion, GSAP, @studio-freight/lenis, @splinetool/react-spline |
| Language | TypeScript 5 |
| Database | MongoDB (via Mongoose 9) |
| Auth | NextAuth v5 (Credentials), @auth/mongodb-adapter |
| OTP / WhatsApp | @sinch/sdk-core |
| i18n | next-intl 4 |
| State | Zustand 5 |
| Validation | Zod 4 |
| Password | bcryptjs |
| JWT utils | jose |

---

## Project Structure

```
mouaajanet_zamen/
├── messages/           # i18n translation files
│   ├── en.json
│   └── ar.json
├── i18n/
│   ├── routing.ts      # Locale config (en, ar)
│   └── request.ts      # next-intl request config
├── src/
│   ├── app/
│   │   ├── [locale]/   # All locale-aware pages
│   │   │   ├── page.tsx
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── account/
│   │   └── api/auth/   # API routes
│   │       ├── [...nextauth]/
│   │       ├── send-otp/
│   │       ├── verify-otp/
│   │       ├── register/
│   │       ├── reset-password/
│   │       ├── products/
│   │       ├── categories/
│   │       ├── inventory/
│   │       ├── accounting/
│   │       └── finance/
│   ├── components/     # Shared UI components
│   ├── hooks/          # Custom React hooks
│   ├── lib/
│   │   ├── auth.ts         # NextAuth config
│   │   ├── auth.config.ts
│   │   ├── rbac.ts         # Role-based access control
│   │   ├── db.ts / dbConnect.ts
│   │   ├── inventory.ts
│   │   ├── apiAuth.ts
│   │   ├── apiResponse.ts
│   │   ├── apiValidate.ts
│   │   ├── animationVariants.ts
│   │   ├── seed/
│   │   └── services/       # Business-logic service layer
│   ├── models/         # Mongoose schemas
│   ├── providers/      # React context providers
│   ├── types/
│   └── middleware.ts   # Next.js middleware (auth + locale routing)
├── next.config.ts
├── tsconfig.json
└── .env.local
```

---

## Data Models

| Model | Description |
|---|---|
| `User` | Customers and staff; embeds `StaffProfile` or `CustomerProfile` |
| `Product` | Bilingual name/description, category, allergens, web visibility flag |
| `ProductVariant` | Size / price variants linked to a product |
| `Category` | Product categories |
| `Order` | Multi-channel orders (online, POS, phone) with dual-currency payment snapshot |
| `RawMaterial` | Inventory item with AVCO costing and reorder threshold |
| `StockMovement` | Inbound / outbound stock history |
| `StockAlert` | Auto-generated low-stock notifications |
| `Supplier` | Supplier directory |
| `PurchaseOrder` | Full PO lifecycle tied to a supplier |
| `Account` | Chart-of-accounts entry |
| `JournalEntry` | Double-entry accounting record |
| `Transaction` | Financial transaction ledger |
| `Expense` | Business expense records |
| `OtpVerification` | Temporary WhatsApp OTP tokens |

---

## Role-Based Access Control

Defined in `src/lib/rbac.ts`. Every API route uses `requireAuth()` to gate access.

| Role | Access Summary |
|---|---|
| `developer` | Unrestricted — all resources, all actions |
| `manager` | Full operational control (products, categories, inventory, purchasing, orders, POS, staff, customers, reports, settings) |
| `staff` | Read products & inventory; read/write orders & POS; read customers |
| `customer` | Read products; read own orders; read/write own profile |

Resources: `products`, `categories`, `inventory`, `purchase`, `orders`, `pos`, `staff`, `customers`, `reports`, `settings`

Actions: `read`, `write`, `delete` (or `*` for full access)

---

## Authentication & OTP Flow

**Sign-up:**
1. User submits phone number → server sends a 6-digit OTP via WhatsApp (Sinch SDK)
2. User enters OTP → `POST /api/auth/verify-otp`
3. User sets a password → `POST /api/auth/register`

**Sign-in:**  
Credentials provider (phone + password) via NextAuth v5. Sessions are JWT-based. `lastLoginAt` is updated on each successful login.

**Forgot password:**  
Phone → WhatsApp OTP → `POST /api/auth/reset-password`

---

## Internationalization

- Supported locales: `en` (default), `ar`
- Locale prefix: always present in the URL (e.g. `/en/login`, `/ar/login`)
- Translation files: `messages/en.json` and `messages/ar.json`
- Configured via `next-intl` in `i18n/routing.ts` and `i18n/request.ts`

---

## Environment Variables

Create a `.env.local` file at the project root:

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>

# NextAuth
AUTH_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">

# Sinch (WhatsApp OTP)
SINCH_APP_KEY=<your-sinch-app-key>
SINCH_APP_SECRET=<your-sinch-app-secret>
SINCH_SERVICE_PLAN_ID=<your-service-plan-id>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
