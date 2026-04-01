import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors } from "../constants";

const PRCard: React.FC<{
  title: string;
  number: number;
  status: "ready" | "failing" | "review" | "conflicts";
  author: string;
  branch: string;
  checks: { pass: number; fail: number; total: number };
  delay: number;
}> = ({ title, number, status, author, branch, checks, delay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateX = interpolate(frame, [delay, delay + 8], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const statusColors: Record<string, string> = {
    ready: colors.success,
    failing: colors.error,
    review: colors.warning,
    conflicts: "#E54065",
  };

  const statusLabels: Record<string, string> = {
    ready: "Ready to merge",
    failing: "CI Failing",
    review: "Changes requested",
    conflicts: "Merge conflicts",
  };

  const passWidth = (checks.pass / checks.total) * 100;
  const failWidth = (checks.fail / checks.total) * 100;
  const pendingWidth = 100 - passWidth - failWidth;

  return (
    <div
      style={{
        background: colors.bgCard,
        borderRadius: 10,
        padding: "14px 16px",
        opacity,
        transform: `translateX(${translateX}px)`,
        borderLeft: `3px solid ${statusColors[status]}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              background: colors.primaryDark,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "white",
              fontFamily: "'Segoe UI Variable', sans-serif",
            }}
          >
            {author
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: colors.textPrimary,
              fontFamily: "'Segoe UI Variable', sans-serif",
            }}
          >
            {title}
          </span>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: colors.primary,
            fontFamily: "'Cascadia Code', monospace",
          }}
        >
          #{number}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 6,
            background: `${statusColors[status]}22`,
            color: statusColors[status],
            fontWeight: 600,
            fontFamily: "'Segoe UI Variable', sans-serif",
          }}
        >
          {statusLabels[status]}
        </span>
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 6,
            background: colors.bgLight,
            color: colors.textMuted,
            fontFamily: "'Cascadia Code', monospace",
          }}
        >
          {branch}
        </span>
      </div>

      {/* Check progress bar */}
      <div
        style={{
          display: "flex",
          height: 4,
          borderRadius: 2,
          overflow: "hidden",
          background: colors.bgLight,
        }}
      >
        <div
          style={{
            width: `${passWidth}%`,
            background: colors.success,
          }}
        />
        <div
          style={{
            width: `${failWidth}%`,
            background: colors.error,
          }}
        />
        <div
          style={{
            width: `${pendingWidth}%`,
            background: colors.neutral,
          }}
        />
      </div>
    </div>
  );
};

export const MockSidebar: React.FC = () => {
  const frame = useCurrentFrame();
  const slideIn = interpolate(frame, [0, 15], [320, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <div
      style={{
        width: 320,
        height: 680,
        background: `linear-gradient(180deg, ${colors.bgLight} 0%, ${colors.bg} 100%)`,
        borderRadius: 16,
        padding: "16px 12px",
        transform: `translateX(${slideIn}px)`,
        boxShadow: `0 0 60px ${colors.primaryGlow}, 0 20px 60px rgba(0,0,0,0.5)`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        border: `1px solid ${colors.primary}33`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 4px 12px",
          borderBottom: `1px solid ${colors.primary}22`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="sl" x1="2" y1="8" x2="14" y2="8">
                <stop offset="0%" stopColor={colors.gradientStart} />
                <stop offset="100%" stopColor={colors.gradientEnd} />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="16" height="16" rx="4" fill="#12161f" />
            <path
              d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
              stroke="url(#sl)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="14" cy="9" r="1.5" fill={colors.success} />
          </svg>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: colors.textPrimary,
              fontFamily: "'Segoe UI Variable', sans-serif",
            }}
          >
            PRDock
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            color: colors.textMuted,
            fontFamily: "'Cascadia Code', monospace",
            background: colors.bg,
            padding: "2px 8px",
            borderRadius: 6,
          }}
        >
          4 open
        </span>
      </div>

      {/* PR Cards */}
      <PRCard
        title="Add user authentication flow"
        number={142}
        status="ready"
        author="Koen B"
        branch="feat/auth"
        checks={{ pass: 12, fail: 0, total: 12 }}
        delay={8}
      />
      <PRCard
        title="Fix payment webhook handler"
        number={139}
        status="failing"
        author="Sarah M"
        branch="fix/webhooks"
        checks={{ pass: 8, fail: 2, total: 12 }}
        delay={14}
      />
      <PRCard
        title="Update API rate limiting"
        number={137}
        status="review"
        author="Koen B"
        branch="feat/rate-limit"
        checks={{ pass: 11, fail: 0, total: 12 }}
        delay={20}
      />
      <PRCard
        title="Migrate database schema v3"
        number={135}
        status="conflicts"
        author="Alex J"
        branch="chore/db-migrate"
        checks={{ pass: 6, fail: 1, total: 12 }}
        delay={26}
      />
    </div>
  );
};
