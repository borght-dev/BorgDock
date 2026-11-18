import { useNotesStore } from '@/stores/notes-store';
import { useSettingsStore } from '@/stores/settings-store';
import {
  dailyPath,
  dayKey,
  OBSIDIAN_DAILY_FOLDER,
  OBSIDIAN_TEMPLATES_FOLDER,
  TEMPLATES_FOLDER,
} from './paths';
import { fillTemplate } from './text-edits';

const DAILY_TEMPLATE = `${TEMPLATES_FOLDER}/Daily.md`;

function dailyTitle(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export async function ensureDailyNote(date = new Date()): Promise<string> {
  const state = useNotesStore.getState();
  const { dailyNoteFolder } = useSettingsStore.getState().settings;
  const path = dailyPath(date, state.folders, state.texts, dailyNoteFolder);
  if (state.texts[path] !== undefined) return path;

  const template = path.startsWith(`${OBSIDIAN_DAILY_FOLDER}/`)
    ? state.texts[`${OBSIDIAN_TEMPLATES_FOLDER}/Daily Note.md`]
    : state.texts[DAILY_TEMPLATE];
  const title = dailyTitle(date);
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const text = template
    ? fillTemplate(template, { date: dayKey(date), time, title })
    : `# ${title}`;
  await state.update(path, (current) => (current === null ? `${text.trimEnd()}\n\n` : null));
  return path;
}
