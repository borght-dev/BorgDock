// These captures also illustrate the corresponding release posts.
import dispatchWork from '../assets/dispatch/work.png';
import dispatchBrowse from '../assets/dispatch/browse.png';
import dispatchSettings from '../assets/dispatch/settings.png';
import releaseImages from 'virtual:release-images';
import { highlightsOf, releases } from './changelog';
import type { GalleryPage, Theme } from './media';

interface GalleryScreen {
  page: string;
  theme: Theme;
  image: ImageMetadata;
  title: string;
  alt: string;
}

const groups: Partial<Record<GalleryPage, string[]>> = {
  Rail: ['rail', 'rail-folded'],
  'Pull requests': ['pr-table', 'pr-board', 'display-menu', 'filters-views', 'pr-failure-filter', 'dependency-sheet', 'dependency-row'],
  'Work items': ['work-item-detail', 'work-item-activity', 'work-item-peek', 'work-item-hover-cards'],
  'Quick review': [
    'quick-review-controls', 'quick-review-rendered-files', 'own-pr-walk-through', 'quick-review-checks',
    'regression-risk', 'regression-risk-walk', 'review-guide', 'review-commits', 'folded-changes',
    'author-run', 'e2e-verdict', 'review-progress', 'next-review', 'guides-ahead', 'guide-skipped',
  ],
  Notes: ['quick-notes', 'notes-vault-controls'],
};

const highlights = releases.flatMap(highlightsOf);
const light = new Set(['display-menu', 'filters-views', 'review-progress']);

const releaseScreens = Object.entries(groups).flatMap(([page, slugs]) =>
  slugs.map<GalleryScreen>((slug) => {
    const highlight = highlights.find((entry) => entry.image?.path.endsWith(`/${slug}.png`));
    if (!highlight?.image || !releaseImages[highlight.image.path]) throw new Error(`Missing release capture: ${slug}`);
    return {
      page,
      title: highlight.title,
      alt: highlight.image.alt,
      image: releaseImages[highlight.image.path],
      theme: light.has(slug) ? 'light' : 'dark',
    };
  }),
);

export const desktopScreens: GalleryScreen[] = [
  ...releaseScreens,
  { page: 'Dispatch', theme: 'light', image: dispatchWork, title: 'Dispatch on the web', alt: 'Decision queue with the selected work item and the agent update' },
  { page: 'Dispatch', theme: 'light', image: dispatchBrowse, title: 'Browse Azure DevOps', alt: 'Current sprint work items with queue and start actions' },
  { page: 'Dispatch', theme: 'light', image: dispatchSettings, title: 'Dispatch devices and notifications', alt: 'Browser notifications, signed-in devices and passkey settings' },
];
