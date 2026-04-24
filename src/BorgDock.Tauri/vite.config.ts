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
      ],
    }),
    // Language grammars (tree-sitter-*.wasm) are built from source by
    // scripts/build-grammars.sh and committed to public/grammars/ — Vite
    // serves the public dir at root automatically, so they end up at
    // /grammars/tree-sitter-<name>.wasm without any copy plugin.
  ],
  test: {
    environment: "jsdom",
    exclude: [
      // Playwright e2e specs (run by Playwright, not vitest) — but keep
      // vitest unit tests that live under tests/e2e/**/__tests__ (e.g.
      // design-fixtures.test.ts) runnable via `npm test`.
      "tests/e2e/**/*.spec.ts",
      "tests/e2e/design-bundle/**",
      "tests/e2e/scripts/**",
      "tests/e2e/helpers/**",
      "node_modules/**",
    ],
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
        "src/palette-main.tsx",
        "src/pr-detail-main.tsx",
        "src/sql-main.tsx",
        "src/workitem-detail-main.tsx",
        "src/worktree-main.tsx",
        "src/whats-new-main.tsx",
        "src/file-palette-main.tsx",
        "src/file-viewer-main.tsx",
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
        flyout: path.resolve(__dirname, "flyout.html"),
        palette: path.resolve(__dirname, "palette.html"),
        'workitem-detail': path.resolve(__dirname, "workitem-detail.html"),
        'pr-detail': path.resolve(__dirname, "pr-detail.html"),
        sql: path.resolve(__dirname, "sql.html"),
        worktree: path.resolve(__dirname, "worktree.html"),
        'whats-new': path.resolve(__dirname, "whats-new.html"),
        filepalette: path.resolve(__dirname, "file-palette.html"),
        fileviewer: path.resolve(__dirname, "file-viewer.html"),
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
