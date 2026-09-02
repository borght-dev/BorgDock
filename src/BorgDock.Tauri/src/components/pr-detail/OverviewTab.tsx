import { useCallback, useEffect, useState } from 'react';
import { FeatureBadge, InlineHint } from '@/components/onboarding';
import { T3SessionStrip } from '@/components/pr/T3SessionStrip';
import { Markdown } from '@/components/shared/Markdown';
import { Button, Card } from '@/components/shared/primitives';
import { useT3Sessions } from '@/hooks/useT3Sessions';
import { useWorkItemLinks } from '@/hooks/useWorkItemLinks';
import { loadTabData, saveTabData } from '@/services/cache';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { summaryKey, useSummaryStore } from '@/stores/summary-store';
import type { PullRequestWithChecks } from '@/types';
import { parseError } from '@/utils/parse-error';
import { LinkedWorkItemBadge } from './LinkedWorkItemBadge';
import { MergedCard } from './MergedCard';
import { MergeReadinessChecklist } from './MergeReadinessChecklist';

interface OverviewTabProps {
  pr: PullRequestWithChecks;
}

export function OverviewTab({ pr }: OverviewTabProps) {
  useT3Sessions();
  const p = pr.pullRequest;
  const isOpen = p.state === 'open';
  const { workItemIds, workItems, isLoading: workItemsLoading } = useWorkItemLinks(p);
  const summarySettings = useSettingsStore(
    (s) => s.settings.summaries ?? { enabled: true, provider: 'claude', model: 'sonnet' },
  );
  const agentSettings = useSettingsStore(
    (s) =>
      s.settings.agents ?? {
        defaultProvider: 't3',
        fallbackProvider: 'claude',
        defaultPostFixAction: 'commitAndNotify',
        t3Model: 'claude-fable-5',
        t3ModelInstance: 'claudeAgent',
        claudePath: undefined,
        codexPath: undefined,
      },
  );
  const repoPath = useSettingsStore(
    (s) =>
      s.settings.repos.find(
        (repo) =>
          repo.owner.toLowerCase() === p.repoOwner.toLowerCase() &&
          repo.name.toLowerCase() === p.repoName.toLowerCase(),
      )?.worktreeBasePath,
  );
  const sKey = summaryKey(p.repoOwner, p.repoName, p.number);
  const headVersion = p.headSha || p.updatedAt;
  const cachedSummary = useSummaryStore((s) => s.getSummary(sKey, headVersion));
  const summaryLoading = useSummaryStore((s) => s.isLoading(sKey));
  const [summaryError, setSummaryError] = useState('');
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  useEffect(() => {
    if (cachedSummary) return;
    void loadTabData<string>(p.repoOwner, p.repoName, p.number, 'summary').then((entry) => {
      if (entry?.prUpdatedAt === headVersion && entry.data) {
        useSummaryStore.getState().setSummary(sKey, entry.data, headVersion);
      }
    });
  }, [cachedSummary, headVersion, p.number, p.repoName, p.repoOwner, sKey]);

  const handleGenerateSummary = useCallback(async () => {
    useOnboardingStore.getState().dismissBadge('pr-summary');
    setSummaryError('');
    useSummaryStore.getState().setLoading(sKey, true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const prompt = `Summarize this pull request for a reviewer. Use exactly these headings: Summary, Key Changes, Risk Level, Review Focus. Keep it concise and do not modify files.\n\nTitle: ${p.title}\nBranch: ${p.headRef}\nLabels: ${p.labels.join(', ') || 'None'}\nSize: +${p.additions} / -${p.deletions}\n\nDescription:\n${p.body || 'No description provided'}`;
      const provider = summarySettings.provider;
      const executable = provider === 'claude' ? agentSettings.claudePath : agentSettings.codexPath;
      const result = await invoke<{
        text: string;
        provider: string;
        model: string;
        durationMs: number;
      }>('run_headless_prompt', {
        request: {
          provider,
          prompt,
          cwd: repoPath,
          model: summarySettings.model || undefined,
          executable,
          timeoutSeconds: 90,
        },
      });
      const text = result.text;
      useSummaryStore.getState().setSummary(sKey, text, headVersion);
      void saveTabData(p.repoOwner, p.repoName, p.number, 'summary', text, headVersion);
    } catch (err) {
      useSummaryStore.getState().setLoading(sKey, false);
      setSummaryError(parseError(err).message);
    }
  }, [agentSettings, headVersion, p, repoPath, sKey, summarySettings]);

  return (
    <div className="px-6 py-5 space-y-5">
      {!isOpen && <MergedCard pr={p} />}

      {/* Merge Readiness Checklist */}
      <MergeReadinessChecklist pr={pr} />
      <T3SessionStrip pr={p} />

      {/* AI Summary */}
      {summarySettings.enabled ? (
        <div className="space-y-2">
          {!cachedSummary && !summaryLoading && (
            <>
              <InlineHint
                hintId="pr-summary-generate"
                text="Generate a quick AI summary of this PR"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateSummary}
                data-overview-action="summarize"
                className="w-full"
              >
                Summarize with AI
                <FeatureBadge badgeId="pr-summary" />
              </Button>
            </>
          )}
          {summaryLoading && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              Generating summary...
            </div>
          )}
          {summaryError && (
            <Card padding="sm" variant="default">
              <div className="text-xs text-[var(--color-error-badge-fg)]">
                {summaryError}
                <Button variant="ghost" size="sm" onClick={handleGenerateSummary} className="ml-2">
                  Retry
                </Button>
              </div>
            </Card>
          )}
          {cachedSummary && (
            <Card padding="sm">
              <button
                type="button"
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]"
              >
                AI Summary
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  {summaryExpanded ? <path d="m4 10 4-4 4 4" /> : <path d="m4 6 4 4 4-4" />}
                </svg>
              </button>
              {summaryExpanded && (
                <div className="mt-2 border-t border-[var(--color-separator)] pt-2">
                  <div className="markdown-body text-xs text-[var(--color-text-secondary)]">
                    <Markdown>{cachedSummary}</Markdown>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      useSummaryStore.getState().invalidate(sKey);
                      handleGenerateSummary();
                    }}
                    className="mt-2"
                  >
                    Regenerate
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-[var(--color-text-ghost)]">
          Enable CLI summaries in Settings → Agents
        </div>
      )}

      {/* Linked Work Items */}
      {workItemIds.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            Linked Work Items
          </div>
          {workItemIds.map((id) => (
            <LinkedWorkItemBadge
              key={id}
              workItemId={id}
              workItem={workItems.find((w) => w.id === id)}
            />
          ))}
          {workItemsLoading && (
            <div className="text-[10px] text-[var(--color-text-muted)]">Loading work items...</div>
          )}
        </div>
      )}

      {/* Description */}
      {p.body && (
        <div className="markdown-body">
          <Markdown>{p.body}</Markdown>
        </div>
      )}
    </div>
  );
}
