/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal config created by L08 (Charts) so charts can be developed before L07's
// scaffold lands. The integrator should keep L07's version and merge the `test` block.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/charts/test-setup.ts'],
  },
});
