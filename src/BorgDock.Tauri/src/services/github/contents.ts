import { GitHubApiError, type GitHubClient } from './client';

/** Larger files are not read for a citation; the cite is dropped instead. */
const MAX_TEXT_BYTES = 512 * 1024;

interface GitHubFileContent {
  type?: string;
  sha?: string;
  size: number;
  encoding: string;
  content: string;
}

function repositoryOf(owner: string, repo: string) {
  return `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function contentsUrl(owner: string, repo: string, path: string, ref: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${repositoryOf(owner, repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
}

/**
 * A text file as it is at `ref` (a commit SHA), or null when the file is not
 * there, is not a file, is too large or is not UTF-8 text. A local checkout
 * can be on another branch; this is the commit itself.
 */
export async function getTextFileAtRef(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  maxBytes = MAX_TEXT_BYTES,
): Promise<string | null> {
  let file: GitHubFileContent;
  try {
    file = await client.get<GitHubFileContent>(contentsUrl(owner, repo, path, ref), {
      accept: 'application/vnd.github.object+json',
    });
  } catch (error) {
    if (error instanceof GitHubApiError && (error.status === 404 || error.status === 422))
      return null;
    throw error;
  }
  if (file.type !== 'file' || file.size > maxBytes || file.encoding !== 'base64') return null;
  try {
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), (c) => c.charCodeAt(0));
    if (bytes.includes(0)) return null;
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Any file as it is at `ref`, base64-encoded, or null when it is not there or
 * is larger than `maxBytes`. The contents API leaves out the content of a
 * file over 1 MB; that one is read as a blob.
 */
export async function getFileBase64AtRef(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  maxBytes: number,
): Promise<string | null> {
  let file: GitHubFileContent;
  try {
    file = await client.get<GitHubFileContent>(contentsUrl(owner, repo, path, ref), {
      accept: 'application/vnd.github.object+json',
    });
    if (file.type !== 'file' || file.size > maxBytes) return null;
    if (file.encoding === 'none' && file.sha)
      file = await client.get<GitHubFileContent>(
        `${repositoryOf(owner, repo)}/git/blobs/${encodeURIComponent(file.sha)}`,
      );
  } catch (error) {
    if (error instanceof GitHubApiError && (error.status === 404 || error.status === 422))
      return null;
    throw error;
  }
  if (file.encoding !== 'base64' || !file.content) return null;
  return file.content.replace(/\s/g, '');
}

/**
 * The commit a pull request's changes start from: where `head` left `base`.
 * A file's "before" is read there, not at the base branch's tip.
 */
export async function getMergeBaseSha(
  client: GitHubClient,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
): Promise<string | null> {
  const comparison = await client.get<{ merge_base_commit?: { sha?: string } }>(
    `${repositoryOf(owner, repo)}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}?per_page=1`,
  );
  return comparison.merge_base_commit?.sha ?? null;
}
