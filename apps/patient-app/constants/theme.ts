export const C = {
  primary: '#1565C0',
  primaryLight: '#1E88E5',
  primaryBg: '#EEF5FF',
  white: '#FFFFFF',
  textDark: '#1A237E',
  textMid: '#37474F',
  textGray: '#78909C',
  green: '#43A047',
  greenLight: '#E8F5E9',
  cardBg: '#FFFFFF',
  border: '#E3EAF6',
}

export const S = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  btn: {
    backgroundColor: '#1565C0',
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  screen: {
    flex: 1,
    backgroundColor: '#EEF5FF',
  },
}

// Safety Engine urgency classes (not diagnoses)
export const TRIAGE = {
  RED: { color: '#D32F2F', text: '#B71C1C', bg: '#FFEBEE', label: 'Urgent' },
  YELLOW: { color: '#F9A825', text: '#F57F17', bg: '#FFFDE7', label: 'Priority' },
  GREEN: { color: '#43A047', text: '#2E7D32', bg: '#E8F5E9', label: 'Routine' },
} as const

export const APPOINTMENT_STATUS: Record<string, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  in_progress: 'In consultation',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
]
