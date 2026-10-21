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
  },
  {
    slug: 'dispatch-briefing',
    headline: 'See your work and the agents on it.',
    detail: 'Dispatch opens on a briefing. Click a number to see just those items.',
    // Up to Clear; the item drawer at the end is for the site, not the video.
    trimStart: 0.8,
    trimEnd: 8.0,
  },
  {
    slug: 'dispatch-start',
    headline: 'Start an agent on the next item.',
    detail: 'Pick a free slot, a model and how it begins. It runs in T3 Code.',
    trimStart: 1.0,
    trimEnd: 9.5,
  },
  {
    slug: 'flyout',
    headline: 'Check in from the tray.',
    detail: 'The flyout shows what is failing and what is ready, without opening the window.',
  },
];

// The Dispatch page's hero: the same reel as LaunchHero, only Dispatch.
export const dispatchScenes: SceneSpec[] = [
  {
    slug: 'dispatch-layouts',
    headline: 'Your work items and the agents on them.',
    detail: 'States, List or Board: each item with its T3 threads and pull requests.',
  },
  {
    slug: 'dispatch-briefing',
    headline: 'Start the morning with the briefing.',
    detail: 'Click a number to see just those items.',
    trimStart: 0.8,
    trimEnd: 8.0,
  },
  {
    slug: 'dispatch-move',
    headline: 'Fix a status that fell behind.',
    detail: 'Pick the state. An agent makes the move, with the notes it needs.',
  },
  {
    slug: 'dispatch-fix',
    headline: 'Catch up on everything at once.',
    detail: 'Fix out of sync hands every item that fell behind to one agent.',
  },
  {
    slug: 'dispatch-start',
    headline: 'Start an agent on the next item.',
    detail: 'Pick a free slot, a model and how it begins.',
    trimStart: 1.0,
    trimEnd: 9.5,
  },
  {
    slug: 'dispatch-board',
    headline: 'Open any item without losing the board.',
    detail: 'A card opens its detail in a drawer beside the columns.',
  },
];

// Short: three scenes, trimmed to the action and cropped to a portrait-friendly
// part of each recording. Times and rectangles are for the dark recordings
// as recorded on 2026-10-21; re-check them when the recordings are redone.
export const shortScenes: SceneSpec[] = [
  {
    slug: 'dispatch-briefing',
    headline: 'See what needs you first.',
    detail: 'Dispatch counts your work. Click a number to see just those items.',
    trimStart: 0.8,
    trimEnd: 7.4,
    crop: { x: 205, y: 0, width: 760, height: 860 },
  },
  {
    slug: 'quick-review',
    headline: 'Review one file at a time.',
    detail: 'Quick review walks the changes. V marks a file reviewed.',
    trimStart: 1.2,
    trimEnd: 5.8,
    crop: { x: 21, y: 21, width: 1100, height: 838 },
  },
  {
    slug: 'focus-merge',
    headline: 'Merge when it is ready.',
    detail: 'Right from the Focus board. The count goes up.',
    trimStart: 1.0,
    crop: { x: 292, y: 0, width: 708, height: 640 },
  },
];
