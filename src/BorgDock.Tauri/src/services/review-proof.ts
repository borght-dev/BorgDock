import type { ConversationEntry } from '@/hooks/usePrConversation';

export interface ProofImage {
  src: string;
  alt: string;
}
export interface ReviewProof {
  entry: ConversationEntry;
  images: ProofImage[];
  excerpt: string;
  commit?: string;
  freshness: 'current' | 'outdated' | 'unknown';
}

export function proofImages(body: string): ProofImage[] {
  const images: ProofImage[] = [];
  const doc = new DOMParser().parseFromString(body, 'text/html');
  for (const image of doc.querySelectorAll('img')) {
    const src = image.getAttribute('src') ?? '';
    if (/^https?:\/\//i.test(src))
      images.push({ src, alt: image.getAttribute('alt') || 'Screenshot' });
  }
  for (const match of body.matchAll(
    /!\[([^\]]*)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+["'][^)]*)?\s*\)/gi,
  )) {
    images.push({ src: match[2]!, alt: match[1] || 'Screenshot' });
  }
  return images.filter(
    (image, index) => images.findIndex((other) => other.src === image.src) === index,
  );
}

export function reviewProofs(
  entries: readonly ConversationEntry[],
  headSha?: string,
): ReviewProof[] {
  return entries
    .flatMap((entry): ReviewProof[] => {
      const body = entry.body ?? '';
      const source = entry.sourceBody ?? body;
      const images = proofImages(body);
      const text = `${source}\n${body}`;
      if (
        !/\b(proof|verification|verified|evidence)\b|\bvera\s+(cli|proof|verify)\b/i.test(text) &&
        !(images.length && /\bscreenshots?\b/i.test(text))
      )
        return [];
      const commits = [
        ...source.matchAll(
          /\b(?:commit|head(?:[_ -]?sha)?|sha)\b["'\s:*`=-]*([a-f0-9]{7,40})\b|\/commit\/([a-f0-9]{7,40})\b/gi,
        ),
      ].map((match) => (match[1] ?? match[2])!.toLowerCase());
      const unique = [...new Set(commits)];
      const commit = unique.length === 1 ? unique[0] : undefined;
      const matches =
        commit && headSha && /^[a-f0-9]{7,40}$/i.test(headSha)
          ? headSha.toLowerCase().startsWith(commit) || commit.startsWith(headSha.toLowerCase())
          : undefined;
      const doc = new DOMParser().parseFromString(
        body.replace(/!\[[^\]]*\]\([^)]*\)/g, ''),
        'text/html',
      );
      for (const node of doc.querySelectorAll('script,style')) node.remove();
      for (const node of doc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,br'))
        node.append(doc.createTextNode(' '));
      const excerpt = (doc.body.textContent ?? '')
        .replace(/[#*`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      return [
        {
          entry,
          images,
          excerpt,
          commit,
          freshness: matches === undefined ? 'unknown' : matches ? 'current' : 'outdated',
        },
      ];
    })
    .sort((a, b) => Date.parse(b.entry.createdAt) - Date.parse(a.entry.createdAt));
}
