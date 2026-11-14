/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minimal L10 scaffold; L07 owns the real config (relative base so dist/ works as static files).
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { environment: "jsdom", globals: false },
});
