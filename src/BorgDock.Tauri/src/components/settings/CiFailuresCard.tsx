import { useEffect, useState } from 'react';
import { Card, Field, Slider, ToggleRow } from '@/components/shared/primitives';
import * as store from '@/services/ci-failures/store-api';
import type { CiFailureSettings, RepoSettings } from '@/types/settings';

interface Props {
  ciFailures: CiFailureSettings;
  repos: readonly RepoSettings[];
  onChange: (next: CiFailureSettings) => void;
}

interface UsageLine {
  reads: number;
  logBytes: number;
  skipped: number;
}

/** Today's evidence reads across the accounts the repos use. */
function useUsageToday(repos: readonly RepoSettings[]): UsageLine | null {
  const accounts = [...new Set(repos.map((r) => r.githubAccount?.trim() ?? ''))].join('|');
  const [usage, setUsage] = useState<UsageLine | null>(null);
  useEffect(() => {
    let cancelled = false;
    const day = new Date().toISOString().slice(0, 10);
    Promise.all(accounts.split('|').map((account) => store.usage(day, account)))
      .then((rows) => {
        if (cancelled) return;
        setUsage(
          rows.reduce(
            (sum, row) => ({
              reads: sum.reads + row.reads,
              logBytes: sum.logBytes + row.logBytes,
              skipped: sum.skipped + row.skipped,
            }),
            { reads: 0, logBytes: 0, skipped: 0 },
          ),
        );
      })
      .catch(() => !cancelled && setUsage(null));
    return () => {
      cancelled = true;
    };
  }, [accounts]);
  return usage;
}

function mib(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MiB`;
}

/**
 * CiFailuresCard — Settings → GitHub → Related CI failures: whether BorgDock
 * reads evidence for failed checks, which runs count, and the limits that
 * keep it cheap, with today's usage.
 */
export function CiFailuresCard({ ciFailures, repos, onChange }: Props) {
  const usage = useUsageToday(repos);
  const set = (patch: Partial<CiFailureSettings>) => onChange({ ...ciFailures, ...patch });
  return (
    <Card variant="default" padding="md">
      <h3
        id="ci-failures"
        className="mb-1 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]"
      >
        Related CI failures
      </h3>
      <p className="mb-3 text-[12px] text-[var(--color-text-tertiary)]">
        Groups the same failure across pull requests so one investigation covers them all. Advisory
        only: it never reruns or skips a check.
        {usage &&
          ` Today: ${usage.reads} evidence ${usage.reads === 1 ? 'read' : 'reads'}, ${mib(usage.logBytes)} of logs${usage.skipped > 0 ? `, ${usage.skipped} skipped by the limit` : ''}.`}
      </p>
      <ToggleRow
        label="Collect evidence for failed checks"
        hint="Reads each new failed job's details, annotations and the end of its log, once."
        on={ciFailures.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      <ToggleRow
        label="Include the default branch"
        hint="Failed push runs on master or main count too: a failure there is rarely the PR's fault."
        on={ciFailures.includeDefaultBranch}
        onChange={(includeDefaultBranch) => set({ includeDefaultBranch })}
      />
      <ToggleRow
        label="Suggest matches across repositories"
        hint="Only within one GitHub account, and only as suggestions you confirm."
        on={ciFailures.crossRepoSuggestions}
        onChange={(crossRepoSuggestions) => set({ crossRepoSuggestions })}
        last
      />
      <Field
        label="Evidence reads per day"
        hint="Per GitHub account. About four requests each."
        anchorId="ci-daily-limit"
      >
        <Slider
          ariaLabel="Evidence reads per day"
          value={ciFailures.dailyEvidenceLimit}
          min={20}
          max={2000}
          step={20}
          onChange={(dailyEvidenceLimit) => set({ dailyEvidenceLimit })}
        />
      </Field>
      <Field
        label="Log tail"
        hint="Only the end of a job's log is read; failures are near the end."
        anchorId="ci-log-tail"
      >
        <Slider
          ariaLabel="Log tail size"
          value={ciFailures.maxLogMib}
          min={1}
          max={16}
          suffix=" MiB"
          onChange={(maxLogMib) => set({ maxLogMib })}
        />
      </Field>
      <Field label="Log read timeout" anchorId="ci-log-timeout">
        <Slider
          ariaLabel="Log read timeout"
          value={ciFailures.logTimeoutSeconds}
          min={5}
          max={120}
          step={5}
          suffix="s"
          onChange={(logTimeoutSeconds) => set({ logTimeoutSeconds })}
        />
      </Field>
      <Field label="Keep history" anchorId="ci-retention">
        <Slider
          ariaLabel="Days of history"
          value={ciFailures.retentionDays}
          min={7}
          max={90}
          suffix=" days"
          onChange={(retentionDays) => set({ retentionDays })}
        />
      </Field>
      <Field
        label="Owner check-in"
        hint="You and terminal sessions have no status; BorgDock asks if you're still on it after this long."
        anchorId="ci-lease"
      >
        <Slider
          ariaLabel="Owner check-in after"
          value={ciFailures.leaseHours}
          min={1}
          max={168}
          suffix=" h"
          onChange={(leaseHours) => set({ leaseHours })}
        />
      </Field>
      <Field
        label="Notify at"
        hint="A shared failure with no owner notifies once it reaches this many PRs."
        anchorId="ci-notify-threshold"
      >
        <Slider
          ariaLabel="Notify when a failure reaches this many PRs"
          value={ciFailures.notifyThreshold}
          min={2}
          max={10}
          suffix=" PRs"
          onChange={(notifyThreshold) => set({ notifyThreshold })}
        />
      </Field>
    </Card>
  );
}
