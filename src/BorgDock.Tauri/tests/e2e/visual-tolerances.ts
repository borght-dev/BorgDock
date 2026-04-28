/**
 * Per-surface pixel-diff tolerances for `visual.spec.ts`.
 *
 * `maxDiffPixelRatio` is the fraction of pixels allowed to differ
 * between baseline and live capture. 0.04 (4%) is the default and
 * absorbs expected variance from:
 *   - antialiasing differences between the design bundle's HTML
 *     renderer and React's real DOM rendering,
 *   - subtle font metric shifts (same family, different loader path),
 *   - sub-pixel layout differences on edges of rounded corners.
 *
 * Override a surface below with a one-line comment explaining WHY.
 * Anything above 0.06 demands a linked issue in the comment, not just
 * a justification — it's a smell that the live render is drifting from
 * the design on something structural, not cosmetic.
 */
export const DEFAULT_TOLERANCE = 0.04;

export const VISUAL_TOLERANCES: Record<string, number> = {
  // (empty for now; surfaces get entries as PR #1-#7 lands and we learn
  // which baselines need genuinely higher tolerance vs. code fixes.)
};
