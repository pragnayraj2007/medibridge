import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MediBridge Patient',
  description: 'AI-assisted clinical intake',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
