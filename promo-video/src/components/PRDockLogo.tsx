import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { colors } from "../constants";

export const PRDockLogo: React.FC<{
  size?: number;
  animate?: boolean;
}> = ({ size = 64, animate = true }) => {
  const frame = useCurrentFrame();
  const scale = animate
    ? interpolate(frame, [0, 20], [0, 1], {
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.3,
        transform: `scale(${scale})`,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="fav-line" x1="2" y1="8" x2="14" y2="8">
            <stop offset="0%" stopColor={colors.gradientStart} />
            <stop offset="100%" stopColor={colors.gradientEnd} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="16" height="16" rx="4" fill="#12161f" />
        <path
          d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
          stroke="url(#fav-line)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="14" cy="9" r="1.5" fill={colors.success} />
      </svg>
      <span
        style={{
          fontSize: size * 0.7,
          fontWeight: 800,
          color: colors.textPrimary,
          fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        PRDock
      </span>
    </div>
  );
};
