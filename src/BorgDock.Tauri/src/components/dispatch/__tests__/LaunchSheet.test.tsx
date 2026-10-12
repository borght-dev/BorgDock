import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const launch = vi.hoisted(() => ({ startThread: vi.fn() }));
const t3 = vi.hoisted(() => ({ t3Catalogue: vi.fn() }));

vi.mock('@/services/dispatch/launch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/dispatch/launch')>()),
  startThread: launch.startThread,
}));
vi.mock('@/services/t3/api', () => ({ LOCAL_T3_HOST_ID: 'local', ...t3 }));
vi.mock('@/services/dispatch/sync', () => ({ syncAll: vi.fn(), dispatchAdoClient: vi.fn() }));

import { PLAN_FIRST } from '@/services/dispatch/launch';
import { useDispatchStore } from '@/stores/dispatch-store';
import { LAUNCH_CATALOGUE, makeDispatchScene } from '../__fixtures__/dispatch-data';
import { clearCatalogueCache, LaunchSheet } from '../LaunchSheet';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function renderSheet(itemId = 60201, slotId?: string) {
  const scene = makeDispatchScene(NOW);
  useDispatchStore.setState({
    threads: scene.threads,
    overview: scene.overview,
    launch: { itemId, slotId },
    launchPreferences: { model: null, efforts: {}, mode: 'plan' },
  });
  render(<LaunchSheet intent={{ itemId, slotId }} overview={scene.overview} />);
  return scene;
}

/** The models arrive from T3 after the sheet opens. */
async function modelsLoaded() {
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' })).not.toHaveValue(''));
}

describe('LaunchSheet', () => {
  beforeEach(() => {
    clearCatalogueCache();
    launch.startThread.mockReset();
    t3.t3Catalogue.mockReset();
    t3.t3Catalogue.mockResolvedValue(LAUNCH_CATALOGUE);
  });

  it('opens on the first free slot with a plan-first pickup prompt', async () => {
    renderSheet();
    await modelsLoaded();

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Start AB#60201 in T3');
    expect(screen.getByRole('button', { name: 'W4, free' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const prompt = screen.getByRole('textbox', { name: 'First message' }) as HTMLTextAreaElement;
    expect(prompt.value).toMatch(/^Pick up AB#60201: Search ignores accents in customer names/);
    expect(prompt.value.endsWith(PLAN_FIRST)).toBe(true);
    expect(screen.getByRole('radio', { name: 'A plan for me to approve' })).toBeChecked();
  });

  it('preselects the slot an item was dropped on', async () => {
    renderSheet(60201, 'p-w8');
    await modelsLoaded();
    expect(screen.getByRole('button', { name: 'W8, free' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('only lets a free slot be picked', async () => {
    renderSheet();
    await modelsLoaded();

    expect(screen.getByRole('button', { name: /^W3, AB#60214/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'W6, free' }));
    expect(screen.getByRole('button', { name: 'W6, free' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'codex/default' },
    });
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
      slot: { name: 'W4' },
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
    launch.startThread.mockRejectedValue(new Error('W4 already has an open thread.'));
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
