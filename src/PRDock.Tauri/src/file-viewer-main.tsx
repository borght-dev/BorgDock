import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

// Placeholder component for file viewer
function FileViewerApp() {
  return <div>File viewer — coming soon</div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FileViewerApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
