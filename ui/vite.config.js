import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || (pkg.version ? `v${pkg.version}` : 'v1.0.0')),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // Proxy API and health calls to the running Go server during `npm run dev`
    proxy: {
      '/api': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
    },
  },
})
