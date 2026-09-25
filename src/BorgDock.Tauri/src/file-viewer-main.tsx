import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { FileViewerApp } from './components/file-viewer/FileViewerApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';
import { startWindowTheme } from './utils/theme';

// Theme and reduced motion follow the saved settings (and later changes from
// any window); public/theme-boot.js already set them before first paint.
startWindowTheme();

disableDefaultContextMenu();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FileViewerApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
