import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { bundleBudgetPlugin } from './vite-plugins/bundle-budget.js'
import { basePathPlugin } from './vite-plugins/base-path.js'

export default defineConfig({
  // I-01: the budget is enforced at build time. UX-CONSTITUTION §7 —
  // "a route that exceeds its budget does not ship".
  plugins: [react(), bundleBudgetPlugin(), basePathPlugin()],

  // GitHub Pages base path (only in production build)
  base: process.env.NODE_ENV === 'production' ? '/imap-bangladesh/' : '/',

  // ── Dev server ──────────────────────────────────────────
  server: {
    port: 5173,
    host: true,               // expose on network (LAN / mobile testing)
    strictPort: false,        // try next port if 5173 is busy
    proxy: {
      // All /api/* requests are forwarded to the backend in dev mode
      // The port comes from the environment so a developer whose 5000 is
      // taken by another service — Windows reserves it often enough — can
      // move the backend without editing tracked config.
      '/api': {
        target: process.env.VITE_DEV_API_ORIGIN || 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      // Realtime goes through the same origin in development, so the client
      // needs no second URL to get wrong. `ws: true` is what makes the
      // upgrade handshake pass through rather than 404.
      '/socket.io': {
        target: process.env.VITE_DEV_API_ORIGIN || 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },

  // ── Build optimizations ─────────────────────────────────
  build: {
    chunkSizeWarningLimit: 1600,   // suppress warning for large app
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('tesseract.js'))         return 'tesseract';
          if (id.includes('antd'))                 return 'antd';
          if (id.includes('@ant-design/icons'))    return 'ant-icons';
          // Group react + react-dom + scheduler together to avoid circular deps
          if (
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/scheduler/')
          ) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
})
