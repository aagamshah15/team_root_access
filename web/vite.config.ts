/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so web/dist/ works from any folder, on a static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 0, strictPort: false },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.{ts,tsx}'] },
});
