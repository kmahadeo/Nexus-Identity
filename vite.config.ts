import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      '@icp-sdk/core/principal': fileURLToPath(new URL('./icp-principal-stub.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
