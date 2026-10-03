import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "/loop-breaker/",
  plugins: [react()],
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
