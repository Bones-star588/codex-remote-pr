import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwaPlugin } from './scripts/pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version)
  },
  plugins: [react(), pwaPlugin(version)],
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
    rollupOptions: { input: {
      index: fileURLToPath(new URL('./index.html', import.meta.url)),
      update: fileURLToPath(new URL('./update.html', import.meta.url))
    } },
    outDir: 'dist/client',
    emptyOutDir: true
  }
});
