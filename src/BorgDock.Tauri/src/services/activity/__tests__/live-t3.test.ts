import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DispatchHost } from '@/services/dispatch/hosts';
import { toAgentThread } from '@/services/dispatch/sync';
import type { T3Snapshot } from '@/services/t3/api';
import { t3Facts } from '../adapters/t3';
import { deriveT3 } from '../derive/t3';
import { context, seedContext } from './context';

/**
 * A replay of the real local T3 shell, read-only and opt-in:
 *
 *   BORGDOCK_T3_DUMP=<file> cargo test --lib t3::commands::tests::live -- --ignored --nocapture
 *   LIVE_SHELL=<file> bunx vitest run src/services/activity/__tests__/live-t3.test.ts
 */
const file = process.env.LIVE_SHELL;
const HOST = { id: 'local', label: 'This laptop' } as DispatchHost;

describe.skipIf(!file)('the T3 derivation on the real shell', () => {
  const snapshot = file ? (JSON.parse(readFileSync(file, 'utf8')) as T3Snapshot) : null;
  const threads = (snapshot?.threads ?? []).map((thread) =>
    toAgentThread(HOST, thread, 'slot', undefined),
  );
  const facts = t3Facts(HOST, threads);
  const observation = {
    hostId: 'local',
    hostLabel: 'This laptop',
    threads: facts,
    complete: true,
    seenInT3: true,
  };

  it('reads a run for the threads that have one, and seeds quietly', () => {
    expect(facts.length).toBe(threads.length);
    expect(facts.filter((fact) => fact.runId).length).toBeGreaterThan(0);
    const seed = deriveT3(seedContext(), null, observation);
    expect(seed.entries).toEqual([]);
    expect(Object.keys(seed.baseline.threads).length).toBeGreaterThan(0);
  });

  it('adds nothing when the same shell is read again', () => {
    const { baseline } = deriveT3(seedContext(), null, observation);
    const again = deriveT3(context(), baseline, observation);
    expect(again.entries).toEqual([]);
    expect(again.resolutions).toEqual([]);
  });

  it('survives its own baseline as JSON, the way the store keeps it', () => {
    const { baseline } = deriveT3(seedContext(), null, observation);
    const restored = JSON.parse(JSON.stringify(baseline));
    expect(deriveT3(context({ coverage: 'catch-up' }), restored, observation).entries).toEqual([]);
  });
});
