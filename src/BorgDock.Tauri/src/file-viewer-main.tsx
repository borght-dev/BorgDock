import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import './styles/file-viewer.css';
import { FileViewerApp } from './components/file-viewer/FileViewerApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FileViewerApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
