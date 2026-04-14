import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "path";
import { changelogPlugin } from "./scripts/changelog/vite-plugin";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    changelogPlugin({
      packageRoot: __dirname,
      repoRoot: path.resolve(__dirname, "../.."),
    }),
    viteStaticCopy({
      targets: [
        {
          // Tree-sitter runtime — served at /web-tree-sitter.wasm
          src: "node_modules/web-tree-sitter/web-tree-sitter.wasm",
          dest: ".",
          rename: { stripBase: true },
        },
        {
          // Prebuilt language grammars — served at /grammars/tree-sitter-*.wasm
          // (SQL grammar is built manually and lives in public/grammars/)
          src: "node_modules/tree-sitter-wasms/out/*.wasm",
          dest: "grammars",
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  test: {
    environment: "jsdom",
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "clover", "json"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/__tests__/**",
        "src/types/**",
        "src/vite-env.d.ts",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/badge-main.tsx",
        "src/palette-main.tsx",
        "src/pr-detail-main.tsx",
        "src/sql-main.tsx",
        "src/workitem-detail-main.tsx",
        "src/worktree-main.tsx",
        "src/test-setup.ts",
        "src/test-utils/**",
        "src/**/index.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        badge: path.resolve(__dirname, "badge.html"),
        flyout: path.resolve(__dirname, "flyout.html"),
        palette: path.resolve(__dirname, "palette.html"),
        'workitem-detail': path.resolve(__dirname, "workitem-detail.html"),
        'pr-detail': path.resolve(__dirname, "pr-detail.html"),
        sql: path.resolve(__dirname, "sql.html"),
        worktree: path.resolve(__dirname, "worktree.html"),
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
