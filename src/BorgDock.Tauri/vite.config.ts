import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { createRequire } from "module";
import path from "path";
import { changelogPlugin } from "./scripts/changelog/vite-plugin";
import pkg from "./package.json";

const require = createRequire(import.meta.url);
// Resolve web-tree-sitter from wherever the package manager actually
// installed it (npm: nested in src/BorgDock.Tauri/node_modules, bun
// workspace: hoisted to repo root). Without this, vite-plugin-static-copy's
// relative path breaks when node_modules isn't directly under vite root.
// web-tree-sitter's package.json `exports` field doesn't whitelist
// ./package.json, so resolve via its main entry and walk up.
const webTreeSitterWasm = path.join(
  path.dirname(require.resolve("web-tree-sitter")),
  "web-tree-sitter.wasm",
);

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  define: {
    __BORGDOCK_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
    changelogPlugin({
      packageRoot: __dirname,
      repoRoot: path.resolve(__dirname, "../.."),
    }),
    viteStaticCopy({
      targets: [
        {
          // Tree-sitter runtime — served at /web-tree-sitter.wasm
          src: webTreeSitterWasm,
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
        "src/work-item-palette-main.tsx",
        "src/pr-detail-main.tsx",
        "src/sql-main.tsx",
        "src/workitem-detail-main.tsx",
        "src/worktree-main.tsx",
        "src/whats-new-main.tsx",
        "src/file-palette-main.tsx",
        "src/file-viewer-main.tsx",
        "src/main-agent-overview.tsx",
        "src/settings-main.tsx",
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
        'work-item-palette': path.resolve(__dirname, "work-item-palette.html"),
        'workitem-detail': path.resolve(__dirname, "workitem-detail.html"),
        'pr-detail': path.resolve(__dirname, "pr-detail.html"),
        sql: path.resolve(__dirname, "sql.html"),
        worktree: path.resolve(__dirname, "worktree.html"),
        'whats-new': path.resolve(__dirname, "whats-new.html"),
        filepalette: path.resolve(__dirname, "file-palette.html"),
        fileviewer: path.resolve(__dirname, "file-viewer.html"),
        'agent-overview': path.resolve(__dirname, "agent-overview.html"),
        settings: path.resolve(__dirname, "settings.html"),
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
