import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { colors } from "../constants";
import { ToolIcon } from "../components/ToolIcon";

const tools = ["github", "ci", "azure", "slack"] as const;
const positions = [
  { x: -320, y: -160 },
  { x: 320, y: -160 },
  { x: -320, y: 160 },
  { x: 320, y: 160 },
];

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Fade in
  const fadeIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Arrows / switching animation
  const switchPulse = Math.sin(frame * 0.25) * 0.15 + 0.85;

  // Text at bottom
  const textOpacity = interpolate(frame, [25, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tab switching line animation — faster cycling
  const activeTab = Math.floor(frame / 10) % 4;

  // Fade out
  const fadeOut = interpolate(frame, [100, 118], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeIn * fadeOut,
      }}
    >
      {/* Tool icons */}
      {tools.map((tool, i) => {
        const isActive = i === activeTab;
        const enterDelay = i * 4;
        const iconOpacity = interpolate(
          frame,
          [enterDelay, enterDelay + 8],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const iconScale = interpolate(
          frame,
          [enterDelay, enterDelay + 8],
          [0.5, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.back(1.5)),
          },
        );

        return (
          <div
            key={tool}
            style={{
              position: "absolute",
              left: `calc(50% + ${positions[i].x}px)`,
              top: `calc(45% + ${positions[i].y}px)`,
              transform: `translate(-50%, -50%) scale(${iconScale * (isActive ? 1.1 : 0.9)})`,
              opacity: iconOpacity * (isActive ? 1 : 0.5),
              transition: "transform 0.3s",
            }}
          >
            <ToolIcon tool={tool} size={140} />
          </div>
        );
      })}

      {/* Switching arrows between tools */}
      <svg
        width="800"
        height="500"
        viewBox="-400 -250 800 500"
        style={{
          position: "absolute",
          top: "calc(45% - 250px)",
          left: "calc(50% - 400px)",
          opacity: interpolate(frame, [15, 25], [0, 0.4], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * switchPulse,
        }}
      >
        {/* Dashed arrows connecting tools */}
        <line x1="-220" y1="-100" x2="220" y2="-100" stroke={colors.textMuted} strokeWidth="2" strokeDasharray="8 6" />
        <line x1="-220" y1="100" x2="220" y2="100" stroke={colors.textMuted} strokeWidth="2" strokeDasharray="8 6" />
        <line x1="-260" y1="-60" x2="-260" y2="60" stroke={colors.textMuted} strokeWidth="2" strokeDasharray="8 6" />
        <line x1="260" y1="-60" x2="260" y2="60" stroke={colors.textMuted} strokeWidth="2" strokeDasharray="8 6" />
        <line x1="-200" y1="-80" x2="200" y2="80" stroke={colors.textMuted} strokeWidth="1.5" strokeDasharray="8 6" />
        <line x1="200" y1="-80" x2="-200" y2="80" stroke={colors.textMuted} strokeWidth="1.5" strokeDasharray="8 6" />
      </svg>

      {/* Bottom text */}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          textAlign: "center",
          opacity: textOpacity,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: colors.textSecondary,
            fontFamily: "'Segoe UI Variable', sans-serif",
            lineHeight: 1.5,
          }}
        >
          4 tools. Constant tab switching.
        </div>
        <div
          style={{
            fontSize: 24,
            color: colors.textMuted,
            fontFamily: "'Segoe UI Variable', sans-serif",
            marginTop: 8,
          }}
        >
          Just to answer one question...
        </div>
      </div>
    </AbsoluteFill>
  );
};
