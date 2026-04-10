import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cringe: resolve(__dirname, 'cringe.html'),
        quiz: resolve(__dirname, 'quiz.html'),
        contact: resolve(__dirname, 'contact.html'),
        terms: resolve(__dirname, 'terms.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      }
    }
  }
})
