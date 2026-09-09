import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Django dev server runs on :8000. Proxying /api keeps the client code
// origin-relative, which sidesteps CORS *and* makes the session and CSRF
// cookies first-party — session auth is far simpler when the SPA and the API
// share an origin.
//
// /media is deliberately not proxied any more: recordings are private per
// account and are served by the ownership-checked GET /api/sessions/{id}/audio
// rather than from a public static mount.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
