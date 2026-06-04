import { getCurrentWindow } from '@tauri-apps/api/window';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { attachConsoleBridge, createLogger } from './services/logger';
import './styles/index.css';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

// Route all console.* calls into the tauri-plugin-log backend so they land
// in %APPDATA%/BorgDock/logs/borgdock.log alongside Rust logs. Must run before
// anything else writes to the console.
attachConsoleBridge();

const bootLog = createLogger('boot');
bootLog.info('main.tsx loaded', {
  url: window.location.href,
  userAgent: navigator.userAgent,
});

// Re-assert focus only if the window is actually visible. The main window is
// built hidden (visible:false) and lives in the tray until the user summons it;
// calling setFocus() on the hidden window at boot pulls the foreground onto
// BorgDock and steals focus from whatever the user is typing in — very
// noticeable on a `tauri dev` hot-reload restart (and on autostart launches).
// When the window is later shown, Rust's set_focus on the show path satisfies
// the Windows "must-have-been-focused-once" requirement for WM_KILLFOCUS.
void getCurrentWindow()
  .isVisible()
  .then((visible) => (visible ? getCurrentWindow().setFocus() : undefined))
  .catch((err) => bootLog.error('setFocus failed', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
