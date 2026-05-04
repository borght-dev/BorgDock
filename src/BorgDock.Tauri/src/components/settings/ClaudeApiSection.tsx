import { Card, Field, SectionHeader, Select, TextInput, ToggleRow } from '@/components/shared/primitives';
import type { ClaudeApiSettings } from '@/types/settings';

interface Props { claudeApi: ClaudeApiSettings; onChange: (c: ClaudeApiSettings) => void }

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5' },
  { value: 'claude-opus-4-6',            label: 'Claude Opus 4.6' },
];

export function ClaudeApiSection({ claudeApi, onChange }: Props) {
  const update = (partial: Partial<ClaudeApiSettings>) => onChange({ ...claudeApi, ...partial });
  return (
    <>
      <SectionHeader
        title="Claude API"
        subtitle='Used for AI-generated PR summaries and the "Explain this diff" command. Separate from Claude Code.'
      />
      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Anthropic API
        </h3>
        <Field label="API key" anchorId="api-key">
          <TextInput
            ariaLabel="Anthropic API key"
            value={claudeApi.apiKey ?? ''}
            onChange={(v) => update({ apiKey: v || undefined })}
            type="password"
            mono
            placeholder="sk-ant-…"
          />
        </Field>
        <Field label="Model" anchorId="model">
          <Select
            ariaLabel="Anthropic model"
            value={claudeApi.model}
            options={MODEL_OPTIONS}
            onChange={(model) => update({ model })}
          />
        </Field>
        <Field label="Max tokens" anchorId="max-tokens">
          <TextInput
            ariaLabel="Max tokens"
            value={String(claudeApi.maxTokens)}
            onChange={(v) => update({ maxTokens: Number(v) || 1024 })}
            type="number"
            mono
          />
        </Field>
      </Card>
      <Card variant="default" padding="md">
        <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Where AI is used
        </h3>
        <p className="mb-3.5 text-[11.5px] leading-relaxed text-[var(--color-text-tertiary)]">
          Toggle individual features. Disabled features hide their UI affordances entirely.
        </p>
        <div id="field-pr-summary">
          <ToggleRow
            label="PR summary card"
            hint="One-paragraph synopsis on PR detail."
            on={claudeApi.prSummaryEnabled}
            onChange={(prSummaryEnabled) => update({ prSummaryEnabled })}
          />
        </div>
        <div id="field-diff-explain">
          <ToggleRow
            label="Diff explanations"
            hint="Right-click → Explain this diff."
            on={claudeApi.diffExplanationsEnabled}
            onChange={(diffExplanationsEnabled) => update({ diffExplanationsEnabled })}
          />
        </div>
        <div id="field-review-nudge-phrasing">
          <ToggleRow
            label="Review nudge phrasing"
            hint="AI rewrites stale-review reminders."
            on={claudeApi.reviewNudgePhrasingEnabled}
            onChange={(reviewNudgePhrasingEnabled) => update({ reviewNudgePhrasingEnabled })}
          />
        </div>
        <div id="field-commit-msg">
          <ToggleRow
            label="Commit message suggestions"
            on={claudeApi.commitMessageSuggestionsEnabled}
            onChange={(commitMessageSuggestionsEnabled) => update({ commitMessageSuggestionsEnabled })}
            last
          />
        </div>
      </Card>
    </>
  );
}
