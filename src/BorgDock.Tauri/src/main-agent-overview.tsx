import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import './styles/index.css';
import './styles/agent-overview.css';
import { AgentOverviewApp } from '@/components/agent-overview/AgentOverviewApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AgentOverviewApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
