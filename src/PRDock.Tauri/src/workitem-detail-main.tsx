import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { WorkItemDetailApp } from './components/work-items/WorkItemDetailApp';

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', isDark);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WorkItemDetailApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
