import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // GitHub Pages base path (only in production build)
  base: process.env.NODE_ENV === 'production' ? '/imap-bangladesh/' : '/',

  // ── Dev server ──────────────────────────────────────────
  server: {
    port: 5173,
    host: true,               // expose on network (LAN / mobile testing)
    strictPort: false,        // try next port if 5173 is busy
    proxy: {
      // All /api/* requests are forwarded to the backend in dev mode
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
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
