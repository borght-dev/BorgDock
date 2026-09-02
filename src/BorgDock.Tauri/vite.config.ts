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
// Forward slashes only — vite-plugin-static-copy passes `src` to fast-glob,
// which on Windows treats backslashes from path.join as escape chars and
// silently matches nothing.
const webTreeSitterWasm = path
  .join(path.dirname(require.resolve("web-tree-sitter")), "web-tree-sitter.wasm")
  .replace(/\\/g, "/");

const host = process.env.TAURI_DEV_HOST;

/**
 * Package name from a node_modules id — handles pnpm/bun nested layouts
 * (`node_modules/.bun/<pkg>@<ver>/node_modules/<pkg>/...`) and scoped packages.
 */
function packageNameFromId(id: string): string | null {
  const normalized = id.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("node_modules/");
  if (idx === -1) return null;
  const rest = normalized.slice(idx + "node_modules/".length);
  const segments = rest.split("/");
  const first = segments[0] ?? "";
  if (first.startsWith("@")) return `${first}/${segments[1] ?? ""}`;
  return first;
}

const MARKDOWN_PREFIXES = [
  "react-markdown",
  "remark",
  "rehype",
  "micromark",
  "mdast",
  "unified",
  "hast",
  "unist",
  "vfile",
];

/**
 * Vendor chunking so the heavy libraries are shared, cacheable chunks that
 * only the entries (or lazy components) that use them pull in. Notably the
 * markdown stack must stay out of the main entry's preload graph — it's only
 * reached via the lazily-loaded QuickReviewOverlay and the pop-out windows.
 *
 * `dompurify` is intentionally NOT grouped with markdown: the main window's
 * work-item panels sanitize ADO HTML eagerly, so grouping it would drag the
 * whole markdown chunk back into the main entry.
 */
function manualChunks(id: string): string | undefined {
  const name = packageNameFromId(id);
  if (!name) return undefined;
  if (name === "react" || name === "react-dom" || name === "scheduler") return "vendor-react";
  if (MARKDOWN_PREFIXES.some((prefix) => name.startsWith(prefix))) return "vendor-markdown";
  if (name.startsWith("@codemirror/") || name.startsWith("@lezer/") || name === "codemirror") {
    return "vendor-codemirror";
  }
  if (name === "web-tree-sitter") return "vendor-tree-sitter";
  return undefined;
}

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
      // design-fixtures.test.ts) runnable via `bun run test`.
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
    // WebView2 is evergreen Chromium — no need to down-level syntax.
    target: "esnext",
    rollupOptions: {
      output: { manualChunks },
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
