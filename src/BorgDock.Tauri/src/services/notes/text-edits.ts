/**
 * Edits BorgDock makes to a note's text on your behalf: appending under a
 * heading, ticking a task, a block between BorgDock's own markers, links
 * after a rename, templates. Pure; every edit keeps the rest of the text as
 * it was, line endings included.
 */

function newlineOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * `lines` appended at the end of the section under `heading` (any level),
 * which is added at the end of the note when it is missing.
 */
export function appendUnderHeading(text: string, heading: string, lines: string[]): string {
  const nl = newlineOf(text);
  const all = text.length ? text.split(/\r?\n/) : [];
  const wanted = heading.trim().toLowerCase();
  const start = all.findIndex((line) => {
    const match = /^(#{1,6}) +(.+?)\s*$/.exec(line);
    return match ? match[2]!.toLowerCase() === wanted : false;
  });
  if (start < 0) {
    while (all.length && all[all.length - 1]!.trim() === '') all.pop();
    const block = [...(all.length ? [''] : []), `## ${heading}`, ...lines];
    return [...all, ...block, ''].join(nl);
  }
  const level = /^(#{1,6})/.exec(all[start]!)![1]!.length;
  let end = all.length;
  for (let i = start + 1; i < all.length; i++) {
    const match = /^(#{1,6}) /.exec(all[i]!);
    if (match && match[1]!.length <= level) {
      end = i;
      break;
    }
  }
  let insertAt = end;
  while (insertAt > start + 1 && all[insertAt - 1]!.trim() === '') insertAt--;
  const after = all.slice(insertAt);
  const spacer = end < all.length && after[0]?.trim() !== '' ? [''] : [];
  return [...all.slice(0, insertAt), ...lines, ...spacer, ...after].join(nl);
}

/**
 * The task reading `task` set to `done`: the one on `line` when it is still
 * there, else the first task with that text, since lines move when the file
 * changes. `null` when there is no such task or it is already in that state.
 */
export function setTask(text: string, line: number, task: string, done: boolean): string | null {
  const nl = newlineOf(text);
  const all = text.split(/\r?\n/);
  const match = (i: number) => {
    const m = /^(\s*[-*+] \[)([ xX])(\] )(.*)$/.exec(all[i] ?? '');
    return m && m[4]!.trim() === task ? m : null;
  };
  const at = match(line) ? line : all.findIndex((_, i) => match(i));
  const found = at < 0 ? null : match(at);
  if (!found) return null;
  const next = `${found[1]}${done ? 'x' : ' '}${found[3]}${found[4]}`;
  if (next === all[at]) return null;
  all[at] = next;
  return all.join(nl);
}

const markerStart = (id: string) => `<!-- borgdock:${id} -->`;
const markerEnd = (id: string) => `<!-- /borgdock:${id} -->`;

/** Whether the note already holds BorgDock's block `id`. */
export function hasMarkerBlock(text: string, id: string): boolean {
  return text.includes(markerStart(id));
}

/** `body` wrapped in BorgDock's markers for block `id`. */
export function markerBlock(id: string, body: string[]): string[] {
  return [markerStart(id), ...body, markerEnd(id)];
}

/**
 * `[[Old]]`, `[[Old#heading]]` and `[[Old|label]]` pointed at `newTitle`.
 * Links that name the old note by path (`[[Folder/Old]]`) move too.
 */
export function renameLinks(text: string, oldTarget: string[], newTitle: string): string {
  const names = new Set(oldTarget.map((t) => t.toLowerCase()));
  return text.replace(
    /\[\[([^\]\n|#]+)((?:#[^\]\n|]+)?(?:\|[^\]\n]+)?)\]\]/g,
    (whole, target: string, rest: string) =>
      names.has(target.trim().toLowerCase()) ? `[[${newTitle}${rest}]]` : whole,
  );
}

export interface TemplateValues {
  date: string;
  time: string;
  title: string;
}

/** `{{date}}`, `{{time}}` and `{{title}}` filled in. */
export function fillTemplate(template: string, values: TemplateValues): string {
  return template.replace(
    /\{\{\s*(date|time|title)\s*\}\}/g,
    (_m, key: keyof TemplateValues) => values[key],
  );
}

/** The text without a frontmatter block, for templates inserted mid-note. */
export function withoutFrontmatter(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return text;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  return end < 0 ? text : lines.slice(end + 1).join(newlineOf(text));
}
