import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { colors } from "../constants";
import { MockSidebar } from "../components/MockSidebar";

export const SolutionScene: React.FC = () => {
  const frame = useCurrentFrame();

  // "So I built..." text
  const textOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textY = interpolate(frame, [0, 12], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Sidebar entrance starts after text
  const sidebarOpacity = interpolate(frame, [20, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade out
  const fadeOut = interpolate(frame, [130, 148], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Simulated "desktop" background
  const codeLines = [
    "export async function fetchPullRequests(owner: string, repo: string) {",
    "  const response = await octokit.pulls.list({",
    "    owner,",
    "    repo,",
    "    state: 'open',",
    "    sort: 'updated',",
    "  });",
    "",
    "  return response.data.map(pr => ({",
    "    id: pr.id,",
    "    title: pr.title,",
    "    number: pr.number,",
    "    author: pr.user?.login,",
    "    status: getStatus(pr),",
    "    checks: await getCheckStatus(pr),",
    "    conflicts: pr.mergeable_state === 'dirty',",
    "  }));",
    "}",
    "",
    "function getStatus(pr: PullRequest): PRStatus {",
    "  if (pr.draft) return 'draft';",
    "  if (pr.mergeable_state === 'dirty') return 'conflicts';",
    "  return 'open';",
    "}",
  ];

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        opacity: fadeOut,
      }}
    >
      {/* Fake code editor background */}
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 60,
          width: "60%",
          opacity: 0.35,
        }}
      >
        {codeLines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 16,
              height: 26,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: colors.textMuted,
                fontFamily: "'Cascadia Code', monospace",
                width: 30,
                textAlign: "right",
                opacity: 0.5,
              }}
            >
              {i + 1}
            </span>
            <span
              style={{
                fontSize: 14,
                color: i === 0 || i === 19
                  ? colors.primary
                  : line.includes("return") || line.includes("const") || line.includes("if")
                    ? colors.primaryDark
                    : line.includes("'")
                      ? colors.success
                      : colors.textSecondary,
                fontFamily: "'Cascadia Code', monospace",
                whiteSpace: "pre",
              }}
            >
              {line}
            </span>
          </div>
        ))}
      </div>

      {/* "So I built..." text overlay */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: "42%",
          zIndex: 2,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
        }}
      >
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: colors.textPrimary,
            fontFamily: "'Segoe UI Variable', sans-serif",
            textShadow: `0 0 80px ${colors.bg}, 0 0 40px ${colors.bg}`,
          }}
        >
          So I built a sidebar
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: colors.primary,
            fontFamily: "'Segoe UI Variable', sans-serif",
            textShadow: `0 0 80px ${colors.bg}, 0 0 40px ${colors.bg}`,
          }}
        >
          that just answers it.
        </div>
      </div>

      {/* PRDock sidebar on the right */}
      <div
        style={{
          position: "absolute",
          right: 60,
          top: "50%",
          transform: "translateY(-50%)",
          opacity: sidebarOpacity,
        }}
      >
        <MockSidebar />
      </div>
    </AbsoluteFill>
  );
};
