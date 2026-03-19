import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import { PRDetailApp } from "./components/pr-detail/PRDetailApp";

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.classList.toggle('dark', isDark);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PRDetailApp />
  </React.StrictMode>,
);
