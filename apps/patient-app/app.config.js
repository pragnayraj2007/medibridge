// Extends app.json. EXPO_BASE_URL is set only when exporting the web build
// (export-web.bat) so the patient web app is served from /patient; local
// development and Expo Go are unaffected.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
})
