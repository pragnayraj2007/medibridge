import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-blue-50 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">MediBridge</h1>
          <p className="text-gray-500 mt-1 text-sm">Clinical intake & triage support</p>
        </div>

        {/* Profile selector */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Select your profile</p>
          <div className="space-y-2">
            {[
              { name: 'Ravi Kumar', age: 45, id: 'P001' },
              { name: 'Sunita Devi', age: 32, id: 'P002' },
              { name: 'Arjun Sharma', age: 67, id: 'P003' },
            ].map((p) => (
              <Link
                key={p.id}
                href="/intake"
                className="flex items-center gap-4 bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100 hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.age} years · ID: {p.id}</p>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
          <div className="relative flex justify-center"><span className="bg-blue-50 px-3 text-xs text-gray-400">or</span></div>
        </div>

        <Link
          href="/intake"
          className="block w-full text-center bg-blue-600 text-white font-semibold py-3.5 rounded-xl hover:bg-blue-700 transition-colors text-sm"
        >
          Start as Guest
        </Link>
      </div>
    </main>
  )
}
