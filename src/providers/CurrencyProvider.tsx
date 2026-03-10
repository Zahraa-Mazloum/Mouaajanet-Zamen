// src/providers/CurrencyProvider.tsx
'use client'

import { createContext, useContext, useState } from 'react'
import { useMounted } from '@/hooks/useMounted'
import { useTranslations } from 'next-intl'

type Currency = 'LBP' | 'USD'

interface CurrencyContextValue {
  currency: Currency
  // the display value is separate from the actual value
  // Before mounted: always 'LBP' (matches server)
  // After mounted: real value from localStorage
  displayCurrency: Currency
  toggleCurrency: () => void
  formatPrice: (priceLBP: number, priceUSD: number) => string
  isUSD: boolean
  mounted: boolean
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: 'LBP',
  displayCurrency: 'LBP',
  toggleCurrency: () => {},
  formatPrice: (priceLBP) => priceLBP.toLocaleString() + ' ل.ل',
  isUSD: false,
  mounted: false,
})

function getInitialCurrency(): Currency {
  if (typeof window === 'undefined') return 'LBP'
  const saved = localStorage.getItem('currency')
  return saved === 'USD' ? 'USD' : 'LBP'
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(getInitialCurrency)
  const mounted = useMounted()

  // Before mounted: show 'LBP' (same as server) → no hydration mismatch
  // After mounted:  show real value from localStorage
  const displayCurrency: Currency = mounted ? currency : 'LBP'

  function toggleCurrency() {
    const next: Currency = currency === 'LBP' ? 'USD' : 'LBP'
    setCurrency(next)
    localStorage.setItem('currency', next)
  }

  function formatPrice(priceLBP: number, priceUSD: number): string {
    // Also use displayCurrency here — consistent with the toggle label
    if (displayCurrency === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      }).format(priceUSD)
    }
    return new Intl.NumberFormat('en-US').format(priceLBP) + ' ل.ل'
  }

  return (
    <CurrencyContext.Provider value={{
      currency,
      displayCurrency,
      toggleCurrency,
      formatPrice,
      isUSD: displayCurrency === 'USD',
      mounted,
    }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext)
}