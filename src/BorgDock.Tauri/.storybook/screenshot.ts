// .storybook/screenshot.ts
//
// Typed Storybook parameter for the capture pipeline. Stories opt in by
// setting `parameters: screenshot({ output: '...', width, height })`.
// The capture script reads `parameters.screenshot` from the Storybook
// static index and writes the PNG to <output>.

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
