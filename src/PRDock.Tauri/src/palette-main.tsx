import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { PaletteApp } from './components/command-palette/PaletteApp';

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', isDark);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PaletteApp />
  </React.StrictMode>,
);
