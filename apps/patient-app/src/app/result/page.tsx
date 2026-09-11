import Link from 'next/link'

// Mock triage result — will come from backend in Phase 4
const result = {
  level: 'YELLOW' as 'RED' | 'YELLOW' | 'GREEN',
  summary: 'You have reported chest discomfort and shortness of breath for 2 days with moderate severity. These symptoms require timely medical evaluation.',
  guidance: 'Please visit a doctor or clinic today. Do not ignore worsening chest symptoms. If you experience sudden severe chest pain, difficulty breathing, or arm pain — call emergency services immediately.',
  symptoms: ['Chest discomfort', 'Shortness of breath', 'Mild fatigue'],
  nextStep: 'Visit a doctor within 24 hours',
}

const config = {
  RED: {
    bg: 'bg-red-600',
    light: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-600',
    label: 'URGENT',
    icon: '🚨',
    instruction: 'Go to emergency services or call an ambulance now.',
  },
  YELLOW: {
    bg: 'bg-yellow-500',
    light: 'bg-yellow-50 border-yellow-200',
    text: 'text-yellow-700',
    badge: 'bg-yellow-500',
    label: 'SEE A DOCTOR TODAY',
    icon: '⚠️',
    instruction: 'Visit a clinic or doctor within 24 hours.',
  },
  GREEN: {
    bg: 'bg-green-600',
    light: 'bg-green-50 border-green-200',
    text: 'text-green-700',
    badge: 'bg-green-600',
    label: 'NO IMMEDIATE DANGER',
    icon: '✅',
    instruction: 'Monitor your symptoms. See a doctor if they worsen.',
  },
}

export default function Result() {
  const c = config[result.level]

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Triage banner */}
      <div className={`${c.bg} px-6 py-8 text-white`}>
        <div className="max-w-sm mx-auto text-center">
          <div className="text-4xl mb-3">{c.icon}</div>
          <div className="inline-block bg-white bg-opacity-20 rounded-full px-4 py-1 text-xs font-bold tracking-widest mb-3">
            {result.level}
          </div>
          <h2 className="text-xl font-bold">{c.label}</h2>
          <p className="text-sm text-white/80 mt-1">{c.instruction}</p>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-4 max-w-sm mx-auto w-full">

        {/* Summary */}
        <div className={`border rounded-xl p-4 ${c.light}`}>
          <p className={`text-sm font-semibold ${c.text} mb-1`}>Clinical Summary</p>
          <p className="text-sm text-gray-700">{result.summary}</p>
        </div>

        {/* Symptoms recorded */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Symptoms recorded</p>
          <div className="flex flex-wrap gap-2">
            {result.symptoms.map((s) => (
              <span key={s} className="bg-gray-100 text-gray-600 text-xs rounded-full px-3 py-1">{s}</span>
            ))}
          </div>
        </div>

        {/* Next step */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recommended next step</p>
          <p className="text-sm font-semibold text-gray-800">{result.nextStep}</p>
        </div>

        {/* Guidance */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Guidance</p>
          <p className="text-sm text-gray-600 leading-relaxed">{result.guidance}</p>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          This triage result is AI-assisted and reviewed by a clinician. It is not a diagnosis. Always follow your doctor's advice.
        </p>

        {/* Actions */}
        <div className="space-y-2 pt-2 pb-6">
          <button className="w-full bg-gray-800 text-white font-semibold py-3.5 rounded-xl hover:bg-gray-900 transition-colors text-sm">
            Share with my Doctor
          </button>
          <Link href="/" className="block w-full text-center border border-gray-200 text-gray-600 font-medium py-3.5 rounded-xl hover:bg-gray-50 transition-colors text-sm">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  )
}
