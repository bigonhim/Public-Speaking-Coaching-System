import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Django dev server runs on :8000. Proxying /api and /media keeps the
// client code origin-relative and sidesteps CORS during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/media': 'http://localhost:8000',
    },
  },
})
