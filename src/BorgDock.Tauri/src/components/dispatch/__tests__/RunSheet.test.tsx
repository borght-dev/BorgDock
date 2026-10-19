import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const t3 = vi.hoisted(() => ({ t3Catalogue: vi.fn() }));

vi.mock('@/services/t3/api', () => ({ LOCAL_T3_HOST_ID: 'local', ...t3 }));
vi.mock('@/services/dispatch/sync', () => ({ syncAll: vi.fn(), dispatchAdoClient: vi.fn() }));

import type { T3Catalogue } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { makeDispatchScene } from '../__fixtures__/dispatch-data';
import { clearCatalogueCache } from '../LaunchChoice';
import { RunSheet } from '../RunSheet';

const NOW = Date.parse('2026-10-12T12:00:00Z');

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

/** Two accounts, one model with six reasoning levels. */
const CATALOGUE: T3Catalogue = {
  environmentId: 'env-local',
  providers: [
    {
      instanceId: 'outlook',
      driver: 'codex',
      displayName: 'Outlook',
      models: [
        {
          slug: 'sol',
          name: 'Sol',
          isDefault: true,
          options: [
            {
              id: 'reasoningEffort',
              label: 'Reasoning',
              kind: 'select',
              choices: EFFORTS.map((id) => ({
                id,
                label: id === 'xhigh' ? 'Extra High' : id[0]!.toUpperCase() + id.slice(1),
                isDefault: id === 'high',
              })),
            },
          ],
        },
      ],
    },
    {
      instanceId: 'gomocha',
      driver: 'claudeAgent',
      displayName: 'Gomocha',
      models: [
        { slug: 'opus', name: 'Opus', isDefault: true, options: [] },
        { slug: 'sonnet', name: 'Sonnet', isDefault: false, options: [] },
      ],
    },
  ],
};

function renderSheet() {
  const scene = makeDispatchScene(NOW);
  useDispatchStore.setState({
    threads: [],
    overview: scene.overview,
    runSheet: { kind: 'sync', scope: { kind: 'all' } },
    launchPreferences: { model: null, efforts: {}, mode: 'plan' },
  });
  render(<RunSheet intent={{ kind: 'sync', scope: { kind: 'all' } }} overview={scene.overview} />);
  return scene;
}

async function modelsLoaded() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Model' })).toBeEnabled());
}

const ids = (group: HTMLElement) =>
  within(group)
    .getAllByRole('checkbox')
    .slice(1)
    .map((box) => Number(box.closest('label')?.querySelector('em')?.textContent));

describe('RunSheet', () => {
  beforeEach(() => {
    clearCatalogueCache();
    t3.t3Catalogue.mockReset();
    t3.t3Catalogue.mockResolvedValue(CATALOGUE);
  });

  it('groups the items by the state each one moves to, the checks last', async () => {
    renderSheet();
    await modelsLoaded();
    const groups = screen
      .getAllByRole('region')
      .map((group) => group.getAttribute('aria-label'))
      .filter((label) => label?.startsWith('→') || label === 'No move suggested');
    expect(groups).toEqual(['→ Code Review', '→ Ready For QA', 'No move suggested']);
    expect(ids(screen.getByRole('region', { name: '→ Ready For QA' }))).toEqual([59403]);
    expect(
      within(screen.getByRole('region', { name: '→ Ready For QA' })).getByText(
        'PR 3668 is merged. ADO still says Code Review.',
      ),
    ).toBeInTheDocument();
  });

  it('picks or drops a whole group with its checkbox', async () => {
    renderSheet();
    await modelsLoaded();
    const checks = screen.getByRole('region', { name: 'No move suggested' });
    const groupBox = within(checks).getByRole('checkbox', {
      name: 'Pick every item in No move suggested',
    });
    fireEvent.click(groupBox);
    const boxes = within(checks).getAllByRole('checkbox').slice(1);
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(groupBox);
    expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText('2 of 20 selected')).toBeInTheDocument();
  });

  it('offers six reasoning levels as buttons and names the pick in the footer', async () => {
    renderSheet();
    await modelsLoaded();
    const levels = within(screen.getByRole('group', { name: 'Reasoning effort' })).getAllByRole(
      'button',
    );
    expect(levels.map((level) => level.textContent)).toEqual([
      'Low',
      'Medium',
      'High',
      'Extra High',
      'Max',
      'Ultra',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(screen.getByRole('button', { name: 'Max' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Sol · Outlook · Max');
  });

  it('picks a model by account, and its Esc leaves the sheet open', async () => {
    renderSheet();
    await modelsLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Model' }));
    const list = screen.getByRole('listbox', { name: 'Model' });
    expect(within(list).getByRole('group', { name: 'Gomocha' })).toHaveTextContent('OpusSonnet');

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter model' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(useDispatchStore.getState().runSheet).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Model' }));
    fireEvent.click(screen.getByRole('option', { name: 'Sonnet' }));
    expect(screen.getByRole('button', { name: 'Model' })).toHaveTextContent('SonnetGomocha');
    expect(screen.queryByRole('group', { name: 'Reasoning effort' })).not.toBeInTheDocument();
  });
});
