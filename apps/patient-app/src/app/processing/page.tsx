'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const steps = [
  'Reading your symptoms...',
  'Reviewing your medical history...',
  'Analysing clinical context...',
  'Applying safety checks...',
  'Preparing your result...',
]

export default function Processing() {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => {
        if (prev < steps.length - 1) return prev + 1
        clearInterval(interval)
        setTimeout(() => router.push('/result'), 800)
        return prev
      })
    }, 900)
    return () => clearInterval(interval)
  }, [router])

  return (
    <main className="min-h-screen bg-blue-600 flex flex-col items-center justify-center px-6 text-white">
      <div className="w-full max-w-sm text-center">
        {/* Spinner */}
        <div className="w-20 h-20 mx-auto mb-8 relative">
          <div className="w-20 h-20 rounded-full border-4 border-blue-400 border-t-white animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-2">Analysing your information</h2>
        <p className="text-blue-200 text-sm mb-10">Please wait. This only takes a moment.</p>

        {/* Steps */}
        <div className="space-y-3 text-left">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                i < stepIndex ? 'bg-green-400' : i === stepIndex ? 'bg-white' : 'bg-blue-500'
              }`}>
                {i < stepIndex ? (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i === stepIndex ? (
                  <div className="w-2 h-2 bg-blue-600 rounded-full" />
                ) : null}
              </div>
              <span className={`text-sm ${i <= stepIndex ? 'text-white' : 'text-blue-400'}`}>{step}</span>
            </div>
          ))}
        </div>

        <p className="text-blue-300 text-xs mt-10">
          AI assists — a doctor makes the final decision
        </p>
      </div>
    </main>
  )
}
