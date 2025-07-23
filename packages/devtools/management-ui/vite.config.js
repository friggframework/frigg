import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
<<<<<<< HEAD
<<<<<<< HEAD
import path from 'path'
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
import path from 'path'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      }
    }
  }
})