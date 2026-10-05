import {
  isGeneratedPath,
  reviewFolderOf,
  reviewFolderSummary,
  reviewProgress,
} from '@/services/quick-review';

export function QuickReviewFolders({
  files,
  reviewed,
  onFileSelect,
}: {
  onFileSelect?: (path: string) => void;
  files: readonly string[] | null;
  reviewed: readonly string[];
}) {
  if (files === null) {
    return (
      <section className="qr-files" aria-label="Files by folder">
        <h4>Files by folder</h4>
        <p className="qr-muted" role="status">
          Loading changed files…
        </p>
      </section>
    );
  }
  const progress = reviewProgress(files, reviewed);
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
      <h4>
        Files by folder
        <span className="qr-left" data-quick-review-left="">
          {progress.left} of {progress.toReview} to review, {progress.generated} generated
        </span>
      </h4>
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
