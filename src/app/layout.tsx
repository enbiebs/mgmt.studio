import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand'
import { LOOK_COOKIE, THEME_COOKIE, parseLook, parseTheme } from '@/lib/look'

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', axes: ['opsz'] })
const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: PRODUCT_TAGLINE,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The person's chosen look (glass by default) and theme (light by default) come from cookies, so the very first page the server sends already has them.
  const jar = await cookies()
  const look = parseLook(jar.get(LOOK_COOKIE)?.value)
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value)
  return (
    <html lang="en" data-look={look} data-theme={theme} className={`h-full ${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="h-full">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
