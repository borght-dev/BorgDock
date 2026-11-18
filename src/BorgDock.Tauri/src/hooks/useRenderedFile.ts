import { useEffect, useRef, useState } from 'react';
import {
  loadPreviewFiles,
  MAX_PAGE_BYTES,
  publishPreview,
  releasePreview,
} from '@/services/file-preview';
import { getMergeBaseSha, getTextFileAtRef } from '@/services/github/contents';
import { getClientForRepo } from '@/services/github/singleton';

/** A file of a repository as it is at one commit. */
export interface FileAtRef {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'unavailable'; reason: string };

const LOADING: Loaded<never> = { status: 'loading' };
const NO_ACCOUNT = 'Connect your GitHub account to render this file.';
const KEPT_TEXTS = 24;
/** Texts read this session: stepping back to a file does not ask GitHub again. */
const texts = new Map<string, Promise<string | null>>();
const mergeBases = new Map<string, Promise<string | null>>();

function keyOf(file: FileAtRef) {
  return `${file.owner}/${file.repo}@${file.ref}:${file.path}`;
}

function unavailable(error: unknown, fallback: string): Loaded<never> {
  return {
    status: 'unavailable',
    reason: error instanceof Error && error.message ? error.message : fallback,
  };
}

/** For tests: forget every text and merge base read so far. */
export function resetRenderedFiles() {
  texts.clear();
  mergeBases.clear();
}

/**
 * What `load` answers for `key`, and "loading" until it does. A new key
 * starts over; an answer for an earlier key is dropped. `load` may return a
 * function that undoes what it set up, run when the key changes.
 */
function useLoaded<T>(
  key: string | null,
  load: (settle: (loaded: Loaded<T>) => void) => undefined | (() => void),
): Loaded<T> {
  const [state, setState] = useState<{ key: string; loaded: Loaded<T> } | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!key) return;
    let active = true;
    const undo = loadRef.current((loaded) => {
      if (active) setState({ key, loaded });
    });
    return () => {
      active = false;
      undo?.();
    };
  }, [key]);
  return state && state.key === key ? state.loaded : LOADING;
}

function readText(file: FileAtRef): Promise<string | null> | null {
  const key = keyOf(file);
  const kept = texts.get(key);
  if (kept) return kept;
  const client = getClientForRepo(file.owner, file.repo);
  if (!client) return null;
  const reading = getTextFileAtRef(
    client,
    file.owner,
    file.repo,
    file.path,
    file.ref,
    MAX_PAGE_BYTES,
  );
  texts.set(key, reading);
  // A failed read is asked again next time.
  reading.catch(() => texts.delete(key));
  if (texts.size > KEPT_TEXTS) texts.delete(texts.keys().next().value!);
  return reading;
}

/** The text of `file`, or why it cannot be shown: too large, not text, or not there. */
export function useFileText(file: FileAtRef | null): Loaded<string> {
  return useLoaded<string>(file ? keyOf(file) : null, (settle) => {
    const reading = file && readText(file);
    if (!reading) {
      settle({ status: 'unavailable', reason: NO_ACCOUNT });
      return;
    }
    reading.then(
      (text) =>
        settle(
          text === null
            ? {
                status: 'unavailable',
                reason: 'This file is over 1 MB or is not text, so it is shown as a diff.',
              }
            : { status: 'ready', value: text },
        ),
      (error) => settle(unavailable(error, 'The file could not be read.')),
    );
  });
}

/**
 * The address a sandboxed frame loads `file` from, with the repository files
 * it links. The preview is taken off offer when the file changes or the
 * caller unmounts.
 */
export function useFilePreview(file: FileAtRef | null): Loaded<string> {
  return useLoaded<string>(file ? keyOf(file) : null, (settle) => {
    const client = file && getClientForRepo(file.owner, file.repo);
    if (!file || !client) {
      settle({ status: 'unavailable', reason: NO_ACCOUNT });
      return;
    }
    let gone = false;
    let published: string | null = null;
    void (async () => {
      try {
        const files = await loadPreviewFiles(client, file.owner, file.repo, file.path, file.ref);
        if (!files) {
          settle({
            status: 'unavailable',
            reason: 'This page is over 1 MB or is not text, so it is shown as a diff.',
          });
          return;
        }
        const url = await publishPreview(file.path, files);
        if (gone) {
          releasePreview(url);
          return;
        }
        published = url;
        settle({ status: 'ready', value: url });
      } catch (error) {
        settle(unavailable(error, 'The page could not be read.'));
      }
    })();
    return () => {
      gone = true;
      if (published) releasePreview(published);
    };
  });
}

/** The commit the pull request's changes start from, asked for once per pair of commits. */
export function useMergeBase(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  enabled: boolean,
): Loaded<string> {
  const key = enabled && baseSha && headSha ? `${owner}/${repo}:${baseSha}...${headSha}` : null;
  return useLoaded<string>(key, (settle) => {
    if (!key) return;
    let asking = mergeBases.get(key);
    if (!asking) {
      const client = getClientForRepo(owner, repo);
      if (!client) {
        settle({ status: 'unavailable', reason: NO_ACCOUNT });
        return;
      }
      asking = getMergeBaseSha(client, owner, repo, baseSha, headSha);
      mergeBases.set(key, asking);
      asking.catch(() => mergeBases.delete(key));
    }
    asking.then(
      (sha) =>
        settle(
          sha
            ? { status: 'ready', value: sha }
            : { status: 'unavailable', reason: 'The earlier version could not be found.' },
        ),
      (error) => settle(unavailable(error, 'The earlier version could not be found.')),
    );
  });
}
