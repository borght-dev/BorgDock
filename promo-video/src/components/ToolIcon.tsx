import React from "react";

const toolConfigs: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  github: { label: "GitHub", color: "#238636", icon: "" },
  ci: { label: "CI / CD", color: "#F5B73B", icon: "" },
  azure: { label: "Azure DevOps", color: "#0078D4", icon: "" },
  slack: { label: "Slack", color: "#E01E5A", icon: "" },
};

export const ToolIcon: React.FC<{
  tool: "github" | "ci" | "azure" | "slack";
  size?: number;
  opacity?: number;
}> = ({ tool, size = 120, opacity = 1 }) => {
  const config = toolConfigs[tool];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 20,
        background: config.color,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity,
        boxShadow: `0 0 40px ${config.color}44`,
      }}
    >
      <span style={{ fontSize: size * 0.35 }}>{config.icon}</span>
      <span
        style={{
          fontSize: size * 0.13,
          fontWeight: 700,
          color: "white",
          fontFamily: "'Segoe UI Variable', sans-serif",
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {config.label}
      </span>
    </div>
  );
};
