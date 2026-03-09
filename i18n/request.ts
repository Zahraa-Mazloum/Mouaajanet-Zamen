// i18n/request.ts
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the locale from the URL
  let locale = await requestLocale

  // If locale is missing or not supported, fall back to default
  if (!locale || !routing.locales.includes(locale as 'en' | 'ar')) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    // Load the correct messages file for this locale
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})