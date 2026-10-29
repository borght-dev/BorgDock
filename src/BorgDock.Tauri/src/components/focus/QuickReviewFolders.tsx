import type { ReactNode } from 'react';
import { isGeneratedPath, reviewFolderOf, reviewFolderSummary } from '@/services/quick-review';

export function QuickReviewFolders({
  files,
  failed,
  onRetry,
  reviewed,
  scope,
  onFileSelect,
}: {
  onFileSelect?: (path: string) => void;
  /** Changed file paths; `null` while they load or when they failed to load. */
  files: readonly string[] | null;
  /** The files failed to load. */
  failed?: boolean;
  onRetry?: () => void;
  reviewed: readonly string[];
  /** The PR's size, on the line under the heading. */
  scope?: ReactNode;
}) {
  const heading = (
    <h4>
      Files by folder
      {scope && <span className="qr-left">{scope}</span>}
    </h4>
  );
  if (files === null) {
    return (
      <section className="qr-files" aria-label="Files by folder">
        {heading}
        {failed ? (
          <p className="qr-muted" role="status">
            Couldn't load files
            {onRetry && (
              <>
                {' · '}
                <button type="button" className="qr-link" onClick={onRetry}>
                  Retry
                </button>
              </>
            )}
          </p>
        ) : (
          <p className="qr-muted" role="status">
            Loading changed files…
          </p>
        )}
      </section>
    );
  }
  const done = new Set(reviewed);
  const pathsByFolder = new Map<string, string[]>();
  for (const path of files) {
    const key = isGeneratedPath(path) ? '' : reviewFolderOf(path);
    const paths = pathsByFolder.get(key) ?? [];
    paths.push(path);
    pathsByFolder.set(key, paths);
  }
  return (
    <section className="qr-files" aria-label="Files by folder">
      {heading}
      {files.length === 0 ? (
        <p className="qr-muted">No changed files in this PR.</p>
      ) : (
        <div className="qr-folder-groups">
          {reviewFolderSummary(files).map((entry) => {
            const paths = pathsByFolder.get(entry.generated ? '' : entry.folder) ?? [];
            return (
              <details
                key={entry.generated ? '' : entry.folder}
                data-generated={entry.generated || undefined}
              >
                <summary title={entry.folder}>
                  <span>
                    {entry.generated
                      ? 'Generated'
                      : entry.folder === '/'
                        ? 'Repository root'
                        : entry.folder.split('/').slice(-2).join('/')}
                  </span>
                  <b>{entry.count}</b>
                </summary>
                <ul>
                  {paths.map((path) => (
                    <li key={path}>
                      <button
                        type="button"
                        title={path}
                        aria-label={path}
                        onClick={() => onFileSelect?.(path)}
                        disabled={!onFileSelect}
                      >
                        <span aria-hidden>{done.has(path) ? '✓' : '○'}</span>
                        <span>{path.split('/').pop()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
