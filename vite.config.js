import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  build: {
    target: 'es2018',
    cssTarget: 'chrome61'
  },
  server: {
    port: 4445,
    host: '127.0.0.1',
    allowedHosts: true,
  }
})
