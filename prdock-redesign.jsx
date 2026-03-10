import { useState, useEffect, useRef, createContext, useContext } from "react";

const FONT_LINK = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap";

// ─── Theme System ───
const themes = {
  dark: {
    bg: "#0A0C14", bgPanel: "#0D0F17", bgCard: "rgba(139,143,163,0.02)",
    bgCardHover: "rgba(139,143,163,0.03)", bgSelected: "rgba(99,179,237,0.04)",
    bgInput: "rgba(139,143,163,0.04)", bgSubtle: "rgba(139,143,163,0.06)",
    bgStatusBar: "rgba(13,15,23,0.6)", bgOverlay: "rgba(0,0,0,0.65)",
    bgModal: "#12141E", bgExpanded: "rgba(139,143,163,0.018)",
    borderBase: "rgba(139,143,163,0.06)", borderInput: "rgba(139,143,163,0.08)",
    borderAccent: "rgba(99,179,237,0.2)", borderCard: "rgba(139,143,163,0.06)",
    borderModal: "rgba(139,143,163,0.1)",
    textPrimary: "#E2E4EA", textSecondary: "#C0C4D4", textTertiary: "#8B8FA3",
    textMuted: "#5A5E6A", textFaint: "#4A4E5A", textGhost: "#3A3E4A",
    accent: "#63B3ED", accentSoft: "rgba(99,179,237,0.08)", accentBorder: "rgba(99,179,237,0.2)",
    green: "#34D399", greenSoft: "rgba(52,211,153,0.1)", greenBorder: "rgba(52,211,153,0.25)",
    greenGlow: "0 0 6px rgba(52,211,153,0.3)",
    red: "#F87171", redSoft: "rgba(248,113,113,0.1)", redBorder: "rgba(248,113,113,0.2)",
    redGlow: "0 0 8px rgba(248,113,113,0.5)",
    yellow: "#FBBF24", yellowSoft: "rgba(251,191,36,0.1)", yellowBorder: "rgba(251,191,36,0.12)",
    purple: "#A78BFA", purpleSoft: "rgba(167,139,250,0.08)", purpleBorder: "rgba(167,139,250,0.2)",
    avatarText: "#0D0F17", scrollThumb: "rgba(139,143,163,0.12)", scrollHover: "rgba(139,143,163,0.2)",
    selection: "rgba(99,179,237,0.2)",
    badgeDraftBg: "rgba(139,143,163,0.08)", badgeDraftCol: "#6B6F80", badgeDraftBor: "rgba(139,143,163,0.25)",
    checkPassedBg: "rgba(52,211,153,0.02)", checkPassedBor: "rgba(52,211,153,0.06)",
    checkFailedBg: "rgba(248,113,113,0.04)", checkFailedBor: "rgba(248,113,113,0.1)",
    branchBg: "rgba(99,179,237,0.08)", branchBorder: "rgba(99,179,237,0.15)",
    targetBg: "rgba(139,143,163,0.06)", targetBorder: "rgba(139,143,163,0.1)",
    gradient: "linear-gradient(135deg, #63B3ED, #A78BFA)",
    titleBarBg: "rgba(13,15,23,0.8)", logoText: "#0A0C14",
    modalShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 1px rgba(139,143,163,0.15)",
  },
  light: {
    bg: "#F4F5F7", bgPanel: "#FFFFFF", bgCard: "rgba(0,0,0,0.018)",
    bgCardHover: "rgba(0,0,0,0.03)", bgSelected: "rgba(37,99,235,0.045)",
    bgInput: "#FFFFFF", bgSubtle: "rgba(0,0,0,0.04)",
    bgStatusBar: "rgba(255,255,255,0.88)", bgOverlay: "rgba(0,0,0,0.35)",
    bgModal: "#FFFFFF", bgExpanded: "rgba(0,0,0,0.012)",
    borderBase: "rgba(0,0,0,0.07)", borderInput: "rgba(0,0,0,0.12)",
    borderAccent: "rgba(37,99,235,0.25)", borderCard: "rgba(0,0,0,0.06)",
    borderModal: "rgba(0,0,0,0.08)",
    textPrimary: "#1A1D26", textSecondary: "#2E3342", textTertiary: "#5A5F72",
    textMuted: "#7A7F92", textFaint: "#9298AA", textGhost: "#B8BCC8",
    accent: "#2563EB", accentSoft: "rgba(37,99,235,0.06)", accentBorder: "rgba(37,99,235,0.2)",
    green: "#16A34A", greenSoft: "rgba(22,163,74,0.07)", greenBorder: "rgba(22,163,74,0.18)",
    greenGlow: "0 0 4px rgba(22,163,74,0.12)",
    red: "#DC2626", redSoft: "rgba(220,38,38,0.06)", redBorder: "rgba(220,38,38,0.14)",
    redGlow: "0 0 6px rgba(220,38,38,0.15)",
    yellow: "#B45309", yellowSoft: "rgba(180,83,9,0.06)", yellowBorder: "rgba(180,83,9,0.14)",
    purple: "#7C3AED", purpleSoft: "rgba(124,58,237,0.06)", purpleBorder: "rgba(124,58,237,0.14)",
    avatarText: "#FFFFFF", scrollThumb: "rgba(0,0,0,0.1)", scrollHover: "rgba(0,0,0,0.18)",
    selection: "rgba(37,99,235,0.14)",
    badgeDraftBg: "rgba(0,0,0,0.04)", badgeDraftCol: "#7A7F92", badgeDraftBor: "rgba(0,0,0,0.14)",
    checkPassedBg: "rgba(22,163,74,0.03)", checkPassedBor: "rgba(22,163,74,0.1)",
    checkFailedBg: "rgba(220,38,38,0.03)", checkFailedBor: "rgba(220,38,38,0.1)",
    branchBg: "rgba(37,99,235,0.06)", branchBorder: "rgba(37,99,235,0.14)",
    targetBg: "rgba(0,0,0,0.03)", targetBorder: "rgba(0,0,0,0.08)",
    gradient: "linear-gradient(135deg, #2563EB, #7C3AED)",
    titleBarBg: "rgba(255,255,255,0.88)", logoText: "#FFFFFF",
    modalShadow: "0 24px 80px rgba(0,0,0,0.18), 0 0 1px rgba(0,0,0,0.1)",
  },
};

const ThemeContext = createContext(themes.dark);
const useTheme = () => useContext(ThemeContext);

// ─── Mock Data ───
const MOCK_PRS = [
  {
    id: 515, title: "refactor(portal): migrate pages to useSuspenseQuery",
    author: "borght-dev", authorAvatar: "KB",
    branch: "refactor/suspense-query-migration", target: "chore/modernize-tooling",
    status: "failing", draft: false, labels: ["refactor", "portal"],
    createdAt: "3m ago", updatedAt: "2m ago", filesChanged: 30, additions: 808, deletions: 992, commits: 3,
    checks: { passed: 8, failed: 2, total: 10, items: [
      { name: "Build & Unit Tests", status: "failed", duration: "4m 12s" },
      { name: "Coverage Gate", status: "failed", duration: "1m 03s" },
      { name: "TypeScript Check", status: "passed", duration: "2m 31s" },
      { name: "Lint", status: "passed", duration: "0m 45s" },
      { name: "E2E Smoke", status: "passed", duration: "6m 22s" },
      { name: "Security Scan", status: "passed", duration: "1m 11s" },
      { name: "Docker Build", status: "passed", duration: "3m 05s" },
      { name: "Storybook", status: "passed", duration: "2m 44s" },
    ]},
    reviews: [
      { author: "SCheng", status: "commented", avatar: "SC", comment: "Well-scoped migration. One suggestion on the boundary pattern." },
      { author: "cdashiell", status: "approved", avatar: "CD", comment: "LGTM! Clean refactor." },
    ],
    description: "Migrates 22 page components from useQuery with manual isLoading/isError checks to useSuspenseQuery with PageSuspenseBoundary. Splits each page into wrapper (boundary) + content component pattern.",
    mergeReady: false, conflicts: false, comments: 6,
    aiReview: { suggestion: 1, praise: 1, other: 1 },
  },
  {
    id: 518, title: "fix(order): align Save & Plan buttons with legacy portal behavior",
    author: "borght-dev", authorAvatar: "KB",
    branch: "fix/order-save-plan-buttons", target: "main",
    status: "failing", draft: false, labels: ["fix", "orders"],
    createdAt: "6m ago", updatedAt: "5m ago", filesChanged: 4, additions: 45, deletions: 12, commits: 1,
    checks: { passed: 7, failed: 3, total: 10, items: [
      { name: "Build & Unit Tests", status: "failed", duration: "3m 58s" },
      { name: "Coverage Gate", status: "failed", duration: "1m 01s" },
      { name: "Integration Tests", status: "failed", duration: "5m 33s" },
      { name: "TypeScript Check", status: "passed", duration: "2m 12s" },
      { name: "Lint", status: "passed", duration: "0m 41s" },
    ]},
    reviews: [],
    description: "Aligns the Save and Plan button behavior in the Order workspace with the legacy Portal to ensure backwards compatibility during the migration period.",
    mergeReady: false, conflicts: false, comments: 0, aiReview: null,
  },
  {
    id: 514, title: "chore: modernize tooling (oxlint, tailwind v4, vitest 3, ef core 10, bun, error boundaries)",
    author: "borght-dev", authorAvatar: "KB",
    branch: "chore/modernize-tooling", target: "main",
    status: "failing", draft: false, labels: ["chore", "tooling", "dependencies"],
    createdAt: "13m ago", updatedAt: "10m ago", filesChanged: 52, additions: 1240, deletions: 890, commits: 8,
    checks: { passed: 6, failed: 4, total: 10, items: [
      { name: "Build & Unit Tests", status: "failed", duration: "4m 55s" },
      { name: "Coverage Gate", status: "failed", duration: "1m 12s" },
      { name: "E2E Smoke", status: "failed", duration: "7m 01s" },
      { name: "Docker Build", status: "failed", duration: "3m 44s" },
    ]},
    reviews: [
      { author: "TvanBeek", status: "changes_requested", avatar: "TB", comment: "Need to update the Docker base image too." },
    ],
    description: "Major tooling upgrade: migrates from ESLint to oxlint, Tailwind v3 to v4, Vitest 2 to 3, EF Core 9 to 10, adds Bun for frontend builds, and implements React error boundaries.",
    mergeReady: false, conflicts: true, comments: 4,
    aiReview: { suggestion: 3, praise: 0, other: 2 },
  },
  {
    id: 511, title: "feat(orders): rewrite Split Order + add Divide Project",
    author: "borght-dev", authorAvatar: "KB",
    branch: "feat/split-order-divide-project", target: "main",
    status: "passing", draft: false, labels: ["feature", "orders"],
    createdAt: "14h ago", updatedAt: "2h ago", filesChanged: 18, additions: 620, deletions: 180, commits: 5,
    checks: { passed: 10, failed: 0, total: 10, items: [] },
    reviews: [
      { author: "SCheng", status: "approved", avatar: "SC", comment: "Excellent implementation." },
      { author: "cdashiell", status: "approved", avatar: "CD", comment: "Approved!" },
    ],
    description: "Complete rewrite of the Split Order functionality with a new Divide Project feature. Implements drag-and-drop line item assignment.",
    mergeReady: true, conflicts: false, comments: 8,
    aiReview: { suggestion: 0, praise: 3, other: 0 },
  },
  {
    id: 512, title: "feat: in-app help system with guided tours and onboarding",
    author: "borght-dev", authorAvatar: "KB",
    branch: "feat/in-app-help", target: "main",
    status: "passing", draft: true, labels: ["feature", "ux"],
    createdAt: "14h ago", updatedAt: "6h ago", filesChanged: 12, additions: 480, deletions: 20, commits: 4,
    checks: { passed: 10, failed: 0, total: 10, items: [] },
    reviews: [],
    description: "Adds an in-app help system with guided tours for new users and contextual help tooltips throughout the application.",
    mergeReady: false, conflicts: false, comments: 2, aiReview: null,
  },
  {
    id: 516, title: "fix: shared GridToolbar, export translations, agenda sort, Docker NTLM",
    author: "SCheng_example", authorAvatar: "SC",
    branch: "fix/grid-toolbar-exports", target: "main",
    status: "passing", draft: false, labels: ["fix", "grid"],
    createdAt: "4m ago", updatedAt: "3m ago", filesChanged: 8, additions: 120, deletions: 65, commits: 2,
    checks: { passed: 10, failed: 0, total: 10, items: [] },
    reviews: [{ author: "KvanderBorght", status: "approved", avatar: "KB", comment: "Clean fix." }],
    description: "Fixes shared GridToolbar component, export translations, agenda sort order, and Docker NTLM authentication issues.",
    mergeReady: true, conflicts: false, comments: 3, aiReview: null,
  },
  {
    id: 505, title: "feat(planboard): multi-order planning panel with sequential scheduling AB#51687",
    author: "TvanBeek_example", authorAvatar: "TB",
    branch: "feat/multi-order-planning", target: "main",
    status: "passing", draft: false, labels: ["feature", "planboard"],
    createdAt: "6m ago", updatedAt: "4m ago", filesChanged: 22, additions: 890, deletions: 120, commits: 7,
    checks: { passed: 10, failed: 0, total: 10, items: [] },
    reviews: [{ author: "KvanderBorght", status: "commented", avatar: "KB", comment: "Looks good, minor nit on the scheduling logic." }],
    description: "Implements multi-order planning panel allowing sequential scheduling of multiple orders for a single engineer.",
    mergeReady: false, conflicts: false, comments: 5,
    aiReview: { suggestion: 2, praise: 1, other: 0 },
  },
  {
    id: 513, title: "feat(auth): extract OAuth into standalone FSP.Auth.Api service",
    author: "cdashiell_example", authorAvatar: "CD",
    branch: "feat/auth-service-extraction", target: "main",
    status: "passing", draft: false, labels: ["feature", "auth", "architecture"],
    createdAt: "6h ago", updatedAt: "3h ago", filesChanged: 35, additions: 1100, deletions: 450, commits: 6,
    checks: { passed: 10, failed: 0, total: 10, items: [] },
    reviews: [
      { author: "KvanderBorght", status: "approved", avatar: "KB", comment: "Great extraction, clean separation." },
      { author: "TvanBeek", status: "approved", avatar: "TB", comment: "LGTM" },
    ],
    description: "Extracts OAuth authentication logic into a standalone FSP.Auth.Api microservice with its own deployment pipeline.",
    mergeReady: true, conflicts: false, comments: 4,
    aiReview: { suggestion: 1, praise: 2, other: 0 },
  },
  {
    id: 244, title: "feat(auth): separate auth domain with nginx redirect",
    author: "cdashiell_example", authorAvatar: "CD",
    branch: "feat/auth-domain-nginx", target: "main",
    status: "passing", draft: false, labels: ["feature", "auth", "infra"],
    createdAt: "4d ago", updatedAt: "2d ago", filesChanged: 6, additions: 85, deletions: 10, commits: 2,
    checks: { passed: 10, failed: 0, total: 10, items: [] },
    reviews: [{ author: "SCheng", status: "changes_requested", avatar: "SC", comment: "Need SSL cert config for the new domain." }],
    description: "Configures nginx to redirect authentication requests to a separate auth domain for improved security isolation.",
    mergeReady: false, conflicts: false, comments: 3, aiReview: null,
  },
];

// ─── Primitives ───
const StatusDot = ({ status, size = 8 }) => {
  const t = useTheme();
  const colors = { passing: t.green, failing: t.red, pending: t.yellow, draft: t.textMuted };
  const glows = { failing: t.redGlow, passing: t.greenGlow };
  return <span style={{ width: size, height: size, borderRadius: "50%", background: colors[status] || colors.pending, display: "inline-block", flexShrink: 0, boxShadow: glows[status] || "none" }} />;
};

const Badge = ({ children, variant = "default", size = "sm" }) => {
  const t = useTheme();
  const s = {
    default: { bg: t.bgSubtle, color: t.textTertiary, border: `1px solid ${t.borderBase}` },
    feature: { bg: t.accentSoft, color: t.accent, border: `1px solid ${t.accentBorder}` },
    fix: { bg: t.redSoft, color: t.red, border: `1px solid ${t.redBorder}` },
    refactor: { bg: t.purpleSoft, color: t.purple, border: `1px solid ${t.purpleBorder}` },
    chore: { bg: t.yellowSoft, color: t.yellow, border: `1px solid ${t.yellowBorder}` },
    merge: { bg: t.greenSoft, color: t.green, border: `1px solid ${t.greenBorder}` },
    conflict: { bg: t.redSoft, color: t.red, border: `1px solid ${t.redBorder}` },
    draft: { bg: t.badgeDraftBg, color: t.badgeDraftCol, border: `1px dashed ${t.badgeDraftBor}` },
  }[variant] || { bg: t.bgSubtle, color: t.textTertiary, border: `1px solid ${t.borderBase}` };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: size === "sm" ? "2px 8px" : "3px 10px", fontSize: size === "sm" ? 11 : 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, letterSpacing: "0.02em", borderRadius: 4, background: s.bg, color: s.color, border: s.border, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
};

const Avatar = ({ initials, size = 28 }) => {
  const t = useTheme();
  const isDark = t.bg === "#0A0C14";
  const colors = isDark ? { KB: "#63B3ED", SC: "#F6AD55", CD: "#A78BFA", TB: "#68D391" } : { KB: "#2563EB", SC: "#D97706", CD: "#7C3AED", TB: "#16A34A" };
  const bg = colors[initials] || t.textTertiary;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: isDark ? `linear-gradient(135deg, ${bg}, ${bg}99)` : bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 600, color: t.avatarText, fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0, boxShadow: isDark ? "none" : "0 1px 2px rgba(0,0,0,0.08)" }}>
      {initials}
    </div>
  );
};

const ProgressBar = ({ passed, total }) => {
  const t = useTheme();
  const pct = total > 0 ? (passed / total) * 100 : 0;
  const ok = passed === total;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: t.bgSubtle, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: ok ? t.green : t.red, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: ok ? t.green : t.red, whiteSpace: "nowrap" }}>{passed}/{total}</span>
    </div>
  );
};

const ReviewIcon = ({ status }) => {
  const t = useTheme();
  if (status === "approved") return <span style={{ color: t.green, fontSize: 13 }}>✓</span>;
  if (status === "changes_requested") return <span style={{ color: t.red, fontSize: 13 }}>✗</span>;
  return <span style={{ color: t.yellow, fontSize: 13 }}>◉</span>;
};

const getLabelVariant = (l) => {
  if (["feature", "feat"].includes(l)) return "feature";
  if (["fix", "bugfix", "hotfix"].includes(l)) return "fix";
  if (l === "refactor") return "refactor";
  if (["chore", "tooling", "dependencies"].includes(l)) return "chore";
  return "default";
};

const getMergeScore = (pr) => {
  let s = 0;
  if (pr.status === "passing") s += 40;
  if (pr.reviews.some(r => r.status === "approved")) s += 25;
  if (pr.reviews.filter(r => r.status === "approved").length >= 2) s += 10;
  if (!pr.conflicts) s += 15;
  if (!pr.draft) s += 10;
  return Math.min(s, 100);
};

const MergeScore = ({ pr, size = 38 }) => {
  const t = useTheme();
  const score = getMergeScore(pr);
  const color = score >= 80 ? t.green : score >= 50 ? t.yellow : t.red;
  const r = size * 0.368;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.bgSubtle} strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.26, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color }}>{score}</span>
    </div>
  );
};

const ActionButton = ({ children, primary, accent, subtle, small, onClick }) => {
  const t = useTheme();
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: small ? "5px 10px" : "7px 14px", borderRadius: 6,
      fontSize: small ? 11 : 12, fontWeight: 600,
      fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: "pointer",
      border: primary ? `1px solid ${t.greenBorder}` : accent ? `1px solid ${t.purpleBorder}` : subtle ? `1px solid ${t.borderBase}` : `1px solid ${t.accentBorder}`,
      background: primary ? t.greenSoft : accent ? t.purpleSoft : "transparent",
      color: primary ? t.green : accent ? t.purple : subtle ? t.textMuted : t.accent,
      transition: "all 0.15s ease", whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
};

const ReadinessRow = ({ ok, label, detail }) => {
  const t = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: ok ? t.green : t.red, fontSize: 13, width: 16, textAlign: "center" }}>{ok ? "✓" : "✗"}</span>
      <span style={{ color: t.textSecondary, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>{label}</span>
      <span style={{ color: t.textFaint, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{detail}</span>
    </div>
  );
};

const SectionCard = ({ title, children }) => {
  const t = useTheme();
  return (
    <div style={{ padding: "14px 16px", borderRadius: 8, background: t.bgCard, border: `1px solid ${t.borderCard}` }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, fontFamily: "'Plus Jakarta Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>{title}</h3>
      {children}
    </div>
  );
};

const ThemeToggle = ({ isDark, onToggle }) => {
  const t = useTheme();
  return (
    <button onClick={onToggle} title={isDark ? "Light theme" : "Dark theme"} style={{
      width: 50, height: 26, borderRadius: 13, border: `1px solid ${t.borderInput}`,
      background: isDark ? "rgba(99,179,237,0.12)" : "rgba(37,99,235,0.08)",
      cursor: "pointer", position: "relative", display: "flex", alignItems: "center", padding: "0 3px",
      transition: "all 0.3s ease",
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%", background: isDark ? "#63B3ED" : "#2563EB",
        transform: isDark ? "translateX(0px)" : "translateX(23px)",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }}>
        {isDark ? "🌙" : "☀️"}
      </div>
    </button>
  );
};


// ─── Expanded Row Content (inline preview) ───
const ExpandedContent = ({ pr, onOpenModal }) => {
  const t = useTheme();
  const approvals = pr.reviews.filter(r => r.status === "approved").length;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        padding: "14px 18px 16px 70px",
        background: t.bgExpanded,
        borderBottom: `1px solid ${t.borderBase}`,
        animation: "expandIn 0.2s ease-out",
      }}
    >
      {/* Top row: branch + quick stats */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", flexWrap: "wrap" }}>
        <span style={{ padding: "2px 7px", borderRadius: 4, background: t.branchBg, color: t.accent, border: `1px solid ${t.branchBorder}`, fontSize: 11 }}>{pr.branch}</span>
        <span style={{ color: t.textGhost }}>→</span>
        <span style={{ padding: "2px 7px", borderRadius: 4, background: t.targetBg, color: t.textTertiary, border: `1px solid ${t.targetBorder}`, fontSize: 11 }}>{pr.target}</span>
        <span style={{ color: t.textGhost, margin: "0 4px" }}>·</span>
        <span style={{ color: t.textFaint, fontSize: 11 }}>{pr.commits} commit{pr.commits !== 1 ? "s" : ""}</span>
        <span style={{ color: t.textGhost }}>·</span>
        <span style={{ fontSize: 11 }}><span style={{ color: t.green }}>+{pr.additions}</span> <span style={{ color: t.textGhost }}>/</span> <span style={{ color: t.red }}>-{pr.deletions}</span></span>
        <span style={{ color: t.textGhost }}>·</span>
        <span style={{ color: t.textFaint, fontSize: 11 }}>{pr.filesChanged} files</span>
      </div>

      {/* Description */}
      <p style={{ fontSize: 12.5, color: t.textTertiary, lineHeight: 1.55, fontFamily: "'Plus Jakarta Sans', sans-serif", margin: "0 0 14px", maxWidth: 700 }}>
        {pr.description}
      </p>

      {/* Checks + Reviews summary */}
      <div style={{ display: "flex", gap: 24, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Checks</div>
          <div style={{ width: 140 }}><ProgressBar passed={pr.checks.passed} total={pr.checks.total} /></div>
          {pr.checks.items.filter(c => c.status === "failed").length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
              {pr.checks.items.filter(c => c.status === "failed").map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.red }}>
                  <StatusDot status="failing" size={6} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Reviews</div>
          {pr.reviews.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {pr.reviews.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <Avatar initials={r.avatar} size={20} />
                  <span style={{ color: t.textSecondary, fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500 }}>{r.author}</span>
                  <ReviewIcon status={r.status} />
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 11, color: t.textGhost, fontStyle: "italic" }}>No reviews yet</span>
          )}
        </div>

        {pr.aiReview && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>AI Review</div>
            <div style={{ display: "flex", gap: 8 }}>
              {pr.aiReview.suggestion > 0 && <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: t.yellow }}>{pr.aiReview.suggestion} suggestion{pr.aiReview.suggestion > 1 ? "s" : ""}</span>}
              {pr.aiReview.praise > 0 && <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: t.green }}>{pr.aiReview.praise} praise</span>}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {pr.mergeReady && <ActionButton primary small><span style={{ fontSize: 12 }}>⛙</span> Merge</ActionButton>}
        {pr.status === "failing" && (
          <>
            <ActionButton small>↻ Re-run Checks</ActionButton>
            <ActionButton accent small><span style={{ fontSize: 10 }}>✦</span> Fix with Claude</ActionButton>
          </>
        )}
        <ActionButton subtle small onClick={() => onOpenModal(pr)}>Details →</ActionButton>
        <ActionButton subtle small><span style={{ fontSize: 11 }}>↗</span> Open in GitHub</ActionButton>
      </div>
    </div>
  );
};


// ─── PR Row ───
const PRRow = ({ pr, isExpanded, onToggle, onOpenModal }) => {
  const t = useTheme();
  return (
    <div>
      <div
        onClick={() => onToggle(pr.id)}
        style={{
          display: "grid", gridTemplateColumns: "38px 1fr auto", gap: 14,
          padding: "13px 18px", cursor: "pointer",
          background: isExpanded ? t.bgSelected : "transparent",
          borderLeft: isExpanded ? `2px solid ${t.accent}` : "2px solid transparent",
          transition: "all 0.15s ease",
          borderBottom: isExpanded ? "none" : `1px solid ${t.borderBase}`,
          opacity: pr.draft ? 0.65 : 1,
        }}
        onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = t.bgCardHover; }}
        onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = isExpanded ? t.bgSelected : "transparent"; }}
      >
        <MergeScore pr={pr} />
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <StatusDot status={pr.draft ? "draft" : pr.status} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: t.textFaint, fontWeight: 500, flexShrink: 0 }}>#{pr.id}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: t.textPrimary, fontFamily: "'Plus Jakarta Sans', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</span>
            <span style={{
              fontSize: 10, color: t.textGhost, flexShrink: 0, transition: "transform 0.2s ease",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              marginLeft: 4,
            }}>▾</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {pr.draft && <Badge variant="draft">draft</Badge>}
            {pr.labels.slice(0, 3).map(l => <Badge key={l} variant={getLabelVariant(l)}>{l}</Badge>)}
            {pr.conflicts && <Badge variant="conflict">⚡ conflicts</Badge>}
            {pr.mergeReady && <Badge variant="merge">✓ ready</Badge>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5, color: t.textMuted }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Avatar initials={pr.authorAvatar} size={18} />
              <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{pr.author.split("_")[0]}</span>
            </div>
            <span style={{ color: t.textGhost }}>·</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: t.textFaint }}>{pr.createdAt}</span>
            <span style={{ color: t.textGhost }}>·</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
              <span style={{ color: t.green }}>+{pr.additions}</span>
              <span style={{ color: t.textGhost }}> / </span>
              <span style={{ color: t.red }}>-{pr.deletions}</span>
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, minWidth: 110 }}>
          <div style={{ width: 100 }}><ProgressBar passed={pr.checks.passed} total={pr.checks.total} /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {pr.reviews.length > 0 ? pr.reviews.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Avatar initials={r.avatar} size={18} />
                <ReviewIcon status={r.status} />
              </div>
            )) : <span style={{ fontSize: 11, color: t.textGhost, fontStyle: "italic" }}>no reviews</span>}
          </div>
          {pr.comments > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: t.textMuted }}>
              <span style={{ fontSize: 12 }}>💬</span> {pr.comments}
            </div>
          )}
        </div>
      </div>
      {isExpanded && <ExpandedContent pr={pr} onOpenModal={onOpenModal} />}
    </div>
  );
};


// ─── Detail Modal ───
const DetailModal = ({ pr, onClose }) => {
  const t = useTheme();
  const [activeTab, setActiveTab] = useState("overview");
  const approvals = pr.reviews.filter(r => r.status === "approved").length;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "checks", label: `Checks (${pr.checks.passed}/${pr.checks.total})` },
    { id: "reviews", label: `Reviews (${pr.reviews.length})` },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: t.bgOverlay, backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 680, maxHeight: "85vh",
          background: t.bgModal, borderRadius: 14,
          border: `1px solid ${t.borderModal}`,
          boxShadow: t.modalShadow,
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${t.borderBase}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <StatusDot status={pr.draft ? "draft" : pr.status} size={10} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: t.textMuted, fontWeight: 500 }}>#{pr.id}</span>
                {pr.draft && <Badge variant="draft">draft</Badge>}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: t.textPrimary, fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0, lineHeight: 1.4 }}>{pr.title}</h2>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 6, border: `1px solid ${t.borderBase}`,
              background: t.bgSubtle, color: t.textTertiary, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              transition: "all 0.15s ease", flexShrink: 0,
            }}>✕</button>
          </div>

          {/* Branch */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            <span style={{ padding: "3px 8px", borderRadius: 4, background: t.branchBg, color: t.accent, border: `1px solid ${t.branchBorder}` }}>{pr.branch}</span>
            <span style={{ color: t.textGhost }}>→</span>
            <span style={{ padding: "3px 8px", borderRadius: 4, background: t.targetBg, color: t.textTertiary, border: `1px solid ${t.targetBorder}` }}>{pr.target}</span>
          </div>

          {/* Stats row */}
          <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12 }}>
            {[
              { label: "Files", value: pr.filesChanged },
              { label: "Commits", value: pr.commits },
              { label: "Added", value: `+${pr.additions}`, color: t.green },
              { label: "Removed", value: `-${pr.deletions}`, color: t.red },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: t.textFaint, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11 }}>{s.label}</span>
                <span style={{ fontWeight: 600, color: s.color || t.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {pr.mergeReady && <ActionButton primary><span style={{ fontSize: 13 }}>⛙</span> Merge PR</ActionButton>}
            {pr.status === "failing" && (
              <>
                <ActionButton>↻ Re-run Checks</ActionButton>
                <ActionButton accent><span style={{ fontSize: 11 }}>✦</span> Fix with Claude</ActionButton>
              </>
            )}
            <ActionButton subtle><span style={{ fontSize: 12 }}>↗</span> Open in GitHub</ActionButton>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${t.borderBase}`, padding: "0 24px", flexShrink: 0 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: "10px 14px", fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? t.textPrimary : t.textMuted,
              background: "none", border: "none",
              borderBottom: activeTab === tab.id ? `2px solid ${t.accent}` : "2px solid transparent",
              cursor: "pointer", transition: "all 0.15s ease",
            }}>{tab.label}</button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "18px 24px 24px" }}>
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SectionCard title="Merge Readiness">
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <MergeScore pr={pr} size={48} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                    <ReadinessRow ok={pr.status === "passing"} label="CI Checks" detail={`${pr.checks.passed}/${pr.checks.total} passing`} />
                    <ReadinessRow ok={approvals >= 1} label="Approvals" detail={`${approvals} approval${approvals !== 1 ? "s" : ""}`} />
                    <ReadinessRow ok={!pr.conflicts} label="No Conflicts" detail={pr.conflicts ? "Has merge conflicts" : "Clean merge"} />
                    <ReadinessRow ok={!pr.draft} label="Not Draft" detail={pr.draft ? "Still in draft" : "Ready for review"} />
                  </div>
                </div>
              </SectionCard>
              <SectionCard title="Description">
                <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.65, fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0 }}>{pr.description}</p>
              </SectionCard>
              {pr.aiReview && (
                <SectionCard title="AI Review Summary">
                  <div style={{ display: "flex", gap: 12 }}>
                    {pr.aiReview.suggestion > 0 && (
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: t.yellowSoft, border: `1px solid ${t.yellowBorder}`, flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: t.yellow, fontFamily: "'JetBrains Mono', monospace" }}>{pr.aiReview.suggestion}</div>
                        <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>Suggestions</div>
                      </div>
                    )}
                    {pr.aiReview.praise > 0 && (
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: t.greenSoft, border: `1px solid ${t.greenBorder}`, flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: t.green, fontFamily: "'JetBrains Mono', monospace" }}>{pr.aiReview.praise}</div>
                        <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>Praise</div>
                      </div>
                    )}
                    {pr.aiReview.other > 0 && (
                      <div style={{ padding: "8px 12px", borderRadius: 6, background: t.bgSubtle, border: `1px solid ${t.borderBase}`, flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: t.textTertiary, fontFamily: "'JetBrains Mono', monospace" }}>{pr.aiReview.other}</div>
                        <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 2 }}>Other</div>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}
              <SectionCard title="Labels">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {pr.labels.map(l => <Badge key={l} variant={getLabelVariant(l)} size="md">{l}</Badge>)}
                </div>
              </SectionCard>
            </div>
          )}

          {activeTab === "checks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pr.checks.items.length > 0 ? pr.checks.items.map((check, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderRadius: 6,
                  background: check.status === "failed" ? t.checkFailedBg : t.checkPassedBg,
                  border: `1px solid ${check.status === "failed" ? t.checkFailedBor : t.checkPassedBor}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StatusDot status={check.status === "failed" ? "failing" : "passing"} />
                    <span style={{ fontSize: 13, color: t.textSecondary, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{check.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: t.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{check.duration}</span>
                    {check.status === "failed" && (
                      <button style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: t.redSoft, color: t.red, border: `1px solid ${t.redBorder}`, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}>Re-run</button>
                    )}
                  </div>
                </div>
              )) : (
                <div style={{ padding: 20, textAlign: "center", color: t.green, fontSize: 13 }}>✓ All {pr.checks.total} checks passing</div>
              )}
            </div>
          )}

          {activeTab === "reviews" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pr.reviews.length > 0 ? pr.reviews.map((review, i) => (
                <div key={i} style={{ padding: "14px 16px", borderRadius: 8, background: t.bgCard, border: `1px solid ${t.borderCard}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <Avatar initials={review.avatar} size={24} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.textSecondary, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{review.author}</span>
                    <Badge variant={review.status === "approved" ? "merge" : review.status === "changes_requested" ? "conflict" : "default"}>
                      {review.status === "approved" ? "approved" : review.status === "changes_requested" ? "changes requested" : "commented"}
                    </Badge>
                  </div>
                  <p style={{ fontSize: 12.5, color: t.textTertiary, margin: 0, lineHeight: 1.5, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{review.comment}</p>
                </div>
              )) : (
                <div style={{ padding: 24, textAlign: "center", color: t.textGhost, fontSize: 13 }}>No reviews yet</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ─── Main App ───
export default function PRDock() {
  const [isDark, setIsDark] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [modalPR, setModalPR] = useState(null);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const theme = isDark ? themes.dark : themes.light;
  const myUsername = "borght-dev";

  const filteredPRs = MOCK_PRS.filter(pr => {
    if (filter === "mine" && pr.author !== myUsername) return false;
    if (filter === "failing" && pr.status !== "failing") return false;
    if (filter === "ready" && !pr.mergeReady) return false;
    if (filter === "reviewing" && !pr.reviews.some(r => r.author === "KvanderBorght" || r.author.startsWith("Kvander"))) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return pr.title.toLowerCase().includes(q) || pr.id.toString().includes(q) || pr.author.toLowerCase().includes(q) || pr.labels.some(l => l.toLowerCase().includes(q));
    }
    return true;
  });

  const stats = {
    total: MOCK_PRS.length,
    failing: MOCK_PRS.filter(p => p.status === "failing").length,
    ready: MOCK_PRS.filter(p => p.mergeReady).length,
    mine: MOCK_PRS.filter(p => p.author === myUsername).length,
  };

  const filters = [
    { id: "all", label: "All", count: stats.total },
    { id: "mine", label: "My PRs", count: stats.mine },
    { id: "failing", label: "Failing", count: stats.failing },
    { id: "ready", label: "Ready", count: stats.ready },
    { id: "reviewing", label: "Reviewing" },
  ];

  const handleToggle = (id) => setExpandedId(prev => prev === id ? null : id);

  return (
    <ThemeContext.Provider value={theme}>
      <div style={{
        width: "100%", height: "100vh", background: theme.bg, color: theme.textPrimary,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        display: "flex", flexDirection: "column", overflow: "hidden",
        transition: "background 0.35s ease, color 0.35s ease",
      }}>
        <link href={FONT_LINK} rel="stylesheet" />

        {/* Title Bar */}
        <div style={{
          height: 44, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 18px", borderBottom: `1px solid ${theme.borderBase}`,
          background: theme.titleBarBg, backdropFilter: "blur(12px)", flexShrink: 0,
          transition: "background 0.35s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: theme.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: theme.logoText }}>P</div>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>PRDock</span>
            <span style={{ fontSize: 11, color: theme.textGhost, fontFamily: "'JetBrains Mono', monospace" }}>Gomocha-FSP/example-repo</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: theme.textMuted, padding: "3px 8px", borderRadius: 4, background: theme.bgSubtle }}>{stats.total} open</span>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: stats.failing > 0 ? theme.red : theme.green, boxShadow: stats.failing > 0 ? theme.redGlow : theme.greenGlow }} />
            <ThemeToggle isDark={isDark} onToggle={() => setIsDark(!isDark)} />
            <button title="Settings" style={{ width: 32, height: 32, borderRadius: 6, border: "none", background: "transparent", color: theme.textFaint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>⚙</button>
          </div>
        </div>

        {/* Search + Filters */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${theme.borderBase}`, background: theme.bgPanel, transition: "background 0.35s ease" }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: theme.textGhost, fontSize: 14 }}>⌕</span>
            <input
              type="text" placeholder="Search PRs... (Ctrl+K)" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: "100%", padding: "8px 12px 8px 32px", fontSize: 12.5,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: theme.bgInput, border: `1px solid ${theme.borderInput}`,
                borderRadius: 6, color: theme.textPrimary, outline: "none",
                boxSizing: "border-box", transition: "border-color 0.15s ease",
              }}
              onFocus={e => e.currentTarget.style.borderColor = theme.accentBorder}
              onBlur={e => e.currentTarget.style.borderColor = theme.borderInput}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {filters.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: "5px 12px", fontSize: 11.5,
                fontWeight: filter === f.id ? 600 : 400,
                fontFamily: "'Plus Jakarta Sans', sans-serif", borderRadius: 5,
                border: filter === f.id ? `1px solid ${theme.accentBorder}` : "1px solid transparent",
                background: filter === f.id ? theme.accentSoft : "transparent",
                color: filter === f.id ? theme.accent : theme.textMuted,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                transition: "all 0.15s ease",
              }}>
                {f.label}
                {f.count !== undefined && (
                  <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: filter === f.id ? theme.accent : theme.textGhost, background: filter === f.id ? theme.accentSoft : theme.bgSubtle, padding: "1px 5px", borderRadius: 3 }}>{f.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* PR List */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {filteredPRs.length > 0 ? filteredPRs.map(pr => (
            <PRRow key={pr.id} pr={pr} isExpanded={expandedId === pr.id} onToggle={handleToggle} onOpenModal={setModalPR} />
          )) : (
            <div style={{ padding: 40, textAlign: "center", color: theme.textGhost, fontSize: 13 }}>No PRs match your filters</div>
          )}
        </div>

        {/* Status Bar */}
        <div style={{
          padding: "6px 18px", borderTop: `1px solid ${theme.borderBase}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: theme.textGhost,
          background: theme.bgStatusBar, flexShrink: 0,
        }}>
          <span>
            {filteredPRs.length} PR{filteredPRs.length !== 1 ? "s" : ""} shown
            {stats.failing > 0 && <span style={{ color: theme.red, marginLeft: 8 }}>● {stats.failing} failing</span>}
            {stats.ready > 0 && <span style={{ color: theme.green, marginLeft: 8 }}>● {stats.ready} ready to merge</span>}
          </span>
          <span>Updated just now</span>
        </div>

        {/* Detail Modal */}
        {modalPR && <DetailModal pr={modalPR} onClose={() => setModalPR(null)} />}

        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: ${theme.scrollThumb}; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: ${theme.scrollHover}; }
          ::selection { background: ${theme.selection}; }
          button:hover { filter: brightness(1.05); }
          input::placeholder { color: ${theme.textGhost}; }
          @keyframes expandIn {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes modalIn {
            from { opacity: 0; transform: scale(0.96) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    </ThemeContext.Provider>
  );
}
