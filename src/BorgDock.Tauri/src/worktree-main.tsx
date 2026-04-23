import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { WorktreePaletteApp } from './components/worktree-palette/WorktreePaletteApp';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WorktreePaletteApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
