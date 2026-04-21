import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import './styles/file-palette.css';
import { FilePaletteApp } from './components/file-palette/FilePaletteApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FilePaletteApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
