import { useState, useEffect, useRef } from "react";
import {
  Activity,
  ChevronUp,
  Wifi,
  Volume2,
  BatteryCharging,
  Cloud,
  Settings,
  PanelRightOpen,
  GitPullRequest,
  XCircle,
  Clock,
  CheckCircle2,
  MessageSquare,
  GitMerge,
  Sun,
  Moon,
} from "lucide-react";

// Purple-slate palette from the BorgDock styling guide
const palette = {
  light: {
    page: "#E8E4F0",
    surface: "#ffffff",
    surfaceRaised: "rgba(90,86,112,0.03)",
    surfaceHover: "rgba(90,86,112,0.06)",
    border: "rgba(90,86,112,0.14)",
    borderSubtle: "rgba(90,86,112,0.08)",
    accent: "#6655D4",
    accentSoft: "#7C6AF6",
    textPrimary: "#1A1726",
    textSecondary: "#3A3550",
    textTertiary: "#5A5670",
    textMuted: "#8A85A0",
    green: "#3BA68E",
    red: "#C7324F",
    yellow: "#B07D09",
    merged: "#8250DF",
    taskbar: "rgba(237,234,244,0.82)",
  },
  dark: {
    page: "#0B0913",
    surface: "#1A1726",
    surfaceRaised: "rgba(138,133,160,0.04)",
    surfaceHover: "rgba(138,133,160,0.08)",
    border: "rgba(138,133,160,0.14)",
    borderSubtle: "rgba(138,133,160,0.08)",
    accent: "#7C6AF6",
    accentSoft: "#9384F7",
    textPrimary: "#EDEAF4",
    textSecondary: "#C8C4D6",
    textTertiary: "#8A85A0",
    textMuted: "#5A5670",
    green: "#7DD3C0",
    red: "#E54065",
    yellow: "#F5B73B",
    merged: "#A371F7",
    taskbar: "rgba(17,15,26,0.72)",
  },
};

const prs = [
  {
    repo: "acme/web-app",
    num: 842,
    title: "Refactor auth flow to use session tokens",
    author: "SC",
    authorColor: "#7C6AF6",
    state: "failing",
    checks: { passed: 4, failed: 2, pending: 0 },
    reviews: "changes_requested",
    isMine: true,
    comments: 3,
  },
  {
    repo: "acme/web-app",
    num: 838,
    title: "Add dark mode toggle to settings page",
    author: "KB",
    authorColor: "#3BA68E",
    state: "pending",
    checks: { passed: 2, failed: 0, pending: 3 },
    reviews: "review_required",
    isMine: true,
    comments: 0,
  },
  {
    repo: "acme/api-core",
    num: 1204,
    title: "Rate-limit webhook endpoints",
    author: "TB",
    authorColor: "#C7324F",
    state: "failing",
    checks: { passed: 8, failed: 1, pending: 0 },
    reviews: "approved",
    isMine: false,
    comments: 5,
  },
  {
    repo: "acme/api-core",
    num: 1198,
    title: "Bump typescript to 5.6",
    author: "SC",
    authorColor: "#7C6AF6",
    state: "pending",
    checks: { passed: 5, failed: 0, pending: 2 },
    reviews: "commented",
    isMine: true,
    comments: 1,
  },
  {
    repo: "acme/infra",
    num: 91,
    title: "Migrate CI runners to ubuntu-24",
    author: "KB",
    authorColor: "#3BA68E",
    state: "passing",
    checks: { passed: 12, failed: 0, pending: 0 },
    reviews: "approved",
    isMine: false,
    comments: 2,
  },
];

function StatusDot({ state, c }) {
  const color =
    state === "failing" ? c.red : state === "pending" ? c.yellow : c.green;
  const Icon =
    state === "failing" ? XCircle : state === "pending" ? Clock : CheckCircle2;
  return <Icon size={14} style={{ color }} strokeWidth={2.25} />;
}

function ReviewBadge({ reviews, c }) {
  const map = {
    approved: { label: "approved", color: c.green, bg: "0.08", br: "0.2" },
    changes_requested: { label: "changes", color: c.red, bg: "0.08", br: "0.2" },
    review_required: {
      label: "review needed",
      color: c.yellow,
      bg: "0.08",
      br: "0.2",
    },
    commented: {
      label: "commented",
      color: c.textTertiary,
      bg: "0.06",
      br: "0.14",
    },
  };
  const m = map[reviews];
  const tint = (v) =>
    m.color
      .replace(/^#/, "")
      .match(/.{2}/g)
      .map((h) => parseInt(h, 16))
      .join(",");
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.2,
        color: m.color,
        background: `rgba(${tint()},${m.bg})`,
        border: `1px solid rgba(${tint()},${m.br})`,
        padding: "2px 7px",
        borderRadius: 999,
        textTransform: "lowercase",
      }}
    >
      {m.label}
    </span>
  );
}

function PRRow({ pr, c, idx }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "10px 14px",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: hover ? c.surfaceHover : "transparent",
        borderLeft: pr.isMine
          ? `2px solid ${c.accentSoft}`
          : "2px solid transparent",
        cursor: "pointer",
        transition: "background 120ms ease",
        animation: `fadeSlide 320ms ${idx * 30}ms cubic-bezier(.2,.8,.2,1) both`,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: pr.authorColor,
          color: "#fff",
          fontSize: 10,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
          boxShadow: `0 0 0 2px ${c.surface}`,
        }}
      >
        {pr.author}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            color: c.textPrimary,
            fontWeight: 500,
            lineHeight: 1.35,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {pr.title}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              color: c.textTertiary,
              fontFamily:
                '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
              fontWeight: 500,
            }}
          >
            {pr.repo} #{pr.num}
          </span>
          <span style={{ color: c.textMuted, fontSize: 10 }}>·</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <StatusDot state={pr.state} c={c} />
            <span
              style={{
                fontSize: 10.5,
                color: c.textTertiary,
                fontFamily:
                  '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
              }}
            >
              {pr.checks.failed > 0
                ? `${pr.checks.failed} failing`
                : pr.checks.pending > 0
                  ? `${pr.checks.pending} running`
                  : `${pr.checks.passed} passed`}
            </span>
          </div>
          {pr.comments > 0 && (
            <>
              <span style={{ color: c.textMuted, fontSize: 10 }}>·</span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  color: c.textTertiary,
                }}
              >
                <MessageSquare size={10} strokeWidth={2.25} />
                <span style={{ fontSize: 10.5 }}>{pr.comments}</span>
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{ marginTop: 2 }}>
        <ReviewBadge reviews={pr.reviews} c={c} />
      </div>
    </div>
  );
}

export default function BorgDockTrayMockup() {
  const [open, setOpen] = useState(true);
  const [dark, setDark] = useState(true);
  const [time, setTime] = useState("12:10 PM");
  const flyoutRef = useRef(null);
  const trayRef = useRef(null);
  const c = dark ? palette.dark : palette.light;

  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      const h = d.getHours();
      const m = d.getMinutes().toString().padStart(2, "0");
      const ap = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      setTime(`${h12}:${m} ${ap}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const failing = prs.filter((p) => p.state === "failing").length;
  const pending = prs.filter((p) => p.state === "pending").length;
  const passing = prs.filter((p) => p.state === "passing").length;

  // Icon color reflects worst state
  const trayTint = failing > 0 ? c.red : pending > 0 ? c.yellow : c.accentSoft;
  const badgeBg = failing > 0 ? c.red : pending > 0 ? c.yellow : c.green;
  const badgeCount = prs.length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: dark
          ? `radial-gradient(ellipse 120% 80% at 20% 10%, #1e1b3a 0%, #0B0913 55%, #06050c 100%)`
          : `radial-gradient(ellipse 120% 80% at 20% 10%, #EDEAF4 0%, #E0DBED 55%, #D4CDE4 100%)`,
        padding: 0,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", sans-serif',
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes flyoutIn {
          0% { opacity: 0; transform: translateY(8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @keyframes iconBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>

      {/* Desktop chrome */}
      <div style={{ position: "absolute", top: 20, right: 24, display: "flex", gap: 8 }}>
        <button
          onClick={() => setDark(!dark)}
          style={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            color: c.textSecondary,
            padding: "8px 12px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
          {dark ? "Light" : "Dark"}
        </button>
      </div>

      {/* Faux desktop content hint */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: dark ? "rgba(237,234,244,0.12)" : "rgba(26,23,38,0.18)",
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: 0.3,
          textAlign: "center",
          userSelect: "none",
        }}
      >
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>
          your desktop
        </div>
        <div style={{ fontSize: 28, fontWeight: 300 }}>
          {failing > 0 ? "something's broken" : "all quiet"}
        </div>
        <div style={{ fontSize: 12, marginTop: 8 }}>
          click the tray icon below ↓
        </div>
      </div>

      {/* Flyout panel */}
      {open && (
        <div
          ref={flyoutRef}
          style={{
            position: "absolute",
            bottom: 56,
            right: 180,
            width: 380,
            background: c.surface,
            borderRadius: 14,
            border: `1px solid ${c.border}`,
            boxShadow: dark
              ? "0 20px 60px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)"
              : "0 20px 60px rgba(90,86,112,0.22), 0 2px 8px rgba(90,86,112,0.08)",
            overflow: "hidden",
            animation: "flyoutIn 220ms cubic-bezier(.2,.8,.2,1)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px 12px",
              borderBottom: `1px solid ${c.borderSubtle}`,
              background: `linear-gradient(135deg, ${c.surfaceRaised}, transparent)`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: `linear-gradient(135deg, ${c.accent}, ${c.accentSoft})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: `0 2px 8px ${c.accent}40`,
                  }}
                >
                  <GitPullRequest size={15} color="#fff" strokeWidth={2.5} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: c.textPrimary,
                      letterSpacing: -0.1,
                    }}
                  >
                    BorgDock
                  </div>
                  <div style={{ fontSize: 10.5, color: c.textTertiary, marginTop: 1 }}>
                    {prs.length} open pull requests
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "transparent",
                    border: "none",
                    color: c.textTertiary,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Open sidebar"
                >
                  <PanelRightOpen size={14} />
                </button>
                <button
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "transparent",
                    border: "none",
                    color: c.textTertiary,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Settings"
                >
                  <Settings size={14} />
                </button>
              </div>
            </div>

            {/* Stat strip */}
            <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: c.red,
                    animation: failing > 0 ? "pulse 1.8s ease-in-out infinite" : "none",
                    boxShadow: failing > 0 ? `0 0 8px ${c.red}` : "none",
                  }}
                />
                <span style={{ fontSize: 11, color: c.textSecondary, fontWeight: 600 }}>
                  {failing}
                </span>
                <span style={{ fontSize: 11, color: c.textTertiary }}>failing</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: c.yellow,
                  }}
                />
                <span style={{ fontSize: 11, color: c.textSecondary, fontWeight: 600 }}>
                  {pending}
                </span>
                <span style={{ fontSize: 11, color: c.textTertiary }}>running</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: c.green,
                  }}
                />
                <span style={{ fontSize: 11, color: c.textSecondary, fontWeight: 600 }}>
                  {passing}
                </span>
                <span style={{ fontSize: 11, color: c.textTertiary }}>passing</span>
              </div>
            </div>
          </div>

          {/* PR list */}
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {prs.map((pr, i) => (
              <PRRow key={pr.num} pr={pr} c={c} idx={i} />
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "8px 14px",
              borderTop: `1px solid ${c.borderSubtle}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: c.surfaceRaised,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: c.textMuted,
                fontFamily: '"Cascadia Code", Consolas, monospace',
              }}
            >
              synced 4s ago
            </span>
            <span
              style={{
                fontSize: 10,
                color: c.textMuted,
                fontFamily: '"Cascadia Code", Consolas, monospace',
              }}
            >
              Ctrl+Win+Shift+G
            </span>
          </div>

          {/* Triangle pointer */}
          <div
            style={{
              position: "absolute",
              bottom: -7,
              right: 72,
              width: 14,
              height: 14,
              background: c.surface,
              borderRight: `1px solid ${c.border}`,
              borderBottom: `1px solid ${c.border}`,
              transform: "rotate(45deg)",
            }}
          />
        </div>
      )}

      {/* Windows-like taskbar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 44,
          background: c.taskbar,
          backdropFilter: "blur(24px) saturate(140%)",
          borderTop: `1px solid ${c.borderSubtle}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
      >
        {/* Left: Start + pinned apps */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, justifyContent: "center" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: i === 0 ? c.surfaceHover : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: [
                    `linear-gradient(135deg, #0078d4, #00a2ed)`,
                    `linear-gradient(135deg, #f25022, #7fba00)`,
                    `linear-gradient(135deg, #7fba00, #ffb900)`,
                    `linear-gradient(135deg, #00a4ef, #0078d4)`,
                    `linear-gradient(135deg, #737373, #404040)`,
                  ][i],
                  opacity: 0.55,
                }}
              />
            </div>
          ))}
        </div>

        {/* Right: system tray */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            style={{
              background: "transparent",
              border: "none",
              padding: 4,
              color: c.textTertiary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Show hidden icons"
          >
            <ChevronUp size={14} />
          </button>

          {/* BorgDock tray icon — the star of the show */}
          <button
            ref={trayRef}
            onClick={() => setOpen(!open)}
            style={{
              position: "relative",
              width: 32,
              height: 32,
              borderRadius: 6,
              background: open ? c.surfaceHover : "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 140ms ease",
            }}
            title={`BorgDock — ${failing} failing, ${pending} running`}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: `linear-gradient(135deg, ${c.accent}, ${c.accentSoft})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 1px 4px ${c.accent}60, inset 0 1px 0 rgba(255,255,255,0.15)`,
                animation: failing > 0 ? "iconBreathe 2.4s ease-in-out infinite" : "none",
              }}
            >
              <Activity size={13} color="#fff" strokeWidth={2.75} />
            </div>

            {/* Status dot overlay (bottom-right of icon) */}
            <div
              style={{
                position: "absolute",
                bottom: 4,
                right: 4,
                minWidth: 12,
                height: 12,
                padding: "0 3px",
                borderRadius: 999,
                background: badgeBg,
                color: "#fff",
                fontSize: 8.5,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1.5px solid ${dark ? "#0B0913" : "#EDEAF4"}`,
                boxShadow: `0 0 6px ${badgeBg}80`,
                lineHeight: 1,
                animation: failing > 0 ? "pulse 1.8s ease-in-out infinite" : "none",
              }}
            >
              {badgeCount}
            </div>
          </button>

          {/* Other tray icons */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: c.textTertiary }}>
            <Cloud size={15} />
            <Wifi size={15} />
            <Volume2 size={15} />
            <BatteryCharging size={15} />
          </div>

          {/* Clock */}
          <div
            style={{
              color: c.textSecondary,
              fontSize: 11,
              lineHeight: 1.15,
              textAlign: "right",
              fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif',
              paddingLeft: 6,
            }}
          >
            <div>{time}</div>
            <div style={{ fontSize: 10.5 }}>4/13/2026</div>
          </div>
        </div>
      </div>

      {/* Hint tooltip when closed */}
      {!open && (
        <div
          style={{
            position: "absolute",
            bottom: 56,
            right: 178,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 11.5,
            color: c.textSecondary,
            boxShadow: dark
              ? "0 4px 16px rgba(0,0,0,0.4)"
              : "0 4px 16px rgba(90,86,112,0.15)",
            animation: "fadeSlide 200ms ease",
            maxWidth: 220,
          }}
        >
          <div style={{ fontWeight: 600, color: c.textPrimary, marginBottom: 2 }}>
            BorgDock
          </div>
          <div style={{ color: c.textTertiary, fontSize: 10.5 }}>
            {failing} failing · {pending} running · {passing} passing
          </div>
        </div>
      )}
    </div>
  );
}
