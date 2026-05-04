import { Card } from '@/components/shared/primitives';
import { Field, SectionHeader, Select, TextInput } from '@/components/shared/primitives';
import type { ClaudeCodeSettings, PostFixAction } from '@/types/settings';

interface Props { claudeCode: ClaudeCodeSettings; onChange: (c: ClaudeCodeSettings) => void }

const POST_FIX_OPTIONS = [
  { value: 'commitAndNotify', label: 'Commit & Notify' },
  { value: 'commitOnly',      label: 'Commit Only' },
  { value: 'notifyOnly',      label: 'Notify Only' },
  { value: 'none',            label: 'None' },
];

export function ClaudeSection({ claudeCode, onChange }: Props) {
  return (
    <>
      <SectionHeader
        title="Claude Code"
        subtitle="How BorgDock invokes Claude Code for fix-with-Claude actions and post-fix hooks."
      />
      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Fix-with-Claude
        </h3>
        <Field
          label="Post-fix action"
          hint="What BorgDock does after a Claude Code session finishes."
          anchorId="post-fix-action"
        >
          <Select
            ariaLabel="Post-fix action"
            value={claudeCode.defaultPostFixAction}
            options={POST_FIX_OPTIONS}
            onChange={(v) => onChange({ ...claudeCode, defaultPostFixAction: v as PostFixAction })}
          />
        </Field>
        <Field
          label="Claude Code path"
          hint="Leave blank to use the binary on your PATH."
          anchorId="claude-code-path"
        >
          <TextInput
            ariaLabel="Claude Code path"
            value={claudeCode.claudeCodePath ?? ''}
            onChange={(v) => onChange({ ...claudeCode, claudeCodePath: v.trim() || undefined })}
            placeholder="claude (default)"
            mono
          />
        </Field>
      </Card>
    </>
  );
}
