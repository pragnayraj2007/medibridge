// Extends app.json.
// - extra.apiUrl: backend the app talks to. Defaults to the deployed backend so a
//   phone works anywhere (Expo Go or an installed APK). For a local backend run
//   with EXPO_PUBLIC_API_URL=http://<your-PC-IP>:8000 (see SETUP.txt).
// - EXPO_BASE_URL is set only when exporting the web build (export-web.bat) so the
//   patient web app is served from /patient.
const DEFAULT_API_URL = 'https://medibridge-api-rose.vercel.app'

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.MEDIBRIDGE_API_URL || DEFAULT_API_URL,
  },
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
})
