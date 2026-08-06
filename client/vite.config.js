import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';

// Proxy: di dev, request /api dan /socket.io diteruskan ke backend
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // PERF v4.1: target modern → output JS lebih kecil & lebih cepat diparse
    target: 'es2020',
    // PERF v4.1: code-splitting vendor → chunk utama kecil, cache-friendly.
    // Library gede (framer-motion, socket.io, lucide) di-cache terpisah oleh
    // browser, jadi load awal & navigasi terasa jauh lebih ringan.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-socket': ['socket.io-client'],
          'vendor-icons': ['lucide-react'],
          'vendor-qr': ['qrcode.react'],
        },
      },
    },
  },
});
