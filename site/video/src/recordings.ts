// The scenes, in order. Each names a recording from design/site/recordings.json
// and the two caption lines shown under it: the benefit first, then the
// feature by the name it has in the app. A recording whose file does not
// exist yet (fix-with-claude and flyout are still drafts) is skipped.

/** A source rectangle in recording pixels: the part of the recording the window shows. */
export type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SceneSpec = {
  slug: string;
  headline: string;
  detail: string;
  /** Seconds to skip at the start of the recording. */
  trimStart?: number;
  /** Seconds to stop at (from the start of the file). */
  trimEnd?: number;
  crop?: Crop;
};

export const launchScenes: SceneSpec[] = [
  {
    slug: 'pr-detail-push',
    headline: 'Open a pull request without losing your place.',
    detail: 'Click a row in Pull requests to see it full screen. Back takes you to the list.',
  },
  {
    slug: 'filter-flip',
    headline: 'See what needs you in one click.',
    detail: 'Pick Needs you, Mine or Failing and the list rearranges itself in place.',
  },
  {
    slug: 'fix-with-claude',
    headline: 'Hand a failing check to Claude.',
    detail: 'Fix with Claude starts an agent on the failure, straight from the pull request.',
  },
  {
    slug: 'quick-review',
    headline: 'Review the changes one file at a time.',
    detail: 'Quick review walks you through every file. Press V to mark one reviewed.',
    // The story draws Quick review on a black backdrop; leave that out.
    crop: { x: 21, y: 21, width: 1318, height: 838 },
  },
  {
    slug: 'focus-merge',
    headline: 'Merge the moment it is ready.',
    detail: 'Focus sorts your work into columns. Merge from the board and the count goes up.',
    // The current recording turns white after 5.57 s; stop before that
    // until it is re-recorded (resolveScenes clamps this to the file length).
    trimEnd: 5.5,
  },
  {
    slug: 'flyout',
    headline: 'Check in from the tray.',
    detail: 'The flyout shows what is failing and what is ready, without opening the window.',
  },
];

// Short: three scenes, trimmed to the action and cropped to a portrait-friendly
// part of each recording. Times and rectangles are for the dark recordings
// as recorded on 2026-09-25; re-check them when the recordings are redone.
export const shortScenes: SceneSpec[] = [
  {
    slug: 'pr-detail-push',
    headline: 'Open a pull request in place.',
    detail: 'Full screen in the same window. Back returns you to the list.',
    trimStart: 0.4,
    trimEnd: 6.0,
    crop: { x: 205, y: 0, width: 1075, height: 640 },
  },
  {
    slug: 'quick-review',
    headline: 'Review one file at a time.',
    detail: 'Quick review walks the changes. V marks a file reviewed.',
    trimStart: 0.9,
    trimEnd: 5.2,
    crop: { x: 21, y: 21, width: 1100, height: 838 },
  },
  {
    slug: 'focus-merge',
    headline: 'Merge when it is ready.',
    detail: 'Right from the Focus board. The count goes up.',
    trimStart: 1.0,
    trimEnd: 5.5,
    crop: { x: 292, y: 0, width: 708, height: 640 },
  },
];
