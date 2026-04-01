// PRDock brand colors
export const colors = {
  bg: "#0D0B14",
  bgLight: "#1A1726",
  bgCard: "#221F30",
  primary: "#7C6AF6",
  primaryDark: "#6655D4",
  primaryGlow: "rgba(124, 106, 246, 0.25)",
  success: "#2ea043",
  successLight: "#7DD3C0",
  error: "#E54065",
  warning: "#F5B73B",
  neutral: "#5A5670",
  textPrimary: "#EDEAF4",
  textSecondary: "#C8C4D6",
  textMuted: "#8A85A0",
  gradientStart: "#204C9C",
  gradientEnd: "#2ea043",
  white: "#FFFFFF",
};

export const FPS = 30;

// Scene durations in frames
export const SCENE_DURATIONS = {
  hook: 3.5 * FPS, // 105 frames
  problem: 4 * FPS, // 120 frames
  question: 2.5 * FPS, // 75 frames
  solution: 5 * FPS, // 150 frames
  features: 5 * FPS, // 150 frames
  cta: 3 * FPS, // 90 frames
};

export const TOTAL_FRAMES = Object.values(SCENE_DURATIONS).reduce(
  (a, b) => a + b,
  0,
);
