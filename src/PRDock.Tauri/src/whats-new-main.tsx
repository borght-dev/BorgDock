import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { WhatsNewApp } from './components/whats-new/WhatsNewApp';
import { attachConsoleBridge, createLogger } from './services/logger';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();
attachConsoleBridge();
const log = createLogger('whats-new-boot');

window.addEventListener('error', (e) => {
  log.error('window error', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  log.error('unhandled rejection', e.reason);
});

try {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root not found in whats-new.html');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <WhatsNewApp />
      </ErrorBoundary>
    </React.StrictMode>,
  );
  log.info('React mounted');
} catch (err) {
  log.error('mount failed', err);
  document.body.innerHTML = `<pre style="padding:16px;color:#f87171;font:12px monospace;white-space:pre-wrap;">What's new failed to mount:\n${String(err)}</pre>`;
}
