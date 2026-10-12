import { beforeEach, describe, expect, it, vi } from 'vitest';

const t3 = vi.hoisted(() => ({ t3LaunchThread: vi.fn(), t3ShowThread: vi.fn() }));
const sync = vi.hoisted(() => ({ syncAll: vi.fn(), dispatchAdoClient: vi.fn() }));
const items = vi.hoisted(() => ({ moveItemState: vi.fn(), assignItemToMe: vi.fn() }));

vi.mock('@/services/t3/api', () => ({ LOCAL_T3_HOST_ID: 'local', ...t3 }));
vi.mock('../sync', () => ({
  ...sync,
  configuredHosts: () => [
    { id: 'local', label: 'This machine' },
    { id: 'mac', label: 'Mac', baseUrl: 'http://mac:3773' },
  ],
  rawId: (hostId: string, id: string) =>
    hostId !== 'local' && id.startsWith(`${hostId}:`) ? id.slice(hostId.length + 1) : id,
  scopedId: (hostId: string, id: string) => (hostId === 'local' ? id : `${hostId}:${id}`),
}));
vi.mock('../items', () => items);

import type { T3Catalogue } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import {
  branchName,
  configuredPrompts,
  DEFAULT_LAUNCH_PROMPTS,
  type LaunchModel,
  lastSlotOf,
  launchModels,
  launchPrompt,
  PLAN_FIRST,
  preferredModel,
  type StartRequest,
  startThread,
  stateOnStart,
} from '../launch';
import type { Slot } from '../types';
import { makeItem, makeThread } from './fixtures';

const CATALOGUE: T3Catalogue = {
  environmentId: 'env-1',
  providers: [
    {
      instanceId: 'codex',
      driver: 'codex',
      displayName: 'Codex',
      models: [
        {
          slug: 'default',
          name: 'Default',
          isDefault: true,
          options: [
            {
              id: 'reasoningEffort',
              label: 'Reasoning',
              kind: 'select',
              choices: [
                { id: 'medium', label: 'Medium', isDefault: true },
                { id: 'high', label: 'High', isDefault: false },
              ],
            },
            { id: 'fastMode', label: 'Fast mode', kind: 'boolean', choices: [] },
          ],
        },
      ],
    },
    {
      instanceId: 'claudeAgent',
      driver: 'claudeAgent',
      displayName: 'Claude',
      models: [
        {
          slug: 'opus',
          name: 'Opus',
          isDefault: true,
          options: [
            {
              id: 'contextWindow',
              label: 'Context',
              kind: 'select',
              choices: [
                { id: '200k', label: '200k', isDefault: true },
                { id: '1m', label: '1M', isDefault: false },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const NOW = Date.parse('2026-10-12T12:00:00Z');

function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: 'p-w4',
    hostId: 'local',
    hostLabel: 'This machine',
    available: true,
    name: 'W4',
    workspaceRoot: '/work/W4',
    state: 'free',
    itemId: null,
    running: false,
    needsYou: false,
    ...overrides,
  };
}

describe('branchName', () => {
  it('prefixes by type and keeps four title words', () => {
    expect(
      branchName({ id: 60201, typeName: 'Bug', title: 'Search ignores accents in customer names' }),
    ).toBe('fix/60201-search-ignores-accents-customer');
    expect(
      branchName({
        id: 59877,
        typeName: 'Product Backlog Item',
        title: 'Show technician availability on the planning board',
      }),
    ).toBe('feat/59877-show-technician-availability-planning');
    expect(branchName({ id: 60150, typeName: 'Task', title: 'Upgrade the report renderer' })).toBe(
      'chore/60150-upgrade-report-renderer',
    );
  });

  it('leaves long numbers out of the name', () => {
    expect(branchName({ id: 1, typeName: 'Bug', title: 'Follow-up to 59403 on assets' })).toBe(
      'fix/1-follow-up-assets',
    );
  });
});

describe('launchPrompt', () => {
  const item = { id: 60201, typeName: 'Bug', title: 'Search ignores accents' };

  it('fills the item into the pickup template and asks for a plan first', () => {
    const prompt = launchPrompt('plan', item, 'fix/60201-search', DEFAULT_LAUNCH_PROMPTS);
    expect(prompt).toMatch(/^Pick up AB#60201: Search ignores accents/);
    expect(prompt).toContain('branch fix/60201-search');
    expect(prompt.endsWith(PLAN_FIRST)).toBe(true);
  });

  it('goes straight to work without the plan line', () => {
    expect(launchPrompt('work', item, 'b', DEFAULT_LAUNCH_PROMPTS)).not.toContain(PLAN_FIRST);
  });

  it('uses the QA and Done templates for a handoff', () => {
    expect(launchPrompt('qa', item, 'b', DEFAULT_LAUNCH_PROMPTS)).toMatch(/^Bring AB#60201/);
    expect(launchPrompt('done', item, 'b', DEFAULT_LAUNCH_PROMPTS)).toMatch(/^Close AB#60201/);
  });

  it('prefers the templates from Settings and falls back per template', () => {
    const prompts = configuredPrompts({ pickup: 'Do {id} on {branch}', qa: '  ' });
    expect(launchPrompt('work', item, 'b', prompts)).toBe('Do 60201 on b');
    expect(prompts.qa).toBe(DEFAULT_LAUNCH_PROMPTS.qa);
  });
});

describe('stateOnStart', () => {
  it('moves a proposed item to its in-progress state', () => {
    expect(stateOnStart(makeItem({ id: 1, state: 'New' }))).toBe('Development In Progress');
  });

  it('leaves an item that is under way alone', () => {
    expect(stateOnStart(makeItem({ id: 1, state: 'Development In Progress' }))).toBeNull();
  });

  it('takes the first in-progress state of a workflow it does not know', () => {
    const states = [
      { name: 'Proposed', category: 'Proposed' as const },
      { name: 'Doing', category: 'InProgress' as const },
    ];
    expect(stateOnStart(makeItem({ id: 1, state: 'Proposed', states }))).toBe('Doing');
  });
});

describe('launchModels', () => {
  it('lists every model with its efforts and the provider in its label', () => {
    const models = launchModels(CATALOGUE, [], NOW);
    expect(models.map((m) => [m.id, m.label, m.defaultEffort])).toEqual([
      ['codex/default', 'Default · Codex', 'medium'],
      ['claudeAgent/opus', 'Opus · Claude', null],
    ]);
    expect(models[1]?.efforts).toEqual([]);
  });

  it('puts the model used last first, with the effort it ran at', () => {
    const threads = [
      makeThread({
        id: 'a',
        model: 'opus',
        modelInstance: 'claudeAgent',
        effort: null,
        lastActivityAt: '2026-10-11T12:00:00Z',
      }),
      makeThread({
        id: 'b',
        model: 'default',
        modelInstance: 'codex',
        effort: 'high',
        lastActivityAt: '2026-10-01T12:00:00Z',
      }),
    ];
    const models = launchModels(CATALOGUE, threads, NOW);
    expect(models.map((m) => [m.id, m.recent])).toEqual([
      ['claudeAgent/opus', true],
      ['codex/default', true],
    ]);
    expect(models[1]?.defaultEffort).toBe('high');
  });

  it('does not call a model recent after two weeks', () => {
    const old = makeThread({
      id: 'a',
      model: 'opus',
      modelInstance: 'claudeAgent',
      lastActivityAt: '2026-09-01T12:00:00Z',
    });
    expect(launchModels(CATALOGUE, [old], NOW)[0]?.id).toBe('codex/default');
  });

  it('builds the selection T3 takes: the effort, and every other option at its default', () => {
    const [codex, claude] = launchModels(CATALOGUE, [], NOW);
    expect(codex?.selection('high')).toEqual({
      instanceId: 'codex',
      model: 'default',
      options: [
        { id: 'reasoningEffort', value: 'high' },
        { id: 'fastMode', value: false },
      ],
    });
    expect(claude?.selection(null).options).toEqual([{ id: 'contextWindow', value: '200k' }]);
  });

  it('preselects the model picked last time when the host still has it', () => {
    const models = launchModels(CATALOGUE, [], NOW);
    expect(preferredModel(models, 'claudeAgent/opus')).toBe('claudeAgent/opus');
    expect(preferredModel(models, 'gone/model')).toBe('codex/default');
    expect(preferredModel([], null)).toBe('');
  });
});

describe('lastSlotOf', () => {
  it('finds the free slot the last thread ran in', () => {
    const threads = [makeThread({ id: 't', projectId: 'p-w4', open: false, status: 'settled' })];
    expect(lastSlotOf(threads, [slot()])?.name).toBe('W4');
    expect(lastSlotOf(threads, [slot({ state: 'busy' })])).toBeUndefined();
    expect(lastSlotOf([], [slot()])).toBeUndefined();
  });
});

describe('startThread', () => {
  const model = launchModels(CATALOGUE, [], NOW)[0] as LaunchModel;
  const request = (overrides: Partial<StartRequest> = {}): StartRequest => ({
    item: makeItem({ id: 60201, title: 'Search ignores accents' }),
    slot: slot(),
    model,
    effort: 'high',
    mode: 'plan',
    prompt: 'Pick up AB#60201',
    moveTo: null,
    assignToMe: false,
    openInT3: false,
    ...overrides,
  });

  beforeEach(() => {
    for (const group of [t3, sync, items]) {
      for (const spy of Object.values(group)) spy.mockReset();
    }
    t3.t3LaunchThread.mockResolvedValue('thread-1');
    sync.dispatchAdoClient.mockReturnValue({});
    useDispatchStore.setState({
      manualLinks: new Map(),
      launchPreferences: { model: null, efforts: {}, mode: 'plan' },
    });
  });

  it('launches on the slot with the item in the title and the plan line in the prompt', async () => {
    const result = await startThread(request());

    expect(t3.t3LaunchThread).toHaveBeenCalledWith(
      { id: 'local', baseUrl: undefined },
      {
        projectId: 'p-w4',
        title: 'AB#60201 Search ignores accents',
        modelSelection: model.selection('high'),
        prompt: `Pick up AB#60201\n\n${PLAN_FIRST}`,
      },
    );
    expect(result).toEqual({ threadId: 'thread-1', warnings: [] });
    expect(sync.syncAll).toHaveBeenCalledWith(true);
  });

  it('links the new thread to the item and remembers the choices', async () => {
    await startThread(request({ mode: 'work' }));

    const store = useDispatchStore.getState();
    expect(store.manualLinks.get('thread-1')).toBe(60201);
    expect(store.launchPreferences).toEqual({
      model: 'codex/default',
      efforts: { 'codex/default': 'high' },
      mode: 'work',
    });
  });

  it('starts on a remote host with the id that host knows', async () => {
    await startThread(request({ slot: slot({ id: 'mac:p-m1', hostId: 'mac', name: 'M1' }) }));

    expect(t3.t3LaunchThread.mock.calls[0]?.[0]).toEqual({
      id: 'mac',
      baseUrl: 'http://mac:3773',
    });
    expect(t3.t3LaunchThread.mock.calls[0]?.[1].projectId).toBe('p-m1');
    expect(useDispatchStore.getState().manualLinks.get('mac:thread-1')).toBe(60201);
  });

  it('moves and assigns in ADO after the thread runs, and reports what failed', async () => {
    items.assignItemToMe.mockResolvedValue(undefined);
    items.moveItemState.mockRejectedValue(new Error('TF401320: a field is required'));

    const result = await startThread(
      request({ moveTo: 'Development In Progress', assignToMe: true }),
    );

    expect(items.assignItemToMe).toHaveBeenCalledWith({}, 60201);
    expect(result.warnings).toEqual(['ADO state not changed: TF401320: a field is required']);
  });

  it('leaves ADO alone unless asked', async () => {
    await startThread(request());
    expect(items.moveItemState).not.toHaveBeenCalled();
    expect(items.assignItemToMe).not.toHaveBeenCalled();
  });

  it('opens T3 on the new thread when asked', async () => {
    t3.t3ShowThread.mockResolvedValue(undefined);
    await startThread(request({ openInT3: true }));
    expect(t3.t3ShowThread).toHaveBeenCalledWith(
      { id: 'local', baseUrl: undefined },
      'thread-1',
      undefined,
    );
  });

  it('refuses an empty message, a busy slot and an offline host before touching T3', async () => {
    await expect(startThread(request({ prompt: '   ' }))).rejects.toThrow('first message is empty');
    await expect(startThread(request({ slot: slot({ state: 'mine' }) }))).rejects.toThrow(
      'already has an open thread',
    );
    await expect(startThread(request({ slot: slot({ available: false }) }))).rejects.toThrow(
      'is offline',
    );
    expect(t3.t3LaunchThread).not.toHaveBeenCalled();
  });
});
