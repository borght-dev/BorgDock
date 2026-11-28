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

/** Quick review at 1440×900 without the story's black backdrop. */
const QUICK_REVIEW_CROP: Crop = { x: 20, y: 20, width: 1400, height: 860 };

const reviewGuideScene: SceneSpec = {
  slug: 'review-guide',
  headline: 'Open a chapter in the Review Guide.',
  detail: 'Follow the refund calculation to its diff, then mark the file reviewed to read its tests.',
  crop: QUICK_REVIEW_CROP,
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
  reviewGuideScene,
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
    detail: 'Pick the machine, a fresh worktree and how it begins. It runs in T3 Code.',
    trimStart: 2.0,
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
    detail: 'Pick the machine, a fresh worktree and how it begins.',
    trimStart: 2.0,
  },
  {
    slug: 'dispatch-board',
    headline: 'Open any item without losing the board.',
    detail: 'A card opens its detail in a drawer beside the columns.',
  },
];

// The Quick review page opens with the guide, then shows the walk, images and decision.
export const quickReviewScenes: SceneSpec[] = [
  reviewGuideScene,
  {
    slug: 'quick-review-walk',
    headline: 'Keep the pull request in view.',
    detail: 'D opens the description in place. The proof sits beside the diff.',
    crop: QUICK_REVIEW_CROP,
  },
  {
    slug: 'quick-review-images',
    headline: 'See what a changed image looks like now.',
    detail: 'Before and After side by side. Click one to zoom in.',
    crop: { x: 20, y: 20, width: 1440, height: 885 },
  },
  {
    slug: 'quick-review-decide',
    headline: 'Decide the moment you are done.',
    detail: 'The last file turns the footer into your verdict. Then the next pull request opens.',
    crop: QUICK_REVIEW_CROP,
  },
];

// Recheck the portrait crops and timing when the dark recordings change.
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
    ...reviewGuideScene,
    detail: 'Choose Refund total to open the calculation and its tests.',
    trimStart: 0.5,
    trimEnd: 7.5,
    crop: { x: 20, y: 20, width: 970, height: 860 },
  },
  {
    slug: 'focus-merge',
    headline: 'Merge when it is ready.',
    detail: 'Right from the Focus board. The count goes up.',
    trimStart: 1.0,
    crop: { x: 292, y: 0, width: 708, height: 640 },
  },
];
