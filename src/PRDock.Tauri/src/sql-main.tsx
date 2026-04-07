import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { SqlApp } from './components/sql/SqlApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', isDark);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SqlApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
