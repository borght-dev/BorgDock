import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@/types/settings';

const { folderPath, list, open } = vi.hoisted(() => ({
  folderPath: vi.fn(),
  list: vi.fn(),
  open: vi.fn(),
}));

vi.mock('@/services/notes/storage', () => ({
  nativeNotesStorage: { folderPath, list },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open }));

import { NotesSettingsSection } from '../NotesSettingsSection';

const settings = { repos: [], azureDevOps: {} } as unknown as AppSettings;

beforeEach(() => {
  folderPath.mockReset();
  list.mockReset();
  open.mockReset();
  folderPath.mockImplementation((folder: string | null) =>
    Promise.resolve(folder ? `${folder}/BorgDock Notes` : 'C:/AppData/BorgDock/notes'),
  );
  list.mockResolvedValue({ notes: [], folders: ['02 - Daily'] });
});

describe('NotesSettingsSection', () => {
  it('shows this machine’s vault and moves it to the folder you pick', async () => {
    open.mockResolvedValue('C:/Sync');
    const onChange = vi.fn();
    render(<NotesSettingsSection settings={settings} onChange={onChange} />);

    expect(await screen.findByText('C:/AppData/BorgDock/notes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'This machine only' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use a sync folder…' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ notesSyncFolder: 'C:/Sync' }));
  });

  it('changes nothing when the folder dialog is cancelled', async () => {
    open.mockResolvedValue(null);
    const onChange = vi.fn();
    render(<NotesSettingsSection settings={settings} onChange={onChange} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Use a sync folder…' }));
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the vault inside the sync folder and goes back to this machine', async () => {
    const onChange = vi.fn();
    render(
      <NotesSettingsSection
        settings={{ ...settings, notesSyncFolder: 'C:/Sync' }}
        onChange={onChange}
      />,
    );

    expect(await screen.findByText('C:/Sync/BorgDock Notes')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith('C:/Sync');
    fireEvent.click(screen.getByRole('button', { name: 'This machine only' }));
    expect(onChange).toHaveBeenCalledWith({ notesSyncFolder: undefined });
  });

  it('saves the daily note folder', async () => {
    const onChange = vi.fn();
    render(<NotesSettingsSection settings={settings} onChange={onChange} />);

    const select = await screen.findByRole('combobox', { name: 'Daily note folder' });
    fireEvent.change(select, { target: { value: '02 - Daily' } });
    expect(onChange).toHaveBeenCalledWith({ dailyNoteFolder: '02 - Daily' });
  });
});
