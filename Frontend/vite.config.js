import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0', // Allow connections from outside the container
    port: 5173, // Match the exposed port
    strictPort: true, // Ensure it doesn't switch to another port
    watch: {
      usePolling: true, // Required for hot reload inside Docker
    }
  }
})
