import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import './styles/agent-overview.css';
import { AgentOverviewApp } from '@/components/agent-overview/AgentOverviewApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AgentOverviewApp />
  </React.StrictMode>,
);
