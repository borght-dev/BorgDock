import type { ClaudeApiSettings } from '@/types';

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
];

interface ClaudeApiSectionProps {
  claudeApi: ClaudeApiSettings;
  onChange: (claudeApi: ClaudeApiSettings) => void;
}

export function ClaudeApiSection({ claudeApi, onChange }: ClaudeApiSectionProps) {
  const update = (partial: Partial<ClaudeApiSettings>) => onChange({ ...claudeApi, ...partial });

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">API Key</label>
        <input
          type="password"
          className="field-input w-full"
          value={claudeApi.apiKey ?? ''}
          onChange={(e) => update({ apiKey: e.target.value || undefined })}
          placeholder="sk-ant-..."
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Model</label>
        <select
          className="field-input w-full"
          value={claudeApi.model}
          onChange={(e) => update({ model: e.target.value })}
        >
          {MODEL_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">
          Max Tokens
        </label>
        <input
          type="number"
          className="field-input w-full"
          value={claudeApi.maxTokens}
          onChange={(e) => update({ maxTokens: Number(e.target.value) || 1024 })}
          min={256}
          max={4096}
        />
      </div>
    </div>
  );
}
