import Link from 'next/link'

export default function Intake() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <Link href="/" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Clinical Intake</h2>
          <p className="text-xs text-gray-400">Ravi Kumar · ID P001</p>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6 overflow-y-auto">

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {['Symptoms', 'History', 'Medications'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${i === 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${i === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {i + 1}
                </div>
                {step}
              </div>
              {i < 2 && <div className="w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* Main symptom input */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">
            What are your main symptoms? <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={4}
            placeholder="Describe what you are feeling. Be as specific as possible — e.g. 'chest pain when breathing' or 'fever since yesterday evening'."
            defaultValue=""
          />
        </div>

        {/* Voice input button */}
        <button className="w-full flex items-center justify-center gap-3 border-2 border-dashed border-gray-200 rounded-xl py-4 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors text-sm">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Tap to speak your symptoms
        </button>

        {/* Duration */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">How long have you had these symptoms?</label>
          <div className="grid grid-cols-3 gap-2">
            {['Today', 'Few days', '1 week', '2 weeks', '1 month', 'More'].map((d) => (
              <button
                key={d}
                className="border border-gray-200 rounded-lg py-2 text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">Severity (1 = mild, 10 = worst)</label>
          <div className="flex items-center gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={`flex-1 h-8 rounded text-xs font-medium transition-colors ${
                  n <= 3 ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                  n <= 6 ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                  'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Document upload */}
        <div>
          <label className="block text-sm font-semibold text-gray-800 mb-2">Attach documents (optional)</label>
          <button className="w-full flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Prescription, lab report, or photo
          </button>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-6 py-5 border-t border-gray-100 bg-white">
        <Link
          href="/processing"
          className="block w-full text-center bg-blue-600 text-white font-semibold py-3.5 rounded-xl hover:bg-blue-700 transition-colors text-sm"
        >
          Submit & Analyse →
        </Link>
        <p className="text-center text-xs text-gray-400 mt-2">Your information is reviewed by a doctor</p>
      </div>
    </main>
  )
}
