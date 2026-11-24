import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { ActivityHistoryApp } from './components/activity/ActivityHistoryApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { attachConsoleBridge, createLogger } from './services/logger';
import { startResponsivenessMonitor } from './services/responsiveness';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';
import { startWindowTheme } from './utils/theme';

// Theme and reduced motion follow the saved settings (and later changes from
// any window); public/theme-boot.js already set them before first paint.
startWindowTheme();

disableDefaultContextMenu();
attachConsoleBridge();
startResponsivenessMonitor();
const log = createLogger('activity-history-boot');

window.addEventListener('error', (e) => {
  log.error('window error', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  log.error('unhandled rejection', e.reason);
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ActivityHistoryApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
