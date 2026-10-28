import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const launch = vi.hoisted(() => ({ startThread: vi.fn() }));
const t3 = vi.hoisted(() => ({ t3Catalogue: vi.fn(), t3ListBranches: vi.fn() }));

vi.mock('@/services/dispatch/launch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/dispatch/launch')>()),
  startThread: launch.startThread,
}));
vi.mock('@/services/t3/api', () => ({ LOCAL_T3_HOST_ID: 'local', ...t3 }));
vi.mock('@/services/dispatch/sync', () => ({ syncAll: vi.fn(), dispatchAdoClient: vi.fn() }));

import { PLAN_FIRST } from '@/services/dispatch/launch';
import { type RememberedTarget, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { LAUNCH_CATALOGUE, makeDispatchScene } from '../__fixtures__/dispatch-data';
import { clearCatalogueCache, LaunchSheet } from '../LaunchSheet';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function renderSheet(itemId = 60201, target: RememberedTarget | null = null) {
  const scene = makeDispatchScene(NOW);
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: {
      ...settings,
      agents: {
        ...settings.agents,
        t3Hosts: [{ id: 'mac', label: 'Mac', baseUrl: 'http://mac:3773' }],
      } as typeof settings.agents,
    },
  });
  useDispatchStore.setState({
    threads: scene.threads,
    projects: scene.projects,
    hosts: scene.hosts,
    overview: scene.overview,
    launch: { itemId },
    launchPreferences: { model: null, efforts: {}, mode: 'plan', target },
  });
  render(<LaunchSheet intent={{ itemId }} overview={scene.overview} />);
  return scene;
}

/** The models arrive from T3 after the sheet opens. */
async function modelsLoaded() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Model' })).toBeEnabled());
}

describe('LaunchSheet', () => {
  beforeEach(() => {
    clearCatalogueCache();
    launch.startThread.mockReset();
    t3.t3Catalogue.mockReset();
    t3.t3Catalogue.mockResolvedValue(LAUNCH_CATALOGUE);
    t3.t3ListBranches.mockReset();
    t3.t3ListBranches.mockResolvedValue([
      { name: 'main', isDefault: true, isRemote: false },
      { name: 'release/4.7', isDefault: false, isRemote: false },
    ]);
  });

  it('opens on a new worktree here, from the default branch, with a plan-first pickup prompt', async () => {
    renderSheet();
    await modelsLoaded();

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Start AB#60201 in T3');
    expect(screen.getByRole('radio', { name: /^This machine/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Project' })).toHaveTextContent('shop');
    expect(screen.getByRole('button', { name: 'New worktree' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start from' })).toHaveTextContent('main'),
    );
    expect(t3.t3ListBranches).toHaveBeenCalledWith(
      { id: 'local', baseUrl: undefined },
      '/work/shop',
    );
    const prompt = screen.getByRole('textbox', { name: 'First message' }) as HTMLTextAreaElement;
    expect(prompt.value).toMatch(/^Pick up AB#60201: Search ignores accents in customer names/);
    expect(prompt.value.endsWith(PLAN_FIRST)).toBe(true);
    expect(screen.getByRole('radio', { name: 'A plan for me to approve' })).toBeChecked();
  });

  it('starts where the last launch went', async () => {
    renderSheet(60201, { hostId: 'mac', repository: 'github.com/acme/shop' });
    await modelsLoaded();
    expect(screen.getByRole('radio', { name: /^Mac/ })).toBeChecked();
    expect(t3.t3Catalogue).toHaveBeenCalledWith({ id: 'mac', baseUrl: 'http://mac:3773' });
  });

  it('hands QA back to the thread that did the work, to continue it', async () => {
    launch.startThread.mockResolvedValue({ threadId: 't-60102', warnings: [] });
    renderSheet(60102);

    fireEvent.click(screen.getByRole('radio', { name: 'Update for QA' }));
    expect(screen.getByRole('button', { name: 'Existing thread' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Thread' })).toHaveTextContent(
      'AB#60102 CSV export drops the last column',
    );
    expect(screen.getByRole('button', { name: 'Continue it' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // A continued thread keeps its model, so none is asked for.
    expect(screen.queryByRole('button', { name: 'Model' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start in background' }));

    await waitFor(() => expect(launch.startThread).toHaveBeenCalledTimes(1));
    expect(launch.startThread.mock.calls[0]?.[0]).toMatchObject({
      target: { kind: 'continue', thread: { id: 't-60102' } },
      model: undefined,
      mode: 'qa',
    });
  });

  it('starts a thread still at work only next to it, in its checkout', async () => {
    renderSheet(60031);
    await modelsLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Existing thread' }));
    expect(screen.getByRole('button', { name: 'Thread' })).toHaveTextContent('AB#60031');
    expect(screen.queryByRole('button', { name: 'Continue it' })).not.toBeInTheDocument();
    expect(screen.getByText(/still at work, so a new thread starts/)).toBeInTheDocument();
  });

  it('rewrites the first message when the way of beginning changes', async () => {
    renderSheet();
    await modelsLoaded();

    fireEvent.click(screen.getByRole('radio', { name: 'Update for QA' }));
    const prompt = screen.getByRole('textbox', { name: 'First message' }) as HTMLTextAreaElement;
    expect(prompt.value).toMatch(/^Bring AB#60201 up to date for QA/);
    expect(screen.queryByRole('checkbox', { name: /Move ADO/ })).not.toBeInTheDocument();
  });

  it('starts in the background with what the sheet shows', async () => {
    launch.startThread.mockResolvedValue({ threadId: 't-new', warnings: [] });
    const scene = renderSheet();
    await modelsLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Model' }));
    fireEvent.click(screen.getByRole('option', { name: /^Default/ }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Reasoning effort' })).getByRole('button', {
        name: 'High',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start in background' }));

    await waitFor(() => expect(launch.startThread).toHaveBeenCalledTimes(1));
    const request = launch.startThread.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      item: scene.items.find((i) => i.id === 60201),
      target: { kind: 'worktree', hostId: 'local', project: { id: 'p-w0' }, baseRef: 'main' },
      model: { id: 'codex/default' },
      effort: 'high',
      mode: 'plan',
      moveTo: 'Development In Progress',
      assignToMe: false,
      openInT3: false,
    });
    await waitFor(() => expect(useDispatchStore.getState().launch).toBeNull());
    expect(useDispatchStore.getState().selectedItemId).toBe(60201);
  });

  it('leaves ADO alone when its box is unticked, and opens T3 when asked', async () => {
    launch.startThread.mockResolvedValue({ threadId: 't-new', warnings: [] });
    renderSheet();
    await modelsLoaded();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Move ADO to Development In Progress' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start and open T3' }));

    await waitFor(() => expect(launch.startThread).toHaveBeenCalledTimes(1));
    expect(launch.startThread.mock.calls[0]?.[0]).toMatchObject({ moveTo: null, openInT3: true });
  });

  it('keeps the sheet open when the start fails', async () => {
    launch.startThread.mockRejectedValue(new Error('T3 no longer lists that project'));
    renderSheet();
    await modelsLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Start in background' }));

    await waitFor(() => expect(launch.startThread).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useDispatchStore.getState().launch).not.toBeNull();
  });

  it('cannot start while T3 has not listed its models', () => {
    t3.t3Catalogue.mockReturnValue(new Promise(() => {}));
    renderSheet();
    expect(screen.getByRole('button', { name: 'Start in background' })).toBeDisabled();
  });
});
