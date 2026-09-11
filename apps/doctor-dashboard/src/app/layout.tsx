import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MediBridge',
  description: 'AI-assisted clinical intake and triage',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
