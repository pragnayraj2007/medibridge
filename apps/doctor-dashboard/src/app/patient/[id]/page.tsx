import Link from 'next/link'

// Mock patient data — replaced by API in Phase 4
const patient = {
  id: 'P001',
  name: 'Ravi Kumar',
  age: 45,
  gender: 'Male',
  phone: '+91 98765 43210',
  submitted: 'Sep 11, 2026 · 10:42 AM',
  triage: 'YELLOW' as 'RED' | 'YELLOW' | 'GREEN',

  symptoms: [
    { label: 'Chief complaint', value: 'Chest discomfort and shortness of breath' },
    { label: 'Duration', value: '2 days' },
    { label: 'Severity', value: '6 / 10' },
    { label: 'Associated symptoms', value: 'Mild fatigue, occasional dizziness' },
  ],

  history: [
    { label: 'Past conditions', value: 'Hypertension (diagnosed 2019)' },
    { label: 'Previous hospitalisations', value: 'None reported' },
    { label: 'Allergies', value: 'Penicillin' },
    { label: 'Current medications', value: 'Amlodipine 5mg (daily)' },
  ],

  aiSummary: 'Patient presents with a 2-day history of chest discomfort and shortness of breath, severity rated 6/10, with associated fatigue and dizziness. Background of hypertension on Amlodipine. Symptom pattern and cardiovascular risk profile warrant timely clinical evaluation to rule out acute coronary syndrome or other cardiac aetiology. No red-flag emergency symptoms reported at this time.',

  safetyFlags: [
    'Cardiovascular risk factor: hypertension',
    'Chest symptoms + shortness of breath — cardiac aetiology not excluded',
  ],
}

const triageConfig = {
  RED: { bar: 'bg-red-600', badge: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', label: 'URGENT — Immediate attention required' },
  YELLOW: { bar: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400', label: 'YELLOW — Timely attention required' },
  GREEN: { bar: 'bg-green-600', badge: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500', label: 'GREEN — No immediate danger' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-44 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  )
}

export default function PatientDetail() {
  const tc = triageConfig[patient.triage]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900">MediBridge</span>
          <span className="text-gray-300">|</span>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Dashboard</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">{patient.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Dr. Ananya Rao</span>
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">A</div>
        </div>
      </header>

      {/* Triage bar */}
      <div className={`${tc.bar} px-8 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3 text-white">
          <span className="font-bold text-sm">{patient.triage}</span>
          <span className="text-white/70 text-sm">·</span>
          <span className="text-white/90 text-sm">{tc.label.split('—')[1]?.trim()}</span>
        </div>
        <span className="text-white/70 text-xs">Submitted {patient.submitted}</span>
      </div>

      <main className="px-8 py-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-3 gap-6">

          {/* Left col */}
          <div className="col-span-1 space-y-4">
            {/* Patient card */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                  {patient.name.charAt(0)}
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">{patient.name}</h2>
                  <p className="text-sm text-gray-400">{patient.age}y · {patient.gender} · {patient.id}</p>
                </div>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <div className="flex gap-2"><span className="text-gray-400 w-16">Phone</span><span>{patient.phone}</span></div>
              </div>
              <div className="mt-4">
                <span className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 text-xs font-semibold ${tc.badge}`}>
                  <span className={`w-2 h-2 rounded-full ${tc.dot}`} />
                  {patient.triage}
                </span>
              </div>
            </div>

            {/* Safety flags */}
            {patient.safetyFlags.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2">Safety Flags</p>
                <ul className="space-y-1.5">
                  {patient.safetyFlags.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-yellow-800">
                      <span className="mt-0.5">⚠️</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <button className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors text-sm">
                Mark as Reviewed
              </button>
              <button className="w-full border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm">
                Request Follow-up
              </button>
            </div>
          </div>

          {/* Right col */}
          <div className="col-span-2 space-y-4">

            {/* AI Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">AI Clinical Summary</span>
                <span className="text-xs text-blue-400 ml-auto">AI-assisted · Doctor reviews</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{patient.aiSummary}</p>
            </div>

            {/* Symptoms */}
            <Section title="Reported Symptoms">
              {patient.symptoms.map((s) => <Row key={s.label} {...s} />)}
            </Section>

            {/* Medical history */}
            <Section title="Medical History">
              {patient.history.map((h) => <Row key={h.label} {...h} />)}
            </Section>

          </div>
        </div>
      </main>
    </div>
  )
}
