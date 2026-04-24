// Lucide-style stroke icons, 1.5px stroke, consistent 16px grid.
const Ic = ({ d, size = 16, strokeWidth = 1.5, fill = "none", children, ...p }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
       viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icons = {
  Logo: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h3l2-5 4 10 2-5h7" />
    </svg>
  ),
  Check: (p) => <Ic {...p} d="M20 6 9 17l-5-5" />,
  X: (p) => <Ic {...p} d="M18 6 6 18M6 6l12 12" />,
  Minus: (p) => <Ic {...p} d="M5 12h14" />,
  Plus: (p) => <Ic {...p} d="M12 5v14M5 12h14" />,
  ChevronDown: (p) => <Ic {...p} d="m6 9 6 6 6-6" />,
  ChevronRight: (p) => <Ic {...p} d="m9 6 6 6-6 6" />,
  ChevronUp: (p) => <Ic {...p} d="m6 15 6-6 6 6" />,
  Search: (p) => <Ic {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Ic>,
  Settings: (p) => <Ic {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Ic>,
  Refresh: (p) => <Ic {...p} d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />,
  Pin: (p) => <Ic {...p} d="M12 2v10l4 4H8l4-4V2M12 22v-6" />,
  Minimize: (p) => <Ic {...p} d="M5 12h14" />,
  Maximize: (p) => <Ic {...p}><rect x="5" y="5" width="14" height="14" rx="1" /></Ic>,
  Clock: (p) => <Ic {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ic>,
  External: (p) => <Ic {...p} d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />,
  Branch: (p) => <Ic {...p}><circle cx="6" cy="3" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M6 5v8a5 5 0 0 0 5 5h1M6 16V9M18 8v1a4 4 0 0 1-4 4h-2" /></Ic>,
  File: (p) => <Ic {...p} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />,
  GitCommit: (p) => <Ic {...p}><circle cx="12" cy="12" r="3" /><path d="M3 12h6M15 12h6" /></Ic>,
  MessageSquare: (p) => <Ic {...p} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  Eye: (p) => <Ic {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Ic>,
  Star: (p) => <Ic {...p} d="m12 2 3.1 6.3L22 9.3l-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.2 2 9.3l6.9-1z" />,
  StarFill: (p) => <Ic {...p} fill="currentColor" d="m12 2 3.1 6.3L22 9.3l-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.2 2 9.3l6.9-1z" />,
  Terminal: (p) => <Ic {...p}><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></Ic>,
  Folder: (p) => <Ic {...p} d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  Edit: (p) => <Ic {...p} d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  Record: (p) => <Ic {...p}><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></Ic>,
  AlertCircle: (p) => <Ic {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h0" /></Ic>,
  CheckCircle: (p) => <Ic {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></Ic>,
  Sidebar: (p) => <Ic {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></Ic>,
  Zap: (p) => <Ic {...p} d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  Filter: (p) => <Ic {...p} d="M22 3H2l8 9.5V19l4 2v-8.5z" />,
  ArrowRight: (p) => <Ic {...p} d="M5 12h14M13 5l7 7-7 7" />,
  Split: (p) => <Ic {...p}><path d="M16 3h5v5" /><path d="M8 3H3v5" /><path d="m21 3-9 9" /><path d="m3 3 9 9" /><path d="M12 12v9" /></Ic>,
  ArrowDown: (p) => <Ic {...p} d="M12 5v14M19 12l-7 7-7-7" />,
  ArrowUp: (p) => <Ic {...p} d="M12 19V5M5 12l7-7 7 7" />,
  Enter: (p) => <Ic {...p} d="M9 10 4 15l5 5M20 4v7a4 4 0 0 1-4 4H4" />,
  Esc: (p) => <Ic {...p}><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 10v4M16 10v4M12 10v4"/></Ic>,
  Copy: (p) => <Ic {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></Ic>,
  Spinner: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: "bd-spin 900ms linear infinite" }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.15" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

// Add keyframes once
if (typeof document !== "undefined" && !document.getElementById("bd-icon-keyframes")) {
  const s = document.createElement("style");
  s.id = "bd-icon-keyframes";
  s.textContent = `
@keyframes bd-spin { to { transform: rotate(360deg); } }
@keyframes bd-pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes bd-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { Icons });
