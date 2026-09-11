import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MediBridge Doctor Dashboard',
  description: 'Clinical triage dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
