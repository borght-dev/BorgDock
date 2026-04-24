// Shared visual primitives used across every surface.

const Ring = ({ value = 75, size = 28, stroke = 3 }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  const color =
    value >= 80 ? "var(--color-status-green)" :
    value >= 50 ? "var(--color-status-yellow)" :
                  "var(--color-status-red)";
  return (
    <div className="bd-ring" style={{ "--ring-size": `${size}px` }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle className="bd-ring__track" cx={size/2} cy={size/2} r={r}
                fill="none" strokeWidth={stroke} />
        <circle className="bd-ring__value" cx={size/2} cy={size/2} r={r}
                fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <span className="bd-ring__label" style={{ color }}>{value}</span>
    </div>
  );
};

const Pill = ({ tone = "neutral", icon, children, ghost = false, style }) => (
  <span className={`bd-pill ${ghost ? "bd-pill--ghost" : `bd-pill--${tone}`}`} style={style}>
    {icon}{children}
  </span>
);

const Dot = ({ tone = "gray", pulse = false, size = 8 }) => (
  <span className={`bd-dot bd-dot--${tone}`}
    style={{ width: size, height: size, animation: pulse ? "bd-pulse-dot 2.6s ease-in-out infinite" : undefined }} />
);

const Avatar = ({ initials, tone = "them", size = "md" }) => {
  const cls = size === "lg" ? "bd-avatar--lg" : size === "sm" ? "bd-avatar--sm" : "";
  return <span className={`bd-avatar bd-avatar--${tone} ${cls}`}>{initials}</span>;
};

const Kbd = ({ children }) => <span className="bd-kbd">{children}</span>;

const Tabs = ({ value, onChange, tabs, dense = false }) => (
  <div className="bd-tabs" style={{ gap: dense ? 14 : 18 }}>
    {tabs.map(t => (
      <button
        key={t.id}
        className={`bd-tab ${value === t.id ? "bd-tab--active" : "bd-tab--inactive"}`}
        onClick={() => onChange?.(t.id)}
      >
        {t.label}
        {t.count != null && <span className="bd-tab__count">{t.count}</span>}
      </button>
    ))}
  </div>
);

const Chip = ({ active, onClick, count, children, tone }) => (
  <button
    onClick={onClick}
    className={`bd-pill ${active ? "bd-pill--neutral" : "bd-pill--ghost"}`}
    style={{
      height: 24, border: "1px solid",
      cursor: "pointer", fontWeight: 500,
      ...(tone === "error" && active ? {
        background: "var(--color-error-badge-bg)",
        color: "var(--color-error-badge-fg)",
        borderColor: "var(--color-error-badge-border)",
      } : {}),
    }}
  >
    {children}
    {count != null && (
      <span style={{
        fontSize: 10, padding: "0 5px", borderRadius: 999,
        background: active ? "rgba(0,0,0,0.08)" : "var(--color-surface-hover)",
        color: "inherit", fontWeight: 600,
      }}>{count}</span>
    )}
  </button>
);

const Titlebar = ({ title, count, right, left, meta }) => (
  <div className="bd-titlebar">
    {left ?? (
      <>
        <span className="bd-titlebar__logo"><Icons.Logo /></span>
        <span className="bd-titlebar__title">{title}</span>
        {count != null && <span className="bd-titlebar__count">{count}</span>}
        {meta}
      </>
    )}
    <span className="bd-titlebar__spacer" />
    {right}
  </div>
);

const WindowControls = ({ onPin, pinned, onSettings }) => (
  <>
    {onPin && (
      <button className={`bd-wc ${pinned ? "bd-icon-btn--active" : ""}`} onClick={onPin} title="Pin">
        <Icons.Sidebar size={14} />
      </button>
    )}
    {onSettings && (
      <button className="bd-wc" onClick={onSettings} title="Settings">
        <Icons.Settings size={14} />
      </button>
    )}
    <span style={{ width: 4 }} />
    <button className="bd-wc" title="Minimize"><Icons.Minus size={14} /></button>
    <button className="bd-wc" title="Maximize"><Icons.Maximize size={12} /></button>
    <button className="bd-wc bd-wc--close" title="Close"><Icons.X size={14} /></button>
  </>
);

Object.assign(window, { Ring, Pill, Dot, Avatar, Kbd, Tabs, Chip, Titlebar, WindowControls });
