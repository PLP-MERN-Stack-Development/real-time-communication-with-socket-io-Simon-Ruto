import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'socket.io-client': 'socket.io-client/dist/socket.io.js',
    },
  },
  optimizeDeps: {
    include: ['socket.io-client'],
  },
})
