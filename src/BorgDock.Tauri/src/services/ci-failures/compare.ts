import { commands } from '@/generated/commands';
import { excerptFromSignals } from '@/services/first-failure';
import { commandData } from '@/services/native-command';
import { useSettingsStore } from '@/stores/settings-store';
import type { CiGroupDetail } from './types';

/** What the agent said about two candidate groups. Advisory: it never writes a decision. */
export interface CompareVerdict {
  same: boolean;
  reason: string;
  provider: string;
  model: string;
  at: string;
}

/** The sanitized evidence of a group, as the compare prompt carries it: one excerpt per job. */
export function groupEvidence(detail: CiGroupDetail, max = 2): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const occurrence of detail.occurrences) {
    if (parts.length >= max || seen.has(occurrence.occurrence.jobName)) continue;
    seen.add(occurrence.occurrence.jobName);
    const lines = excerptFromSignals(
      occurrence.signals.filter((s) => s.groupId === detail.summary.id).map((s) => s.signal),
    );
    if (lines.length === 0) continue;
    parts.push(
      [
        `Job: ${occurrence.occurrence.workflowName ?? ''} › ${occurrence.occurrence.jobName}`,
        occurrence.occurrence.failedStep
          ? `Failed step: ${occurrence.occurrence.failedStep}`
          : null,
        lines.join('\n'),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return parts.join('\n---\n');
}

/** The exact text sent to the agent, shown before it goes out. */
export function comparePrompt(a: CiGroupDetail, b: CiGroupDetail): string {
  return [
    'Two groups of CI failures from the same repository. Decide whether they share one root cause.',
    'Answer with only a JSON object: {"same": true|false, "reason": "<one sentence>"}. Do not run commands or modify files.',
    `Group A: ${a.summary.title}\n${groupEvidence(a)}`,
    `Group B: ${b.summary.title}\n${groupEvidence(b)}`,
  ].join('\n\n');
}

/** The verdict in an agent reply, tolerating text around the JSON object; null when there is none. */
export function parseVerdict(text: string): { same: boolean; reason: string } | null {
  const match = /\{[^{}]*"same"\s*:\s*(true|false)[^{}]*\}/s.exec(text);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { same?: unknown; reason?: unknown };
    if (typeof parsed.same !== 'boolean') return null;
    return { same: parsed.same, reason: typeof parsed.reason === 'string' ? parsed.reason : '' };
  } catch {
    return null;
  }
}

/** Asks the summary agent (Settings → Summaries) whether two groups share a cause. */
export async function askAgent(prompt: string): Promise<CompareVerdict> {
  const settings = useSettingsStore.getState().settings;
  const provider = settings.summaries?.provider ?? 'claude';
  const executable =
    provider === 'claude' ? settings.agents?.claudePath : settings.agents?.codexPath;
  const result = await commandData(
    commands.runHeadlessPrompt({
      provider,
      prompt,
      model: settings.summaries?.model || null,
      executable: executable ?? null,
      timeoutSeconds: 90,
    }),
  );
  const verdict = parseVerdict(result.text);
  if (!verdict) throw new Error('The agent did not answer with a verdict');
  return {
    ...verdict,
    provider: result.provider,
    model: result.model,
    at: new Date().toISOString(),
  };
}
