import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './App';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import './styles/index.css';

// Window starts hidden (visible: false in tauri.conf.json) to avoid a blank
// flash and taskbar icon race on Windows. Show it now that the HTML (splash
// screen) is in the DOM.
getCurrentWindow().show();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
