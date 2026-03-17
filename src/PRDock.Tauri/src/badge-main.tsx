import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import { BadgeApp } from "./components/badge/BadgeApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BadgeApp />
  </React.StrictMode>,
);
