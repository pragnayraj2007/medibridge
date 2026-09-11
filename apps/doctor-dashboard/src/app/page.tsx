import Link from 'next/link'

const cases = [
  {
    id: 'P001', name: 'Ravi Kumar', age: 45, gender: 'M',
    symptoms: 'Chest discomfort, shortness of breath',
    triage: 'YELLOW', submitted: '10 min ago', status: 'Pending review',
  },
  {
    id: 'P002', name: 'Sunita Devi', age: 32, gender: 'F',
    symptoms: 'High fever, severe headache, stiff neck',
    triage: 'RED', submitted: '24 min ago', status: 'Urgent',
  },
  {
    id: 'P003', name: 'Arjun Sharma', age: 67, gender: 'M',
    symptoms: 'Mild cough, runny nose',
    triage: 'GREEN', submitted: '1 hr ago', status: 'Reviewed',
  },
  {
    id: 'P004', name: 'Meena Patel', age: 28, gender: 'F',
    symptoms: 'Abdominal pain (lower right), nausea',
    triage: 'YELLOW', submitted: '2 hr ago', status: 'Pending review',
  },
  {
    id: 'P005', name: 'Vikram Singh', age: 55, gender: 'M',
    symptoms: 'Sudden vision loss (right eye), dizziness',
    triage: 'RED', submitted: '3 hr ago', status: 'Urgent',
  },
]

const triageStyle: Record<string, string> = {
  RED: 'bg-red-100 text-red-700 border-red-200',
  YELLOW: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  GREEN: 'bg-green-100 text-green-700 border-green-200',
}

const triageDot: Record<string, string> = {
  RED: 'bg-red-500',
  YELLOW: 'bg-yellow-400',
  GREEN: 'bg-green-500',
}

export default function Dashboard() {
  const counts = {
    RED: cases.filter(c => c.triage === 'RED').length,
    YELLOW: cases.filter(c => c.triage === 'YELLOW').length,
    GREEN: cases.filter(c => c.triage === 'GREEN').length,
  }

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
          <span className="text-sm text-gray-500">Doctor Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Dr. Ananya Rao</span>
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">A</div>
        </div>
      </header>

      <main className="px-8 py-6 max-w-6xl mx-auto">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Urgent', level: 'RED', color: 'border-red-300 bg-red-50', text: 'text-red-700', count: counts.RED },
            { label: 'Needs Attention', level: 'YELLOW', color: 'border-yellow-300 bg-yellow-50', text: 'text-yellow-700', count: counts.YELLOW },
            { label: 'Stable', level: 'GREEN', color: 'border-green-300 bg-green-50', text: 'text-green-700', count: counts.GREEN },
          ].map(({ label, level, color, text, count }) => (
            <div key={level} className={`border rounded-xl p-5 ${color}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${triageDot[level]}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{level}</span>
              </div>
              <div className={`text-3xl font-bold ${text}`}>{count}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Cases table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Patient Cases</h2>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Search patients..."
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
              />
              <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none">
                <option>All triage</option>
                <option>RED</option>
                <option>YELLOW</option>
                <option>GREEN</option>
              </select>
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium">Patient</th>
                <th className="text-left px-6 py-3 font-medium">Symptoms</th>
                <th className="text-left px-6 py-3 font-medium">Triage</th>
                <th className="text-left px-6 py-3 font-medium">Submitted</th>
                <th className="text-left px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-semibold text-xs flex-shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{c.name}</div>
                        <div className="text-xs text-gray-400">{c.age}y · {c.gender} · {c.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600 line-clamp-1">{c.symptoms}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border rounded-full px-2.5 py-1 ${triageStyle[c.triage]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${triageDot[c.triage]}`} />
                      {c.triage}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{c.submitted}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-500">{c.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/patient/${c.id}`}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
