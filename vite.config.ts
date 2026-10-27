import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwaPlugin } from './scripts/pwa';

export default defineConfig({
  plugins: [react(), pwaPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4545',
      '/ws': {
        target: 'ws://127.0.0.1:4545',
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true
  }
});
