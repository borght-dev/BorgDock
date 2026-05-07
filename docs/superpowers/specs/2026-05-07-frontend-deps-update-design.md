# Frontend Dependency Update — Design

**Date:** 2026-05-07
**Branch:** `feat/update-deps-to-latest`
**Scope:** `src/BorgDock.Tauri/package.json` only. Rust/Cargo deps are out of scope.

## Goal

Bring every npm dependency in the Tauri frontend to the latest stable version, including breaking majors, in one bundled PR composed of sequenced internal commits.

## Starting state (2026-05-07)

`npm outdated` reveals four meaningful breaking majors plus routine minor/patch drift:

| Package | Current (resolved) | Latest |
|---|---|---|
| `vite` | 6.4.2 | **8.0.11** |
| `@vitejs/plugin-react` | 4.7.0 | **6.0.1** |
| `vitest` | 3.2.4 | **4.1.5** |
| `@vitest/coverage-v8` | 3.2.4 | **4.1.5** |
| `storybook` | 9.1.20 | **10.3.6** |
| `@storybook/react-vite` | 9.1.20 | **10.3.6** |
| `@storybook/addon-themes` | 9.1.20 | **10.3.6** |
| `typescript` | 5.9.3 | **6.0.3** |
| `jsdom` | 26.1.0 | **29.1.1** |

Plus ~20 routine minor/patch updates across `@tauri-apps/*`, codemirror, biome, react/react-dom, axe-playwright, dompurify, focus-trap-react, tanstack/react-virtual, tailwindcss, etc.

## Approach: layered commits inside one PR

One bundled PR, seven sequenced commits. The order is engineered so a gate failure points at the layer that caused it.

### L1 — Patch & minor bumps

All `wanted == latest` entries from `npm outdated`:

- biome 2.4.14
- @axe-core/playwright 4.11.3, @playwright/test 1.59.1
- codemirror dot-releases (autocomplete, view, etc.)
- dompurify 3.4.2
- focus-trap-react 12.0.1
- @tanstack/react-virtual 3.13.24
- react & react-dom 19.2.6
- tailwindcss + @tailwindcss/vite 4.2.4

Update `package.json` ranges to match new versions, run `npm install`. Risk ~zero.

### L2 — `@tauri-apps/*` cohort

`api`, `cli`, and the plugin-* family to their latest 2.x. They version in lockstep; bumping together avoids peer-warning churn. No expected migration.

### L3 — Vite stack

- `vite` 6 → 8 (skipping 7 entirely, two majors)
- `@vitejs/plugin-react` 4 → 6
- `vite-plugin-static-copy` 4.1.0

Highest-leverage layer — Vitest, Storybook, and the dev server peer-depend on Vite. Doing it first means subsequent layers validate against the final Vite.

**Watch for:**

- **Node version floor.** Vite 7 requires Node ≥20.19 / ≥22.12. Vite 8 likely tightens further. If the local Node is too old, this layer fails at `npm install`; document and ask the user to bump Node before continuing.
- **`build.target` defaults.** Vite 7 changed the default to `baseline-widely-available`. Tauri's WebView2/WKWebView baseline is well above that, so no app-side break expected, but verify the build still emits.
- **Tree-sitter wasm wiring.** `CLAUDE.md` documents that `/web-tree-sitter.wasm` (via `viteStaticCopy`) and `/grammars/tree-sitter-*.wasm` (served from `public/`) must resolve. Verify both in `npm run dev` and `vite preview` after this layer.
- **`@vitejs/plugin-react` 6.** Two-major bump from 4 → 6. The plugin's options shape may have shifted; check `vite.config.ts`.

### L4 — Vitest 4

`vitest` and `@vitest/coverage-v8` to 4.1.5.

**Watch for:**

- Removed deprecated APIs (config-shape changes in the `test:` block of `vite.config.ts`).
- Coverage thresholds shape (`thresholds: { statements, branches, functions, lines }` may have moved).
- jsdom env still wired correctly via `environment: "jsdom"`.

### L5 — Storybook 10

`storybook`, `@storybook/react-vite`, `@storybook/addon-themes` to 10.3.6, plus `@storybook/test-runner` to whatever supports SB 10 (current 0.23.0 may not — verify).

Phase 11 just shipped, so coverage is high — high blast radius if SB 10 breaks story discovery, but also high signal from `npm run test:storybook`.

**Steps:**

- Run `npx storybook@latest upgrade` to apply codemods to `.storybook/main.ts`, story formats, etc.
- Verify `npm run build-storybook` produces a static build.
- Verify `npm run test:storybook` passes.

### L6 — TS 6 + jsdom 29 + `@types/node`

Compile/test environment.

- `typescript` 5.9.3 → 6.0.3
- `jsdom` 26.1.0 → 29.1.1 (three majors)
- `@types/node` to whatever pairs with the local Node

**Watch for:**

- TS 6 is mostly source-compatible but stricter in a few spots. Expect a small `tsc -b` fixup pass — fix typing errors in the same commit.
- jsdom 29 may surface missing globals or behavior shifts in `src/test-setup.ts`.

### L7 — Cleanup

- Drop `@types/dompurify` (deprecated — DOMPurify 3.x ships its own types). Confirm `import DOMPurify from "dompurify"` still type-checks.
- Run `npm dedupe`.
- Address or document any remaining `npm install` warnings.

## Validation gates

After **each layer commit**, all three must be green before moving to the next layer:

1. `npm test` (vitest unit suite) — formal gate, the only test-suite gate CI itself enforces.
2. `npm run build-storybook` — smoke check that all stories still compile/build.
3. `tsc -b && vite build` (via `npm run build`) and `npm run lint` (biome) — already build prereqs.

`npm run test:storybook` was originally specified as a gate but is **dropped** during execution: triaging on 2026-05-07 found 29 pre-existing failures across 5 suites (`WorkItemPaletteApp`, `WorkItemDetailApp`, `WorktreePaletteApp`, `FileViewerApp`, `SqlApp`) on the starting branch tip, before any dep change. The test-runner was just installed for the new PR Detail stories and is not part of CI (`.github/workflows/test.yml` runs only vitest as required + Playwright as non-blocking). Fixing the baseline is a separate, multi-day investigation unrelated to this dep update. Build-storybook still catches story-compile regressions, which is the realistic risk for the Storybook 10 layer.

Anything `tsc -b` or biome flag gets fixed in the same layer commit that introduced it.

## Rollback strategy

If a layer's gates can't be made green in a reasonable attempt:

- The layer commit is dropped (or reverted) and the PR ships without it.
- Sequencing is chosen so a missing later layer doesn't block earlier layers. E.g. if Storybook 10 needs a peer dep we can't satisfy, L1–L4 + L6–L7 still ship; L5 becomes a follow-up.
- The PR description records what got dropped and why.

## Out of scope

- Cargo / Rust dependencies.
- Tauri 2.x → 3 if/when it lands.
- Code refactors prompted by deprecation warnings beyond the `@types/dompurify` removal.
- React 19.1 → 19.2 as a separate milestone — already covered: package.json's `^19.1` range resolves to 19.2.6 with a fresh `npm install` (rolls into L1).
