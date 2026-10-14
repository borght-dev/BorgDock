import type { DiffFile } from '@/types';
import type { GitHubClient } from './client';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function imageType(path: string) {
  return IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? ''];
}

export function isImagePath(path: string): boolean {
  return !!imageType(path);
}

export interface RevisionImage {
  src: string;
  path: string;
  ref: string;
  size: number;
}

export type ImageRevision =
  | { state: 'ready'; image: RevisionImage }
  | { state: 'absent' }
  | { state: 'error'; message: string };

export interface ImageComparison {
  before: ImageRevision;
  after: ImageRevision;
}

interface GitHubImageContent {
  type?: string;
  sha: string;
  size: number;
  encoding: string;
  content: string;
}

async function getRevisionImage(
  client: GitHubClient,
  repository: string,
  path: string,
  ref: string,
  blobSha?: string,
): Promise<RevisionImage> {
  const mime = imageType(path);
  if (!mime) throw new Error('This image format cannot be previewed.');
  let content: GitHubImageContent;
  if (blobSha) {
    content = await client.get(`${repository}/git/blobs/${encodeURIComponent(blobSha)}`);
  } else {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    content = await client.get(
      `${repository}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      {
        accept: 'application/vnd.github.object+json',
      },
    );
    if (content.type !== 'file') throw new Error('Image file is unavailable at this revision.');
    if (content.size > MAX_IMAGE_BYTES)
      throw new Error('Images over 10 MB must be viewed on GitHub.');
    if (content.encoding === 'none') {
      content = await client.get(`${repository}/git/blobs/${encodeURIComponent(content.sha)}`);
    }
  }
  if (content.size > MAX_IMAGE_BYTES)
    throw new Error('Images over 10 MB must be viewed on GitHub.');
  if (content.encoding !== 'base64' || !content.content)
    throw new Error('Image content is unavailable.');
  const encoded = content.content.replace(/\s/g, '');
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4)
    throw new Error('Images over 10 MB must be viewed on GitHub.');
  if (atob(encoded.slice(0, 200)).startsWith('version https://git-lfs.github.com/spec/v1')) {
    throw new Error('Git LFS images must be viewed on GitHub.');
  }
  return { src: `data:${mime};base64,${encoded}`, path, ref, size: content.size };
}

function imageResult(result: PromiseSettledResult<RevisionImage | null>): ImageRevision {
  if (result.status === 'rejected') {
    return {
      state: 'error',
      message:
        result.reason instanceof Error ? result.reason.message : 'Image could not be loaded.',
    };
  }
  return result.value ? { state: 'ready', image: result.value } : { state: 'absent' };
}

export async function getImageComparison(
  client: GitHubClient,
  owner: string,
  repo: string,
  file: DiffFile,
  baseSha: string,
  headSha: string,
): Promise<ImageComparison> {
  if (!baseSha || !headSha) throw new Error('Review revisions are unavailable. Reload the files.');
  const repository = `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const before = async () => {
    if (file.status === 'added' || file.status === 'copied') return null;
    const comparison = await client.get<{ merge_base_commit: { sha: string } }>(
      `${repository}/compare/${encodeURIComponent(baseSha)}...${encodeURIComponent(headSha)}?per_page=1`,
    );
    const ref = comparison.merge_base_commit?.sha;
    if (!ref) throw new Error('The original image revision could not be found.');
    return getRevisionImage(client, repository, file.previousFilename ?? file.filename, ref);
  };
  const after =
    file.status === 'removed'
      ? Promise.resolve(null)
      : getRevisionImage(client, repository, file.filename, headSha, file.sha || undefined);
  const results = await Promise.allSettled([before(), after]);
  return { before: imageResult(results[0]), after: imageResult(results[1]) };
}
