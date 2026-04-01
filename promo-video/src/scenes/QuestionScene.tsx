import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { colors } from "../constants";

export const QuestionScene: React.FC = () => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [3, 15], [0.8, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.3)),
  });

  const opacity = interpolate(frame, [3, 13], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const statOpacity = interpolate(frame, [25, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(frame, [58, 73], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Blinking cursor
  const cursorOpacity = Math.sin(frame * 0.3) > 0 ? 1 : 0;

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeOut,
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.error}15 0%, transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      <div
        style={{
          transform: `scale(${scale})`,
          opacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
        }}
      >
        {/* The question */}
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            color: colors.textPrimary,
            fontFamily: "'Segoe UI Variable', sans-serif",
            textAlign: "center",
          }}
        >
          "Is my PR ready yet?"
          <span
            style={{
              opacity: cursorOpacity,
              color: colors.primary,
              marginLeft: 4,
            }}
          >
            |
          </span>
        </div>

        {/* Stat */}
        <div
          style={{
            opacity: statOpacity,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 28px",
            borderRadius: 12,
            background: `${colors.error}15`,
            border: `1px solid ${colors.error}33`,
          }}
        >
          <span
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: colors.error,
              fontFamily: "'Cascadia Code', monospace",
            }}
          >
            15+
          </span>
          <span
            style={{
              fontSize: 22,
              color: colors.textSecondary,
              fontFamily: "'Segoe UI Variable', sans-serif",
            }}
          >
            status checks per day
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
