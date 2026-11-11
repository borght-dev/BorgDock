import { GitHubApiError, type GitHubClient } from './client';

/** Larger files are not read for a citation; the cite is dropped instead. */
const MAX_TEXT_BYTES = 512 * 1024;

interface GitHubFileContent {
  type?: string;
  size: number;
  encoding: string;
  content: string;
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
): Promise<string | null> {
  const repository = `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  let file: GitHubFileContent;
  try {
    file = await client.get<GitHubFileContent>(
      `${repository}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      { accept: 'application/vnd.github.object+json' },
    );
  } catch (error) {
    if (error instanceof GitHubApiError && (error.status === 404 || error.status === 422))
      return null;
    throw error;
  }
  if (file.type !== 'file' || file.size > MAX_TEXT_BYTES || file.encoding !== 'base64') return null;
  try {
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), (c) => c.charCodeAt(0));
    if (bytes.includes(0)) return null;
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
