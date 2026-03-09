// i18n/routing.ts
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  // All supported locales
  locales: ['en', 'ar'],

  // Default locale — shown at / without any prefix
  defaultLocale: 'en',

  // Always show locale in URL: /en/menu, /ar/menu
  // This makes URLs shareable and SEO-friendly
  localePrefix: 'always',
})