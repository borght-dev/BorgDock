import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { attachConsoleBridge, createLogger } from './services/logger';
import './styles/index.css';

// Route all console.* calls into the tauri-plugin-log backend so they land
// in %APPDATA%/PRDock/logs/prdock.log alongside Rust logs. Must run before
// anything else writes to the console.
attachConsoleBridge();

const bootLog = createLogger('boot');
bootLog.info('main.tsx loaded', {
  url: window.location.href,
  userAgent: navigator.userAgent,
});

// Redundant focus call (Rust setup already calls set_focus after show) kept as
// a belt-and-suspenders safeguard — Windows requires the window to have received
// focus at least once before onFocusChanged / WM_KILLFOCUS will fire.
getCurrentWindow()
  .setFocus()
  .catch((err) => bootLog.error('setFocus failed', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
