import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCachedTabData } from '@/hooks/useCachedTabData';
import { getCommitFiles, getPRCommits, getPRFiles } from '@/services/github';
import { getClient } from '@/services/github/singleton';
import type {
  DiffFile,
  DiffViewMode,
  FileStatusFilter,
  PullRequestCommit,
  PullRequestFileChange,
} from '@/types';
import { DiffFileSection } from './diff/DiffFileSection';
import { DiffFileTree } from './diff/DiffFileTree';
import { DiffToolbar } from './diff/DiffToolbar';

interface FilesTabProps {
  prNumber: number;
  repoOwner: string;
  repoName: string;
  htmlUrl?: string;
  prUpdatedAt: string;
}

const STORAGE_KEY_VIEW_MODE = 'borgdock:diff-view-mode';
const STORAGE_KEY_FILE_TREE = 'borgdock:diff-file-tree';

export function toDiffFile(fc: PullRequestFileChange): DiffFile {
  const isBinary = !fc.patch && fc.status !== 'renamed' && fc.status !== 'removed';
  const isTruncated = false; // GitHub omits patch for truncated files — same as binary detection
  return {
    filename: fc.filename,
    previousFilename: fc.previousFilename,
    status:
      fc.status === 'added' ||
      fc.status === 'removed' ||
      fc.status === 'renamed' ||
      fc.status === 'copied'
        ? fc.status
        : 'modified',
    additions: fc.additions,
    deletions: fc.deletions,
    patch: fc.patch,
    isBinary: isBinary && fc.additions === 0 && fc.deletions === 0,
    isTruncated,
    sha: fc.sha ?? '',
  };
}

export function FilesTab({ prNumber, repoOwner, repoName, htmlUrl, prUpdatedAt }: FilesTabProps) {
  const [commitFiles, setCommitFiles] = useState<DiffFile[] | null>(null);
  const [commitFilesLoading, setCommitFilesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commits, setCommits] = useState<PullRequestCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);

  // Persisted preferences
  const [viewMode, setViewMode] = useState<DiffViewMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY_VIEW_MODE) as DiffViewMode) || 'unified';
    } catch {
      return 'unified';
    }
  });
  const [showFileTree, setShowFileTree] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_FILE_TREE) !== 'false';
    } catch {
      return true;
    }
  });

  const [statusFilter, setStatusFilter] = useState<FileStatusFilter>('all');
  const [allExpanded, setAllExpanded] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [expandKey, setExpandKey] = useState(0);

  const [retryKey, setRetryKey] = useState(0);
  const diffPaneRef = useRef<HTMLDivElement>(null);
  const fileSectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VIEW_MODE, viewMode);
    } catch {
      /* noop */
    }
  }, [viewMode]);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FILE_TREE, String(showFileTree));
    } catch {
      /* noop */
    }
  }, [showFileTree]);

  // Cached fetch for PR-level files
  const fetchPrFiles = useCallback(async () => {
    const client = getClient();
    if (!client) throw new Error('GitHub client not initialized');
    const result = await getPRFiles(client, repoOwner, repoName, prNumber);
    return result.map(toDiffFile);
  }, [repoOwner, repoName, prNumber]);

  const { data: cachedFiles, isLoading: prFilesLoading } = useCachedTabData<DiffFile[]>(
    repoOwner,
    repoName,
    prNumber,
    'files',
    prUpdatedAt,
    fetchPrFiles,
  );

  // When a specific commit is selected, fetch its files directly (not cached).
  // retryKey is tracked inside the effect body so biome's dependency analysis
  // recognises it as a legitimate trigger (the retry button bumps it to force
  // a re-fetch).
  useEffect(() => {
    // Reference retryKey so biome sees it as a real dependency.
    void retryKey;

    if (!selectedCommit) {
      setCommitFiles(null);
      return;
    }

    let cancelled = false;
    setCommitFilesLoading(true);
    setError(null);

    (async () => {
      try {
        const client = getClient();
        if (!client) throw new Error('GitHub client not initialized');
        const result = await getCommitFiles(client, repoOwner, repoName, selectedCommit);
        if (!cancelled) {
          setCommitFiles(result.map(toDiffFile));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load files');
      } finally {
        if (!cancelled) setCommitFilesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCommit, repoOwner, repoName, retryKey]);

  // Fetch commits for scope selector
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = getClient();
        if (!client) return;
        const result = await getPRCommits(client, repoOwner, repoName, prNumber);
        if (!cancelled) setCommits(result);
      } catch {
        // Non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prNumber, repoOwner, repoName]);

  // Resolve which files to display
  const files = selectedCommit ? (commitFiles ?? []) : (cachedFiles ?? []);
  const loading = selectedCommit ? commitFilesLoading : prFilesLoading;

  // Filtered files
  const filteredFiles = useMemo(() => {
    if (statusFilter === 'all') return files;
    const statusMap: Record<string, string[]> = {
      added: ['added'],
      modified: ['modified', 'renamed', 'copied'],
      deleted: ['removed'],
    };
    const allowed = statusMap[statusFilter] ?? [];
    return files.filter((f) => allowed.includes(f.status));
  }, [files, statusFilter]);

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  // Scroll to file when clicking in tree
  const handleFileClick = useCallback((filename: string) => {
    setActiveFile(filename);
    const el = fileSectionRefs.current.get(filename);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Intersection observer to track active file. filteredFiles is referenced
  // so biome sees it as a real dependency — when it changes we need to re-
  // attach the observer to the new DOM nodes.
  useEffect(() => {
    void filteredFiles;
    const pane = diffPaneRef.current;
    if (!pane) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const filename = (entry.target as HTMLElement).dataset.filename;
            if (filename) setActiveFile(filename);
          }
        }
      },
      { root: pane, rootMargin: '-10% 0px -80% 0px', threshold: 0 },
    );

    for (const el of fileSectionRefs.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [filteredFiles]);

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await writeText(path);
    } catch {
      // Fallback: navigator.clipboard
      try {
        await navigator.clipboard.writeText(path);
      } catch {
        /* noop */
      }
    }
  }, []);

  const handleOpenInGitHub = useCallback(
    (filename: string) => {
      if (htmlUrl) {
        const fileUrl = `${htmlUrl}/files#diff-${filename.replace(/\//g, '-')}`;
        openUrl(fileUrl).catch(console.error);
      }
    },
    [htmlUrl],
  );

  const handleToggleAllExpanded = useCallback(() => {
    setAllExpanded((prev) => !prev);
    setExpandKey((k) => k + 1);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      const fileNames = filteredFiles.map((f) => f.filename);
      const currentIdx = activeFile ? fileNames.indexOf(activeFile) : -1;

      switch (e.key) {
        case '[': {
          e.preventDefault();
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : fileNames.length - 1;
          if (fileNames[prevIdx]) handleFileClick(fileNames[prevIdx]);
          break;
        }
        case ']': {
          e.preventDefault();
          const nextIdx = currentIdx < fileNames.length - 1 ? currentIdx + 1 : 0;
          if (fileNames[nextIdx]) handleFileClick(fileNames[nextIdx]);
          break;
        }
        case 'x': {
          // Toggle collapse on active file — handled by individual sections
          break;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setViewMode((m) => (m === 'unified' ? 'split' : 'unified'));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredFiles, activeFile, handleFileClick]);

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-6 w-full rounded bg-[var(--color-surface-raised)] animate-pulse" />
            <div className="h-16 w-full rounded bg-[var(--color-surface-raised)] animate-pulse opacity-50" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-[var(--color-status-red)] mb-2">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setRetryKey((k) => k + 1);
          }}
          className="px-3 py-1 text-[10px] rounded bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <p className="p-4 text-center text-xs text-[var(--color-text-muted)]">
        No files changed in this pull request.
      </p>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <DiffToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showFileTree={showFileTree}
        onToggleFileTree={() => setShowFileTree(!showFileTree)}
        allExpanded={allExpanded}
        onToggleAllExpanded={handleToggleAllExpanded}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        fileCount={files.length}
        totalAdditions={totalAdditions}
        totalDeletions={totalDeletions}
        commits={commits}
        selectedCommit={selectedCommit}
        onCommitChange={setSelectedCommit}
      />

      {/* Large PR warning */}
      {files.length > 300 && (
        <div className="px-3 py-1.5 text-[10px] text-[var(--color-status-yellow)] bg-[var(--color-warning-badge-bg)] border-b border-[var(--color-diff-border)]">
          This PR has {files.length} changed files. Large PRs may be slow.
        </div>
      )}

      {/* Main content: file tree + diff pane */}
      <div className="flex flex-1 min-h-0">
        {/* File tree sidebar */}
        {showFileTree && (
          <div
            className="shrink-0"
            style={{ width: '220px', minWidth: '160px', maxWidth: '320px' }}
          >
            <DiffFileTree
              files={files}
              activeFile={activeFile}
              statusFilter={statusFilter}
              onFileClick={handleFileClick}
            />
          </div>
        )}

        {/* Diff pane */}
        <div ref={diffPaneRef} className="flex-1 overflow-y-auto min-w-0">
          {filteredFiles.map((file) => (
            <DiffFileSection
              key={`${file.filename}-${expandKey}`}
              ref={(el) => {
                if (el) fileSectionRefs.current.set(file.filename, el);
                else fileSectionRefs.current.delete(file.filename);
              }}
              file={file}
              viewMode={viewMode}
              defaultCollapsed={!allExpanded}
              onCopyPath={handleCopyPath}
              onOpenInGitHub={htmlUrl ? handleOpenInGitHub : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
