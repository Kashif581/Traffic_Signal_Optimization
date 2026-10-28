import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// "npm run build" writes the finished app into ../web (where server.py serves it from).
// "npm run dev" starts a live-reload server on :5173 and forwards /api and /recordings to server.py on :8000.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../web', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/recordings': 'http://127.0.0.1:8000',
    },
  },
})
