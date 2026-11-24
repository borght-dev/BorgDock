import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import './styles/index.css';
import { SettingsApp } from '@/components/settings/SettingsApp';
import { followUpdateStatus } from '@/runtime/update-status';
import { startResponsivenessMonitor } from '@/services/responsiveness';
import { startWindowTheme } from '@/utils/theme';

// Theme and reduced motion follow the saved settings (and later changes from
// any window); public/theme-boot.js already set them before first paint.
startWindowTheme();
startResponsivenessMonitor();
// The main window sends the update notifications; this one only shows the status.
followUpdateStatus();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
