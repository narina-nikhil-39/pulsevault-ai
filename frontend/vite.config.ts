import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The frontend talks only to /api on its own origin and Vite proxies that to FastAPI.
// No model API key is ever referenced here or shipped in the browser bundle; every call to
// the vision model is made server-side by the gateway.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
