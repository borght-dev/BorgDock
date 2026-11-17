import { beforeEach, expect, it } from 'vitest';
import { setNotesStorage, useNotesStore } from '@/stores/notes-store';
import { createCaptureSession } from '../capture-session';
import { dailyPath } from '../paths';
import { memoryNotesStorage } from '../storage';

let vault: ReturnType<typeof memoryNotesStorage>;
beforeEach(async () => {
  vault = memoryNotesStorage({});
  setNotesStorage(vault);
  useNotesStore.setState({ buffers: {}, conflicts: {} });
  await useNotesStore.getState().load(null);
});

it('serializes overlapping saves and preserves unrelated disk edits', async () => {
  const save = createCaptureSession();
  const [path] = await Promise.all([save('First', null), save('Second', null)]);
  expect(path).not.toBeNull();
  const disk = vault.files.get(path!)!;
  vault.files.set(path!, { ...disk, text: `${disk.text}\nExternal edit\n` });
  await save('Final $& value', null);
  const text = vault.files.get(path!)!.text;
  expect(text).toContain('Final $& value');
  expect(text).toContain('External edit');
  expect(text).not.toContain('Second');
  expect(text.match(/<!-- borgdock:capture /g)).toHaveLength(1);
});

it('refuses to overwrite a capture edited externally', async () => {
  const save = createCaptureSession();
  const path = (await save('Mine', null))!;
  const disk = vault.files.get(path)!;
  vault.files.set(path, { ...disk, text: disk.text.replace('Mine', 'Theirs') });
  await expect(save('New draft', null)).rejects.toThrow('changed on disk');
  expect(vault.files.get(path)!.text).toContain('Theirs');
});

it('does not create an empty daily note', async () => {
  expect(await createCaptureSession()('', null)).toBeNull();
  expect(vault.files.size).toBe(0);
});

it('keeps autosaving into an existing CRLF daily note', async () => {
  const path = dailyPath(new Date());
  vault.files.set(path, { text: '# Today\r\n\r\n## Captured\r\n', modifiedMs: 1 });
  await useNotesStore.getState().load(null);
  const save = createCaptureSession();
  await save('First', null);
  await save('Second', null);
  const text = vault.files.get(path)!.text;
  expect(text).toContain('Second');
  expect(text).not.toContain('First');
  expect(text.replaceAll('\r\n', '')).not.toContain('\n');
});

it('keeps successive captures separate when an earlier one contains headings', async () => {
  const first = createCaptureSession();
  const path = (await first('# Hello\n\nFirst', null))!;
  await createCaptureSession()('Second', null);
  await first('# Hello\n\nRevised', null);
  const text = vault.files.get(path)!.text;
  expect(text).toContain('Revised');
  expect(text).toContain('Second');
  expect(
    [...text.matchAll(/<!-- (\/?)borgdock:capture [^>]+ -->/g)].map((match) => match[1]),
  ).toEqual(['', '/', '', '/']);
});
