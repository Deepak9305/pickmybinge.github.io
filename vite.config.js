import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Inject `window.TMDB_CONFIG` into static HTML pages (cringe.html, blog.html, quiz.html)
 * so they can access the TMDB API key at runtime without hard-coding it.
 * Placeholder `<!--TMDB_CONFIG-->` in each HTML file gets replaced at build + dev time.
 */
function injectTmdbConfig(env) {
  const apiKey = env.VITE_TMDB_API_KEY || ''
  const snippet = `<script>window.TMDB_CONFIG = { apiKey: ${JSON.stringify(apiKey)} };</script>`
  return {
    name: 'inject-tmdb-config',
    transformIndexHtml(html) {
      return html.includes('<!--TMDB_CONFIG-->')
        ? html.replace('<!--TMDB_CONFIG-->', snippet)
        : html.replace('</head>', `${snippet}</head>`)
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), injectTmdbConfig(env)],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          blog: resolve(__dirname, 'blog.html'),
          cringe: resolve(__dirname, 'cringe.html'),
          quiz: resolve(__dirname, 'quiz.html'),
          contact: resolve(__dirname, 'contact.html'),
          terms: resolve(__dirname, 'terms.html'),
          privacy: resolve(__dirname, 'privacy.html'),
        }
      }
    },
    server: {
      port: 5173,
      strictPort: true
    }
  }
})
