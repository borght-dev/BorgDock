import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { FlyoutApp } from './components/flyout/FlyoutApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { attachConsoleBridge, createLogger } from './services/logger';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

// Route console.* into tauri-plugin-log so logs from the flyout reach
// %APPDATA%/BorgDock/logs/borgdock.log alongside main-window logs.
attachConsoleBridge();

const bootLog = createLogger('flyout-boot');

window.addEventListener('error', (e) => {
  bootLog.error('window error', e.error ?? e.message, {
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
  });
});
window.addEventListener('unhandledrejection', (e) => {
  bootLog.error('unhandled promise rejection', e.reason);
});

bootLog.info('bootstrap start', {
  href: window.location.href,
  hasTauri: '__TAURI_INTERNALS__' in window,
});

try {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root element not found in flyout.html');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <FlyoutApp />
      </ErrorBoundary>
    </React.StrictMode>,
  );
  bootLog.info('React mounted');
} catch (err) {
  bootLog.error('React mount failed', err);
}
