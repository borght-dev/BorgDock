import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { BadgeApp } from './components/badge/BadgeApp';

// Apply system theme as default until main window sends the actual theme
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', isDark);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BadgeApp />
  </React.StrictMode>,
);
