import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
}

export function SectionHeader({ title, subtitle, badge }: SectionHeaderProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-[10px]">
        <h2 className="text-[18px] font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h2>
        {badge}
      </div>
      {subtitle && (
        <p className="mt-1.5 max-w-[620px] text-xs leading-relaxed text-[var(--color-text-tertiary)]">
          {subtitle}
        </p>
      )}
    </div>
  );
}
