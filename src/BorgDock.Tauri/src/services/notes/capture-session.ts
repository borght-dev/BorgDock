import { useNotesStore } from '@/stores/notes-store';
import { type CaptureContext, contextRef, withCapture } from './capture';
import { ensureDailyNote } from './daily';

/** One capture, updated in place while preserving everything else in the daily note. */
export function createCaptureSession() {
  const id = crypto.randomUUID();
  const at = new Date();
  let path: string | null = null;
  let previous: string | null = null;
  let pending = Promise.resolve<string | null>(null);
  return (text: string, context: CaptureContext | null) => {
    const write = async () => {
      if (!text.trim() && previous === null) return null;
      path ??= await ensureDailyNote();
      const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const ref = context ? ` · ${contextRef(context)}` : '';
      const block = `<!-- borgdock:capture ${id} -->
- ${time}${ref}

${text}
<!-- /borgdock:capture ${id} -->`;
      if (previous?.replaceAll('\r\n', '\n') === block) return path;
      let persisted = block;
      const written = await useNotesStore.getState().update(path, (current) => {
        if (current === null) throw new Error("Today's note no longer exists.");
        const nl = current.includes('\r\n') ? '\r\n' : '\n';
        persisted = block.replace(/\r?\n/g, nl);
        if (previous === null) {
          const closing = [...current.matchAll(/^<!-- \/borgdock:capture [\w-]+ -->/gm)].at(-1);
          if (closing) {
            const end = closing.index + closing[0].length;
            return current.slice(0, end) + nl + persisted + current.slice(end);
          }
          return withCapture(current, block.split('\n'));
        }
        if (!current.includes(previous)) {
          throw new Error(
            'This capture changed on disk. Your text is still here. Copy it before starting a new note.',
          );
        }
        return current.replace(previous, () => persisted);
      });
      if (!written) throw new Error("Today's note could not be written.");
      previous = persisted;
      return path;
    };
    pending = pending.catch(() => null).then(write);
    return pending;
  };
}
