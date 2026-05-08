// .storybook/screenshot.ts
//
// Typed Storybook parameters for the capture pipeline.
//
// Static stories opt in via `parameters: screenshot({...})`. The capture
// script reads `parameters.screenshot` from the runtime preview API and
// writes a PNG to <output>.
//
// Animated stories opt in via `parameters: animation({...})` AND a story
// `play` function that drives the interaction. The script captures
// frames at `fps`, runs `play` to completion (or until `duration` ms),
// and pipes the frames through ffmpeg-static to produce a GIF at
// <output>.

export interface ScreenshotParameters {
  /** Repo-root-relative output path, e.g. 'docs/hero/readme-main.png'. */
  output: string;
  /** CSS pixel width. Final PNG width is width * deviceScaleFactor. */
  width: number;
  /** CSS pixel height. */
  height: number;
  /** Device scale factor for crisp captures. Default 2. */
  deviceScaleFactor?: number;
  /** Optional CSS selector to wait for before capturing. */
  waitFor?: string;
  /** Optional CSS selector to capture instead of the iframe body. */
  selector?: string;
}

export function screenshot(params: ScreenshotParameters): {
  screenshot: ScreenshotParameters;
} {
  return { screenshot: params };
}

export interface AnimationParameters {
  /** Repo-root-relative output path, e.g. 'docs/anim/pr-detail-tabs.gif'. */
  output: string;
  /** CSS pixel width. */
  width: number;
  /** CSS pixel height. */
  height: number;
  /** Capture cadence (frames per second). Default 12. */
  fps?: number;
  /** Total capture window in ms. Capture stops at `play` resolution
   *  OR `duration` elapsed, whichever is later. Default 5000. */
  duration?: number;
  /** Device scale factor. Default 2. */
  deviceScaleFactor?: number;
  /** Optional CSS selector to wait for before frame capture begins. */
  waitFor?: string;
}

export function animation(params: AnimationParameters): {
  animation: AnimationParameters;
} {
  return { animation: params };
}
