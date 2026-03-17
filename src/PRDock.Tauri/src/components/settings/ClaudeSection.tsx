import type { ClaudeCodeSettings, PostFixAction } from '@/types';

const POST_FIX_OPTIONS: { value: PostFixAction; label: string }[] = [
  { value: 'commitAndNotify', label: 'Commit & Notify' },
  { value: 'commitOnly', label: 'Commit Only' },
  { value: 'notifyOnly', label: 'Notify Only' },
];

interface ClaudeSectionProps {
  claudeCode: ClaudeCodeSettings;
  onChange: (claudeCode: ClaudeCodeSettings) => void;
}

export function ClaudeSection({ claudeCode, onChange }: ClaudeSectionProps) {
  const update = (partial: Partial<ClaudeCodeSettings>) =>
    onChange({ ...claudeCode, ...partial });

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
          Post-Fix Action
        </label>
        <select
          className="field-input w-full"
          value={claudeCode.defaultPostFixAction}
          onChange={(e) => update({ defaultPostFixAction: e.target.value as PostFixAction })}
        >
          {POST_FIX_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
          Claude Code Path
        </label>
        <input
          className="field-input w-full"
          value={claudeCode.claudeCodePath ?? ''}
          onChange={(e) => update({ claudeCodePath: e.target.value || undefined })}
          placeholder="claude (default)"
        />
      </div>
    </div>
  );
}
