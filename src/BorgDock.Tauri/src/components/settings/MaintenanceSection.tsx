import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Card, Button, SectionHeader } from '@/components/shared/primitives';
import { WorktreePruneDialog } from '@/components/worktree/WorktreePruneDialog';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useSettingsStore } from '@/stores/settings-store';
import { SelfTestResultsDialog, type SelfTestResult } from './SelfTestResultsDialog';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function MaintenanceSection() {
  const settings = useSettingsStore((s) => s.settings);
  const [pruneOpen, setPruneOpen] = useState(false);
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [selfTestOpen, setSelfTestOpen] = useState(false);
  const [selfTestResults, setSelfTestResults] = useState<SelfTestResult[]>([]);

  useEffect(() => {
    invoke<number>('get_cache_size').then(setCacheBytes).catch(() => setCacheBytes(0));
  }, []);

  const handleClearCache = async () => {
    try {
      const r = await invoke<{ bytesFreed: number }>('clear_cache');
      setCacheBytes(0);
      console.info('cache cleared', r);
    } catch (e) {
      console.error('clear cache failed', e);
    }
  };

  const handleCopyDiagnostics = async () => {
    const blob = JSON.stringify(
      {
        appVersion: 'unknown', // TODO when __BORGDOCK_VERSION__ is wired
        os: navigator.platform,
        ua: navigator.userAgent,
        repos: settings.repos.map((r) => `${r.owner}/${r.name}`),
        ado: { org: settings.azureDevOps.organization, project: settings.azureDevOps.project },
        sqlConnections: settings.sql.connections.map((c) => c.name),
      },
      null,
      2,
    );
    await writeText(blob);
  };

  const handleOpenLogFolder = async () => {
    try {
      await invoke('open_log_folder');
    } catch (e) {
      console.error('open log folder failed', e);
    }
  };

  const handleSelfTest = async () => {
    setSelfTestOpen(true);
    setSelfTestResults([]);
    try {
      const r = await invoke<SelfTestResult[]>('run_self_test');
      setSelfTestResults(r);
    } catch (e) {
      setSelfTestResults([{ service: 'Self-test', ok: false, message: String(e) }]);
    }
  };

  const handleResetAll = async () => {
    setConfirmReset(false);
    try {
      await invoke('reset_all_settings');
      // App will restart — UI may not reach here.
    } catch (e) {
      console.error('reset failed', e);
    }
  };

  return (
    <>
      <SectionHeader
        title="Maintenance"
        subtitle="Housekeeping tasks. Reset / clear actions are not reversible — read carefully."
      />

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Worktrees</h3>
        <div id="field-prune-worktrees" className="flex items-center gap-3.5 py-1">
          <div className="flex-1">
            <div className="text-xs font-medium text-[var(--color-text-primary)]">Prune worktrees</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              Remove worktrees whose PRs have been merged or closed.
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setPruneOpen(true)}>
            Prune worktrees
          </Button>
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">
          Onboarding &amp; cache
        </h3>
        <div
          id="field-reset-onboarding"
          className="flex items-center gap-3.5 border-b border-[var(--color-subtle-border)] py-3"
        >
          <div className="flex-1">
            <div className="text-xs font-medium text-[var(--color-text-primary)]">Reset onboarding</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              Replay the welcome wizard on next launch. Settings are kept.
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => useOnboardingStore.getState().resetAll()}>
            Reset onboarding
          </Button>
        </div>
        <div
          id="field-clear-cache"
          className="flex items-center gap-3.5 border-b border-[var(--color-subtle-border)] py-3"
        >
          <div className="flex-1">
            <div className="text-xs font-medium text-[var(--color-text-primary)]">Clear cache</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              Drops cached PR bodies, file diffs and avatars.
              {cacheBytes !== null && cacheBytes > 0 && ` Currently ${fmtBytes(cacheBytes)}.`}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={handleClearCache}>
            Clear cache
          </Button>
        </div>
        <div id="field-reset-everything" className="flex items-center gap-3.5 py-3">
          <div className="flex-1">
            <div className="text-xs font-medium text-[var(--color-text-primary)]">Reset all settings</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              Wipe every preference and connection back to defaults. App will restart.
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
            Reset everything
          </Button>
        </div>
      </Card>

      <Card variant="default" padding="md">
        <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]">Diagnostics</h3>
        <div id="field-diagnostics" className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopyDiagnostics}>
            Copy diagnostic info
          </Button>
          <Button variant="secondary" size="sm" onClick={handleOpenLogFolder}>
            Open log folder
          </Button>
          <Button variant="secondary" size="sm" onClick={handleSelfTest}>
            Run self-test
          </Button>
        </div>
      </Card>

      <WorktreePruneDialog isOpen={pruneOpen} onClose={() => setPruneOpen(false)} />
      <SelfTestResultsDialog
        isOpen={selfTestOpen}
        results={selfTestResults}
        onClose={() => setSelfTestOpen(false)}
      />

      {confirmReset && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm reset"
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-overlay-bg)]"
        >
          <div className="w-[420px] rounded-lg bg-[var(--color-surface)] p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Reset everything?</h3>
            <p className="mb-4 text-xs text-[var(--color-text-tertiary)]">
              This deletes your settings, GitHub/ADO/SQL credentials, and restarts the app. There is no undo.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleResetAll}>
                Reset everything
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
