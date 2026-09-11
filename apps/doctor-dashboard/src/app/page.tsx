// Home: the single entry point for the patient app and the doctor dashboard
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col">
      <header className="px-8 py-5 flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <span className="font-bold text-gray-900 text-lg">MediBridge</span>
      </header>

      <main className="flex-1 px-6 pb-16 max-w-4xl w-full mx-auto">
        <div className="text-center mt-8 mb-12">
          <h1 className="text-4xl font-extrabold text-blue-950 mb-3">Your Health, Our Bridge</h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Patients describe their symptoms by voice or text and add their reports. A deterministic safety check sets
            urgency, the earliest suitable nearby doctor is booked, and the doctor sees one fused, AI-assisted case.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Plain <a> for /patient: it is the Expo web export, not a Next.js route */}
          <a href="/patient" className="group bg-white border border-blue-100 rounded-2xl p-7 shadow-sm hover:shadow-md hover:border-blue-300 transition">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 text-2xl">📱</div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Patient App</h2>
            <p className="text-sm text-gray-500 mb-5">Your patient ID and QR, appointments, past cases and a voice or text consultation. Works best on a phone.</p>
            <span className="text-blue-600 font-semibold text-sm group-hover:underline">Open patient app →</span>
          </a>

          <a href="/doctor" className="group bg-white border border-blue-100 rounded-2xl p-7 shadow-sm hover:shadow-md hover:border-blue-300 transition">
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 text-2xl">🩺</div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Doctor Dashboard</h2>
            <p className="text-sm text-gray-500 mb-5">Sign in to see cases and appointments by urgency, Safety Engine reasons, fused documents and history, and doctor availability.</p>
            <span className="text-blue-600 font-semibold text-sm group-hover:underline">Doctor sign-in →</span>
          </a>
        </div>

        <div className="mt-10 grid sm:grid-cols-3 gap-4 text-center">
          {[
            ['RED', 'bg-red-500', 'Urgent — earliest slot'],
            ['YELLOW', 'bg-yellow-400', 'Priority — ahead of routine'],
            ['GREEN', 'bg-green-500', 'Routine — nearest doctor'],
          ].map(([level, dot, text]) => (
            <div key={level} className="bg-white/70 border border-gray-100 rounded-xl py-3 text-sm text-gray-600 flex items-center justify-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
              <b className="text-gray-800">{level}</b> {text}
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 text-center mt-10">
          Urgency comes from a rule-based Safety Engine (WHO IITT), not the AI. It is not a diagnosis — the doctor makes
          the final decision.
        </p>
      </main>
    </div>
  )
}
