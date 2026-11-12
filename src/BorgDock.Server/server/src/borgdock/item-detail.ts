import type { ItemAttachment, ItemComment, ItemDetail, ItemMarkdown, ItemPullRequest, PrRef, PrSummary } from '../../../shared/src/api.ts';
import { adoAttachment, attachmentHeaders, type AttachmentSigner } from '../ado/attachments.ts';
import { htmlToText, summaryOf, type AdoClient, type AdoComment, type AdoItemRead, type AdoRelation, type PullRequestLink } from '../ado/client.ts';
import { historyOf } from '../ado/history.ts';
import { htmlToMarkdown, type ImageResolver } from '../ado/markdown.ts';
import type { Db } from '../db.ts';
import { workItemIdsOf } from '../github/focus.ts';
import { UserError } from '../service.ts';
import type { T3PullRequest } from '../t3/source.ts';
import { checksLabel, itemPullRequests, learnRepositories, repositoryOfUrl, type CandidatePullRequest } from './item-pull-requests.ts';
import { signatureOf } from './verdict.ts';

const RICH_FIELDS: Record<keyof ItemMarkdown, string> = {
  description: 'System.Description',
  acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria',
  reproSteps: 'Microsoft.VSTS.TCM.ReproSteps',
  qaNotes: 'Custom.QANotes',
  developerNotes: 'Custom.DeveloperNotes',
};
const PARENT = 'System.LinkTypes.Hierarchy-Reverse';
const REPOSITORIES_KEY = 'ado.githubRepositories';
/** GitHub reads for pull requests only ADO or T3 know, per item page; each gets a few seconds. */
const LOOKUPS = 6;
const LOOKUP_MS = 8000;
const COMMENT_LIMIT = 30_000;

/** What the item page reads besides ADO; the app wires GitHub, T3 and Dispatch's items in. */
export type ItemDetailSources = {
  ado: Pick<AdoClient, 'itemRead' | 'titles' | 'addComment' | 'attachment'>;
  signer: AttachmentSigner;
  db: Db;
  /** GitHub's open pull requests from the last poll. */
  openPullRequests: () => readonly PrSummary[];
  /** One pull request from GitHub, in any state. */
  pullRequest: (ref: PrRef) => Promise<PrSummary>;
  /** What T3 knows on the item's threads. */
  threadPullRequests: (itemId: number) => readonly T3PullRequest[];
  /** My items and the pull requests ADO links to them. */
  myItems: () => readonly { id: number; pullRequestLinks: PullRequestLink[] }[];
  /** How long one GitHub read may take before the page goes without it. */
  lookupMs?: number;
};

/** Which GitHub repository each ADO repository id stands for, learned from items and kept in preferences. */
class AdoRepositories {
  private readonly db: Db;
  private known: Map<string, string>;

  constructor(db: Db) {
    this.db = db;
    const row = db.prepare('SELECT value FROM preferences WHERE key = ?').get(REPOSITORIES_KEY) as { value: string } | undefined;
    this.known = new Map(Object.entries(row ? (JSON.parse(row.value) as Record<string, string>) : {}));
  }

  get map(): ReadonlyMap<string, string> {
    return this.known;
  }

  add(learned: ReadonlyMap<string, string>) {
    if (!learned.size) return;
    this.known = new Map([...this.known, ...learned]);
    this.db.prepare('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(REPOSITORIES_KEY, JSON.stringify(Object.fromEntries(this.known)));
  }
}

const fromGithub = (pr: PrSummary): CandidatePullRequest => ({
  repository: `${pr.owner}/${pr.repo}`, number: pr.number, url: pr.url, title: pr.title, branch: pr.headRef, state: pr.state, isDraft: pr.isDraft,
  checks: checksLabel(pr.checks), author: pr.author.name ?? pr.author.login, updatedAt: pr.updatedAt, mentions: pr.workItemIds, onItemThread: false,
});

const fromT3 = (pr: T3PullRequest): CandidatePullRequest => ({
  repository: repositoryOfUrl(pr.url), number: pr.number, url: pr.url, title: pr.title, branch: pr.headBranch, state: pr.state, isDraft: pr.isDraft,
  checks: pr.checks, author: null, updatedAt: null, mentions: workItemIdsOf({ title: pr.title, body: '', headRef: pr.headBranch ?? '' }), onItemThread: true,
});

function withinTime<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([work.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms).unref())]);
}

/**
 * The item page: ADO's fields as markdown with signed attachment images, its revisions as history, every linked pull
 * request with its own first, parent, effort and attachments. Also posts comments and serves attachments.
 */
export class ItemDetails {
  private readonly sources: ItemDetailSources;
  private readonly repositories: AdoRepositories;

  constructor(sources: ItemDetailSources) {
    this.sources = sources;
    this.repositories = new AdoRepositories(sources.db);
  }

  async read(id: number): Promise<ItemDetail> {
    const read = await this.sources.ado.itemRead(id);
    const { fields } = read;
    const image = this.imageResolver(id);
    const [parent, pullRequests] = await Promise.all([this.parentOf(read.relations), this.pullRequestsOf(id, read.item.pullRequestLinks)]);
    const effort = Number(fields['Microsoft.VSTS.Scheduling.Effort'] ?? fields['Microsoft.VSTS.Scheduling.StoryPoints'] ?? Number.NaN);
    return {
      item: summaryOf(read.item),
      description: htmlToText(fields['System.Description']),
      acceptanceCriteria: htmlToText(fields['Microsoft.VSTS.Common.AcceptanceCriteria']),
      reproSteps: htmlToText(fields['Microsoft.VSTS.TCM.ReproSteps']),
      qaNotes: htmlToText(fields['Custom.QANotes']),
      comments: read.comments.map((c) => this.comment(id, c)),
      markdown: Object.fromEntries(Object.entries(RICH_FIELDS).map(([key, field]) => [key, this.richText(read, field, image)])) as ItemMarkdown,
      history: historyOf(read.updates),
      pullRequests,
      parent,
      effort: Number.isFinite(effort) ? effort : null,
      areaPath: typeof fields['System.AreaPath'] === 'string' ? fields['System.AreaPath'] : null,
      attachments: this.attachmentsOf(id, read.relations),
    };
  }

  /** Posts as the server's ADO account, as markdown. A comment never moves the item's state. */
  async postComment(id: number, text: unknown): Promise<ItemComment> {
    if (typeof text !== 'string' || !text.trim()) throw new UserError('The comment is empty.');
    if (text.length > COMMENT_LIMIT) throw new UserError(`The comment is longer than ${COMMENT_LIMIT.toLocaleString('en')} characters.`);
    return this.comment(id, await this.sources.ado.addComment(id, text));
  }

  /** The attachment a signed URL names, streamed from ADO; a wrong or expired signature is a 403. */
  async attachment(id: number, guid: string, query: { name?: string; exp?: string; sig?: string }): Promise<Response> {
    const name = query.name ?? '';
    if (!this.sources.signer.verify(id, guid, name, query.exp ?? '', query.sig ?? '')) throw new UserError('This attachment link is wrong or expired. Open the item again.', 403);
    const upstream = await this.sources.ado.attachment(guid, name);
    return new Response(upstream.body, { headers: attachmentHeaders(name, upstream.headers.get('content-type'), upstream.headers.get('content-length')) });
  }

  private imageResolver(itemId: number): ImageResolver {
    return (src) => {
      const attachment = adoAttachment(src);
      if (attachment) return this.sources.signer.path(itemId, attachment.guid, attachment.name ?? 'image');
      return /^https:\/\//i.test(src) ? src : null;
    };
  }

  /** HTML is converted; what ADO already keeps as markdown only gets its attachment links signed. */
  private markdownOf(source: string | undefined, isMarkdown: boolean, image: ImageResolver): string {
    if (!source) return '';
    if (!isMarkdown) return htmlToMarkdown(source, image);
    return source.replace(/(\]\()(https?:\/\/[^\s)]+)(\))/g, (match, open: string, url: string, close: string) => (adoAttachment(url) ? `${open}${image(url)}${close}` : match)).trim();
  }

  private richText(read: AdoItemRead, field: string, image: ImageResolver): string {
    const value = read.fields[field];
    return this.markdownOf(typeof value === 'string' ? value : undefined, read.formats[field] === 'markdown', image);
  }

  /** `Vera · plan — …` is Vera's, whoever's account posted it, as on the desktop. */
  private comment(itemId: number, c: AdoComment): ItemComment {
    const isMarkdown = c.format?.toLowerCase() === 'markdown';
    const plain = isMarkdown ? c.text.trim() : htmlToText(c.text);
    let markdown = this.markdownOf(c.text, isMarkdown, this.imageResolver(itemId));
    const signed = signatureOf(plain);
    if (signed && markdown.startsWith(signed.prefix)) markdown = markdown.slice(signed.prefix.length);
    return {
      ...(typeof c.id === 'number' ? { id: c.id } : {}),
      by: signed?.author ?? c.createdBy?.displayName ?? 'Unknown',
      at: c.createdDate,
      text: signed ? plain.slice(signed.prefix.length) : plain,
      markdown,
    };
  }

  private attachmentsOf(itemId: number, relations: readonly AdoRelation[]): ItemAttachment[] {
    return relations.flatMap((relation) => {
      const attachment = relation.rel === 'AttachedFile' ? adoAttachment(relation.url) : null;
      if (!attachment) return [];
      const name = String(relation.attributes?.name ?? attachment.name ?? attachment.guid).slice(0, 255);
      const size = Number(relation.attributes?.resourceSize);
      return [{ name, url: this.sources.signer.path(itemId, attachment.guid, name), size: Number.isFinite(size) ? size : null }];
    });
  }

  private async parentOf(relations: readonly AdoRelation[]): Promise<ItemDetail['parent']> {
    const url = relations.find((r) => r.rel === PARENT)?.url ?? '';
    const id = Number(/\/workItems\/(\d+)$/i.exec(url)?.[1]);
    if (!Number.isInteger(id) || id <= 0) return null;
    const [parent] = await this.sources.ado.titles([id]).catch(() => []);
    return parent ?? { id, title: '', typeName: '' };
  }

  /**
   * GitHub's open pull requests and the ones on the item's T3 threads, then a GitHub read for each linked one GitHub's
   * open list doesn't have: merged and closed ones, ones only T3 knows (no author or checks), and ones only ADO links
   * (once its repository id is known).
   */
  private async pullRequestsOf(itemId: number, links: PullRequestLink[]): Promise<ItemPullRequest[]> {
    const openList = this.sources.openPullRequests();
    const known = [...openList.map(fromGithub), ...this.sources.threadPullRequests(itemId).map(fromT3)];
    this.repositories.add(learnRepositories(itemId, links, known, this.repositories.map));
    const myItems = this.sources.myItems().map((item) => ({ id: item.id, links: item.pullRequestLinks }));
    const linking = { itemId, links, myItems, repositories: this.repositories.map };
    const keyOf = (repository: string, number: number) => `${repository}#${number}`.toLowerCase();
    const open = new Set(openList.map((pr) => keyOf(`${pr.owner}/${pr.repo}`, pr.number)));
    const wanted = new Map<string, PrRef>();
    const want = (repository: string, number: number) => {
      const [owner, repo] = repository.split('/');
      if (!open.has(keyOf(repository, number))) wanted.set(keyOf(repository, number), { owner, repo, number });
    };
    for (const pr of itemPullRequests({ ...linking, candidates: known })) if (pr.repository) want(pr.repository, pr.number);
    for (const link of links) {
      const repository = linking.repositories.get(link.repositoryId);
      if (repository) want(repository, link.number);
    }
    const reads = [...wanted.values()].slice(0, LOOKUPS).map((ref) => withinTime(this.sources.pullRequest(ref), this.sources.lookupMs ?? LOOKUP_MS));
    const looked = (await Promise.all(reads)).filter((pr): pr is PrSummary => pr !== null);
    return itemPullRequests({ ...linking, candidates: [...looked.map(fromGithub), ...known] });
  }
}
