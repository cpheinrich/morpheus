import { defineConfig } from "vitest/config";

// Own config so vitest never climbs to the Morpheus root config.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
