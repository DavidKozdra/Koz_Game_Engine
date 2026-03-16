import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'src/renderer/dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@engine': path.resolve(__dirname, '../Koz_Engine_Lib'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
