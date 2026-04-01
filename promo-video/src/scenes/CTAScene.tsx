import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { colors } from "../constants";
import { PRDockLogo } from "../components/PRDockLogo";

export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();

  const logoOpacity = interpolate(frame, [3, 13], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineOpacity = interpolate(frame, [13, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [13, 25], [15, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const ctaOpacity = interpolate(frame, [30, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ctaScale = interpolate(frame, [30, 42], [0.9, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.5)),
  });

  // Subtle breathing glow
  const glowIntensity = Math.sin(frame * 0.08) * 0.3 + 0.7;

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Centered glow */}
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primary}20 0%, transparent 60%)`,
          filter: "blur(80px)",
          opacity: glowIntensity,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 36,
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ opacity: logoOpacity }}>
          <PRDockLogo size={80} animate={true} />
        </div>

        {/* Tagline */}
        <div
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              color: colors.textSecondary,
              fontFamily: "'Segoe UI Variable', sans-serif",
            }}
          >
            Your PRs. One sidebar.
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              color: colors.textMuted,
              fontFamily: "'Segoe UI Variable', sans-serif",
              marginTop: 8,
            }}
          >
            No tab switching. No guessing.
          </div>
        </div>

        {/* CTA */}
        <div
          style={{
            opacity: ctaOpacity,
            transform: `scale(${ctaScale})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              padding: "16px 48px",
              borderRadius: 14,
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
              fontSize: 22,
              fontWeight: 700,
              color: "white",
              fontFamily: "'Segoe UI Variable', sans-serif",
              boxShadow: `0 0 40px ${colors.primaryGlow}`,
            }}
          >
            Comment for early access
          </div>
          <span
            style={{
              fontSize: 16,
              color: colors.textMuted,
              fontFamily: "'Segoe UI Variable', sans-serif",
            }}
          >
            Built by a developer, for developers
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
