export interface SqlSnippet {
  id: string;
  name: string;
  body: string;
  starred: boolean;
  /** Display string set by the SQL window after a run, e.g. "just now", "2m ago". */
  lastRun: string;
}
