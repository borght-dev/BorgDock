interface LabelBadgeProps {
  label: string;
  color?: string; // hex color from GitHub label
}

function readableTextColor(hexBg: string): string {
  const hex = hexBg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1d26' : '#ffffff';
}

export function LabelBadge({ label, color }: LabelBadgeProps) {
  if (color) {
    const bg = color.startsWith('#') ? color : `#${color}`;
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-none"
        style={{
          backgroundColor: `${bg}33`, // ~20% alpha
          color: readableTextColor(bg),
          border: `1px solid ${bg}55`,
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-none bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)]">
      {label}
    </span>
  );
}
