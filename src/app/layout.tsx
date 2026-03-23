// src/app/layout.tsx
'use client'
import Script from 'next/script'
import Lenis from "@studio-freight/lenis"
import { useEffect } from "react"

export default function Layout({ children }: { children: React.ReactNode }) {
    useEffect(() => {
    const lenis = new Lenis()

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)
  }, [])

  return (
    
    <html suppressHydrationWarning>
      <head>
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(!s&&d)){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body  className="antialiased">
        {children}
      </body>
    </html>
  )
}