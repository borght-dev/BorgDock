import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import './styles/index.css';
import { SettingsApp } from '@/components/settings/SettingsApp';
import { startWindowTheme } from '@/utils/theme';

// Theme and reduced motion follow the saved settings (and later changes from
// any window); public/theme-boot.js already set them before first paint.
startWindowTheme();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
