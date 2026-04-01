import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { colors } from "../constants";

const features = [
  {
    icon: "",
    title: "PR status at a glance",
    desc: "Ready, needs review, or failing — instantly visible",
    color: colors.success,
  },
  {
    icon: "",
    title: "CI results with failure details",
    desc: "See exactly what broke without leaving your editor",
    color: colors.error,
  },
  {
    icon: "",
    title: "Merge conflict alerts",
    desc: "Know about conflicts before you context-switch",
    color: colors.warning,
  },
  {
    icon: "",
    title: "Linked work items",
    desc: "Azure DevOps tasks connected to your PRs",
    color: colors.primary,
  },
];

export const FeaturesScene: React.FC = () => {
  const frame = useCurrentFrame();

  const titleOpacity = interpolate(frame, [3, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeOut = interpolate(frame, [130, 148], [1, 0], {
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
      {/* Background gradient orbs */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primary}10 0%, transparent 70%)`,
          filter: "blur(100px)",
          top: -200,
          right: -200,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 50,
          padding: "0 120px",
          width: "100%",
        }}
      >
        {/* Section title */}
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            color: colors.textPrimary,
            fontFamily: "'Segoe UI Variable', sans-serif",
            opacity: titleOpacity,
            textAlign: "center",
          }}
        >
          Everything you need.{" "}
          <span style={{ color: colors.primary }}>One glance.</span>
        </div>

        {/* Feature grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 30,
            justifyContent: "center",
            maxWidth: 1200,
          }}
        >
          {features.map((feat, i) => {
            const delay = 15 + i * 12;
            const itemOpacity = interpolate(
              frame,
              [delay, delay + 12],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            const itemY = interpolate(
              frame,
              [delay, delay + 12],
              [30, 0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              },
            );

            return (
              <div
                key={i}
                style={{
                  width: 520,
                  padding: "28px 32px",
                  borderRadius: 16,
                  background: colors.bgCard,
                  border: `1px solid ${feat.color}33`,
                  opacity: itemOpacity,
                  transform: `translateY(${itemY}px)`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 20,
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: `${feat.color}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 26,
                    flexShrink: 0,
                  }}
                >
                  {feat.icon}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: colors.textPrimary,
                      fontFamily: "'Segoe UI Variable', sans-serif",
                      marginBottom: 6,
                    }}
                  >
                    {feat.title}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      color: colors.textMuted,
                      fontFamily: "'Segoe UI Variable', sans-serif",
                      lineHeight: 1.4,
                    }}
                  >
                    {feat.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
