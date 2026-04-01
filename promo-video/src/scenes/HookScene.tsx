import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { colors } from "../constants";

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Line 1: "Most PRs don't get blocked by code."
  const line1Opacity = interpolate(frame, [5, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line1Y = interpolate(frame, [5, 15], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Line 2: "They get blocked by context switching."
  const line2Opacity = interpolate(frame, [30, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line2Y = interpolate(frame, [30, 40], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // "context switching" highlight
  const highlightWidth = interpolate(frame, [45, 58], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Fade out
  const fadeOut = interpolate(frame, [88, 103], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeOut,
      }}
    >
      {/* Subtle gradient orb */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primaryGlow} 0%, transparent 70%)`,
          filter: "blur(80px)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: colors.textPrimary,
            fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
            opacity: line1Opacity,
            transform: `translateY(${line1Y}px)`,
            textAlign: "center",
          }}
        >
          Most PRs don't get blocked by code.
        </div>

        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: colors.textPrimary,
            fontFamily: "'Segoe UI Variable', 'Segoe UI', sans-serif",
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
            textAlign: "center",
            position: "relative",
          }}
        >
          They get blocked by{" "}
          <span style={{ position: "relative", display: "inline-block" }}>
            <span style={{ position: "relative", zIndex: 1, color: colors.primary }}>
              context switching.
            </span>
            <span
              style={{
                position: "absolute",
                bottom: -4,
                left: 0,
                width: `${highlightWidth}%`,
                height: 6,
                background: `linear-gradient(90deg, ${colors.primary}, ${colors.success})`,
                borderRadius: 3,
              }}
            />
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
