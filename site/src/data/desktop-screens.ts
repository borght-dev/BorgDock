import dispatchWork from '../assets/dispatch/work.png';
import dispatchBrowse from '../assets/dispatch/browse.png';
import dispatchSettings from '../assets/dispatch/settings.png';
import type { GalleryPage, Theme } from './media';

export interface GalleryScreen {
  page: GalleryPage;
  app?: string;
  theme: Theme;
  image: ImageMetadata;
  title: string;
  alt: string;
}

export const desktopScreens: GalleryScreen[] = [
  { page: 'Dispatch', theme: 'light', image: dispatchWork, title: 'Dispatch on the web', alt: 'Decision queue with the selected work item and the agent update' },
  { page: 'Dispatch', theme: 'light', image: dispatchBrowse, title: 'Browse Azure DevOps', alt: 'Current sprint work items with queue and start actions' },
  { page: 'Dispatch', theme: 'light', image: dispatchSettings, title: 'Dispatch devices and notifications', alt: 'Browser notifications, signed-in devices and passkey settings' },
];
