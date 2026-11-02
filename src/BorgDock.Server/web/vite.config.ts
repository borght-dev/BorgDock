import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs separately; set DISPATCH_EXTRA_ORIGINS=http://localhost:5173 on the server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:8796', changeOrigin: false } } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
