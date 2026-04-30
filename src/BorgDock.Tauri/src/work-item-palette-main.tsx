import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { WorkItemPaletteApp } from './components/work-item-palette/WorkItemPaletteApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WorkItemPaletteApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
