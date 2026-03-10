// next.config.ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// This path must point exactly to your i18n/request.ts
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {}

export default withNextIntl(nextConfig)