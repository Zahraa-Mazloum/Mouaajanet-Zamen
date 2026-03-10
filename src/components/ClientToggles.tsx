// src/components/ClientToggles.tsx
'use client'

import { useMounted } from '@/hooks/useMounted'
import { useTheme } from '@/providers/ThemeProvider'
import { useCurrency } from '@/providers/CurrencyProvider'

interface ClientTogglesProps {
  locale: string
  currentPath: string
}

export default function ClientToggles({ locale, currentPath }: ClientTogglesProps) {
  const mounted = useMounted()
  const { isDark, toggleTheme } = useTheme()
  const { currency, toggleCurrency } = useCurrency()



function switchLocale() {
  const nextLocale = locale === 'en' ? 'ar' : 'en'
  const pathWithoutLocale = currentPath.replace(/^\/(en|ar)/, '') || '/'

  document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`

  window.location.href = `/${nextLocale}${pathWithoutLocale}`
}
  return (
    <div className="flex items-center gap-2">

      {/* Theme toggle */}
      <ToggleBtn onClick={toggleTheme} title="Toggle theme">
        {/* Before mounted: show neutral icon (no localStorage read) */}
        {!mounted
          ? <PlaceholderIcon />
          : isDark ? <SunIcon /> : <MoonIcon />
        }
      </ToggleBtn>

      {/* Currency toggle */}
      <ToggleBtn onClick={toggleCurrency} title="Toggle currency">
        <span
          className="text-xs font-bold w-8 text-center"
          suppressHydrationWarning
        >
          {/* Before mounted: always LBP (matches server default) */}
          {mounted ? currency : 'LBP'}
        </span>
      </ToggleBtn>

      {/* Language toggle */}
      <ToggleBtn onClick={switchLocale} title="Switch language">
        <span className="text-xs font-bold w-6 text-center">
          {locale === 'en' ? 'Ar' : 'EN'}
        </span>
      </ToggleBtn>

    </div>
  )
}

// ── Small reusable button ─────────────────────────────────
function ToggleBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-9 h-9 rounded-full
                 border cursor-pointer transition
                 hover:bg-(--secondarybackground)"
      style={{ borderColor: 'var(--borderaccent)' }}
    >
      {children}
    </button>
  )
}

// ── Icons ─────────────────────────────────────────────────
function PlaceholderIcon() {
  // Invisible placeholder — same size as sun/moon icon
  // Prevents layout shift when real icon loads
  return <span className="block w-4 h-4" />
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none"
      viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none"
      viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-4">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  )
}