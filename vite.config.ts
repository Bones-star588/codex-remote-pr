import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pwaPlugin } from './scripts/pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const build = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '.');

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(`${version} \u00b7 ${build}`)
  },
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
