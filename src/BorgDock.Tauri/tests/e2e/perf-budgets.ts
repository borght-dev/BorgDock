/**
 * Per-project performance budgets in milliseconds.
 *
 * Calibration procedure (run once on PR #0, re-run if the runner
 * hardware changes):
 *   1. Run `npm run test:e2e -- performance.spec.ts --project=<name>`
 *      three times, capture the median of each metric.
 *   2. Set the budget to median * 1.25 (25% headroom for noise).
 *   3. Subsequent PRs must stay under the budget or justify.
 *
 * These are intentionally generous — PR #0 is not a perf optimization
 * exercise, it's a "don't regress by an order of magnitude" guard.
 */
export type PerfBudgets = {
  initialPaintMs: number;
  prClickToDetailMs: number;
  commandPaletteOpenMs: number;
  filePaletteKeystrokeMs: number;
  prDetailTabSwitchMs: number;
};

export const PERF_BUDGETS: Record<string, PerfBudgets> = {
  'webview-mac': {
    initialPaintMs: 800,
    prClickToDetailMs: 150,
    commandPaletteOpenMs: 50,
    filePaletteKeystrokeMs: 80,
    prDetailTabSwitchMs: 100,
  },
  'webview-win': {
    initialPaintMs: 1200,   // Windows runners are slower on GH Actions
    prClickToDetailMs: 220,
    commandPaletteOpenMs: 80,
    filePaletteKeystrokeMs: 120,
    prDetailTabSwitchMs: 150,
  },
};
