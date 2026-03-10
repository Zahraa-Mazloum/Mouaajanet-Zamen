// src/providers/index.tsx
'use client'

import { ThemeProvider } from './ThemeProvider'
import { CurrencyProvider } from './CurrencyProvider'
import { NextIntlClientProvider } from 'next-intl'

interface ProvidersProps {
  children: React.ReactNode
  locale: string
  // messages type matches what next-intl expects
  messages: Record<string, unknown>
}

export function Providers({ children, locale, messages }: ProvidersProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeProvider>
        <CurrencyProvider>
          {children}
        </CurrencyProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  )
}