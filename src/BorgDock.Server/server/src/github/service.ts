import { EventEmitter } from 'node:events';
import type {
  AgentWaiting, CheckRun, CiFailureGroup, Focus, FocusBucket, GithubAccountStatus, MergeMethod, MergeRequest, MergeResponse, Person, PostCommentRequest,
  PrConversation, PrDetail, PrFile, PrFiles, PrRef, PrRepositories, PrRepositoryPreferences, PrSummary, RerunResponse, SubmitReviewRequest, ThreadSummary,
  WidgetSnapshot,
} from '../../../shared/src/api.ts';
import type { Config } from '../config.ts';
import { now, type Db } from '../db.ts';
import { UserError, type DispatchService } from '../service.ts';
import { buildGroups, checkFailureOf, readFailure } from './ci/groups.ts';
import { fileCategory } from './file-category.ts';
import { GhTokens, GithubClient, GithubError, type TokenSource } from './client.ts';
import {
  bucketFor, checkSummary, compareFocus, FOCUS_BUCKETS, isMine, isNeedsYou, isWaitingOnMe, myReview, prKey, reasonFor, scoreOf,
  workItemIdsOf, type CheckContext, type FocusContext, type PrRecord,
} from './focus.ts';
import {
  AUTO_MERGE_MUTATION, CONVERSATION_QUERY, DETAIL_QUERY, FOCUS_MAX_PAGES, FOCUS_QUERY, HEAD_QUERY, mapContexts, mapConversation, mapPr, mapReviews,
  REPLY_MUTATION, REPOSITORY_MAX_PAGES, RESOLVE_MUTATION, TEAMS_QUERY, type FocusPage, type RawConversation, type RawDetail, type RawPr,
} from './queries.ts';
import { cleanRepositories, involvementSearches, repositorySearch, RepositorySettings, watchedRepositories } from './repositories.ts';
import { GithubStore, type JobFailure } from './store.ts';

export type GithubOptions = { tokens?: TokenSource; fetch?: typeof fetch; now?: () => number };

const TEAMS_TTL_MS = 60 * 60_000;
const DETAIL_TTL_MS = 10_000;
/** Log tails read per poll at most; the rest wait for the next one. */
const LOG_READS_PER_POLL = 6;
const LOG_RETRY_MS = 10 * 60_000;
const BASE_REPOS = 6;
/** Repository searches running at once; GitHub's secondary rate limit punishes bursts. */
const REPOSITORY_SEARCHES_AT_ONCE = 4;
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

type SearchResult = { found: RawPr[]; cutOff: boolean };

/** The last read of one watched repository. A failed read keeps the pull requests of the one before. */
type RepositoryRead = { name: string; account: string | null; records: PrRecord[]; cutOff: boolean; polledAt: string | null; ok: boolean; error: string | null };

type BaseStatus = {
  repo: string;
  branch: string;
  account: string;
  polledAt: string;
  /** One per workflow whose latest run on the branch failed. */
  failing: { workflow: string; runId: number; since: string; suspect: { sha: string; message: string }; jobs: { id: number; name: string }[] }[];
};

type RawRun = {
  id: number; workflow_id: number; name: string; status: string; conclusion: string | null; head_sha: string; created_at: string;
  head_commit: { message: string } | null;
};
type RawJob = {
  id: number; run_id: number; name: string; workflow_name?: string; conclusion: string | null; completed_at: string | null; head_sha: string; head_branch?: string;
  steps?: { name: string; conclusion: string | null }[];
};

/**
 * Everything BorgDock reads from GitHub: the Focus buckets, pull request details, files, conversations, checks
 * with their failure reasons, and related CI failure groups. It reads through `gh` on this machine.
 *
 * Events (other modules derive activity and pushes from them):
 *   'focus'  (focus: Focus)              after every poll that changed something
 *   'ci'     (groups: CiFailureGroup[])  after the CI failure groups changed
 */
export class GithubService extends EventEmitter {
  protected readonly config: Config;
  protected readonly db: Db;
  protected readonly dispatch: DispatchService;
  private readonly store: GithubStore;
  private readonly tokens: TokenSource;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly clock: () => number;
  private readonly clients = new Map<string, GithubClient>();
  private readonly accountStatus = new Map<string, GithubAccountStatus>();
  private readonly teams = new Map<string, { slugs: string[]; at: number }>();
  private readonly detailCache = new Map<string, { at: number; raw: RawDetail; account: string }>();
  /** Detail reads in flight per PR, so a detail and its files read at once ask GitHub once. */
  private readonly detailReads = new Map<string, Promise<{ raw: RawDetail; account: string }>>();
  /** Log reads in flight per job, shared by the poll and detail reads. */
  private readonly jobReads = new Map<number, Promise<void>>();
  private readonly bases = new Map<string, BaseStatus>();
  private readonly jobsRead = new Set<number>();
  /** Open pull requests from the last poll of each account. */
  private readonly byAccount = new Map<string, PrRecord[]>();
  /** What each account's searches last found; a search that fails keeps its previous answer. */
  private readonly bySearch = new Map<string, Map<string, SearchResult>>();
  /** Watched repositories by lower-cased name, each read by the account that could read it last time. */
  private readonly byRepository = new Map<string, RepositoryRead>();
  private readonly repositorySettings: RepositorySettings;
  private polledAt: string | null = null;
  private records = new Map<string, PrRecord>();
  private reviewRequests = new Map<string, string>();
  private current: Focus | null = null;
  private groups: CiFailureGroup[] = [];
  private timer: NodeJS.Timeout | null = null;
  private polling: Promise<Focus | null> | null = null;
  private reading: Promise<void> | null = null;
  private readonly onOverview = () => this.publishFocus();

  constructor(config: Config, db: Db, dispatch: DispatchService, options: GithubOptions = {}) {
    super();
    this.config = config;
    this.db = db;
    this.dispatch = dispatch;
    this.store = new GithubStore(db);
    this.repositorySettings = new RepositorySettings(db);
    this.tokens = options.tokens ?? new GhTokens();
    this.fetchImpl = options.fetch;
    this.clock = options.now ?? Date.now;
  }

  start() {
    if (this.timer) return;
    this.dispatch.on?.('overview', this.onOverview);
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), Math.max(15, this.config.github.pollSeconds) * 1000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.dispatch.off?.('overview', this.onOverview);
  }

  /** The last poll's Focus, or null before the first poll finished. */
  get focus(): Focus | null {
    return this.current;
  }

  /** Every open pull request BorgDock knows, for search and links. */
  get pullRequests(): PrSummary[] {
    return this.focus?.pullRequests ?? [];
  }

  /** Polls now; concurrent callers share one poll. */
  async refresh(): Promise<Focus | null> {
    this.polling ??= this.poll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /* ---------- polling ---------- */

  private client(login: string): GithubClient {
    let client = this.clients.get(login);
    if (!client) {
      client = new GithubClient(login, this.tokens, this.fetchImpl);
      this.clients.set(login, client);
    }
    return client;
  }

  private async accounts(): Promise<string[]> {
    return this.config.github.accounts.length ? this.config.github.accounts : this.tokens.accounts();
  }

  private async poll(): Promise<Focus | null> {
    const accounts = await this.accounts();
    const searches = involvementSearches(this.repositorySettings.preferences());
    await Promise.all([...accounts.map((login) => this.pollAccount(login, searches)), this.pollRepositories(accounts)]);
    this.polledAt = now();
    for (const login of [...this.byAccount.keys()]) if (!accounts.includes(login)) this.byAccount.delete(login);
    for (const login of [...this.bySearch.keys()]) if (!accounts.includes(login)) this.bySearch.delete(login);
    for (const login of [...this.accountStatus.keys()]) if (!accounts.includes(login)) this.accountStatus.delete(login);
    this.records = this.mergeAccounts();
    this.reviewRequests = this.store.syncReviewRequests(
      [...this.records.values()].filter((pr) => isWaitingOnMe(pr, pr.account, this.teamsOf(pr.account))).map((pr) => `${prKey(pr)}:${pr.account.toLowerCase()}`),
    );
    this.store.prune(this.clock());
    this.publishFocus();
    // Log tails and base branches take longer than the search; Focus doesn't wait for them.
    this.reading ??= this.readFailures()
      .catch((error) => console.error('GitHub: reading CI failures failed', error))
      .finally(() => {
        this.reading = null;
      });
    return this.current;
  }

  /** The searches for pull requests that involve this account, in any repository. */
  private async pollAccount(login: string, searches: readonly string[]) {
    const polledAt = now();
    try {
      const failure = await this.runSearches(login, searches);
      const found = [...(this.bySearch.get(login)?.values() ?? [])].flatMap((result) => result.found);
      const unique = [...new Map(found.map((n) => [n.id, n])).values()];
      this.byAccount.set(login, unique.map((n) => mapPr(n, login)));
      await this.refreshTeams(login);
      this.accountStatus.set(login, { login, via: 'account', machine: null, ok: failure === null, error: failure, polledAt });
    } catch (error) {
      // A failed account keeps its last pull requests; its status says why they are old.
      const previous = this.accountStatus.get(login);
      this.accountStatus.set(login, { login, via: 'account', machine: null, ok: false, error: (error as Error).message, polledAt: previous?.polledAt ?? null });
    }
  }

  private watched(): string[] {
    return watchedRepositories(this.repositorySettings.desktop()?.repositories ?? [], this.config.github.repos);
  }

  /** Every watched repository on its own search, a few at a time. */
  private async pollRepositories(accounts: readonly string[]) {
    const watched = this.watched();
    const keep = new Set(watched.map((name) => name.toLowerCase()));
    for (const key of [...this.byRepository.keys()]) if (!keep.has(key)) this.byRepository.delete(key);
    const queue = [...watched];
    const worker = async () => {
      for (let name = queue.shift(); name !== undefined; name = queue.shift()) await this.pollRepository(name, accounts);
    };
    await Promise.all(Array.from({ length: Math.min(REPOSITORY_SEARCHES_AT_ONCE, queue.length) }, worker));
  }

  /** Reads with the account that read it last, else each account in turn; when none can, the last answer stays. */
  private async pollRepository(name: string, accounts: readonly string[]) {
    const key = name.toLowerCase();
    const previous = this.byRepository.get(key);
    const remembered = previous?.account && accounts.includes(previous.account) ? previous.account : null;
    const readers = remembered ? [remembered, ...accounts.filter((a) => a !== remembered)] : accounts;
    const errors: string[] = [];
    for (const login of readers) {
      try {
        const { found, cutOff } = await this.searchAll(login, repositorySearch(name), REPOSITORY_MAX_PAGES);
        this.byRepository.set(key, { name, account: login, records: found.map((n) => mapPr(n, login)), cutOff, polledAt: now(), ok: true, error: null });
        return;
      } catch (error) {
        errors.push(`${login}: ${(error as Error).message}`);
      }
    }
    this.byRepository.set(key, {
      name, account: previous?.account ?? null, records: previous?.records ?? [], cutOff: previous?.cutOff ?? false, polledAt: previous?.polledAt ?? null,
      ok: false, error: errors.length ? errors.join('; ') : 'No GitHub account to read it with.',
    });
  }

  /** Runs every search at once. A search that fails keeps its last answer and is named in the result; all failing throws. */
  private async runSearches(login: string, searches: readonly string[]): Promise<string | null> {
    const known = this.bySearch.get(login) ?? new Map<string, SearchResult>();
    this.bySearch.set(login, known);
    for (const query of [...known.keys()]) if (!searches.includes(query)) known.delete(query);
    const results = await Promise.allSettled(searches.map((query) => this.searchAll(login, query)));
    const failures: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') known.set(searches[i], result.value);
      else failures.push(`${/\S+:@me/.exec(searches[i])?.[0] ?? 'repositories'}: ${(result.reason as Error).message}`);
    });
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (rejected && failures.length === searches.length) throw rejected.reason;
    return failures.length ? `Showing older results for ${failures.join('; ')}` : null;
  }

  /** Pages through a search; `cutOff` when pages were left after `maxPages`. */
  private async searchAll(login: string, query: string, maxPages = FOCUS_MAX_PAGES): Promise<SearchResult> {
    const found: RawPr[] = [];
    let after: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const { found: result }: FocusPage = await this.client(login).graphql<FocusPage>(FOCUS_QUERY, { query, after });
      found.push(...result.nodes.filter((n): n is RawPr => 'id' in n && typeof n.id === 'string'));
      if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) return { found, cutOff: false };
      after = result.pageInfo.endCursor;
    }
    return { found, cutOff: true };
  }

  /** Resolves once the CI failure reads the last poll or detail read started are done. */
  async ciSettled(): Promise<void> {
    await this.reading;
    await Promise.all(this.jobReads.values());
  }

  private async refreshTeams(login: string) {
    const cached = this.teams.get(login);
    if (cached && this.clock() - cached.at < TEAMS_TTL_MS) return;
    try {
      const data = await this.client(login).graphql<{ viewer: { organizations: { nodes: { teams: { nodes: { slug: string }[] } }[] } } }>(TEAMS_QUERY, { login });
      this.teams.set(login, { slugs: data.viewer.organizations.nodes.flatMap((o) => o.teams.nodes.map((t) => t.slug)), at: this.clock() });
    } catch {
      // Team reviews need read:org; without it only personal requests count.
      this.teams.set(login, { slugs: cached?.slugs ?? [], at: this.clock() });
    }
  }

  /** Your teams count for review requests unless the preferences say only yours do. */
  private teamsOf(login: string): string[] {
    if (!this.repositorySettings.preferences().includeTeamRequests) return [];
    return this.teams.get(login)?.slugs ?? [];
  }

  /** One record per pull request; one read by an account it involves wins over a read through a watched repository. */
  private mergeAccounts(): Map<string, PrRecord> {
    const merged = new Map<string, PrRecord>();
    const involves = (pr: PrRecord) => isMine(pr, pr.account) || isNeedsYou(pr, pr.account, this.teamsOf(pr.account)) || myReview(pr, pr.account) !== null;
    for (const list of [...this.byAccount.values(), ...[...this.byRepository.values()].map((read) => read.records)]) {
      for (const pr of list) {
        const key = prKey(pr);
        const known = merged.get(key);
        if (!known || (!involves(known) && involves(pr))) merged.set(key, pr);
      }
    }
    return merged;
  }

  private context(account: string): FocusContext {
    const snoozes = this.store.snoozes();
    const login = account.toLowerCase();
    return {
      login: account,
      teams: this.teamsOf(account),
      now: this.clock(),
      staleAfterDays: this.config.github.staleAfterDays,
      snoozedUntil: (key) => snoozes.get(key) ?? null,
      reviewRequestedAt: (key) => this.reviewRequests.get(`${key}:${login}`) ?? null,
    };
  }

  private summaryOf(pr: PrRecord): PrSummary {
    const ctx = this.context(pr.account);
    const until = ctx.snoozedUntil(prKey(pr));
    return {
      owner: pr.owner,
      repo: pr.repo,
      number: pr.number,
      key: prKey(pr),
      account: pr.account,
      title: pr.title,
      url: pr.url,
      author: pr.author,
      isMine: isMine(pr, pr.account),
      isDraft: pr.isDraft,
      state: pr.state,
      headRef: pr.headRef,
      baseRef: pr.baseRef,
      headSha: pr.headSha,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      mergedAt: pr.mergedAt,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      labels: pr.labels,
      checks: checkSummary(pr.checks),
      reviewDecision: pr.reviewDecision,
      approvedBy: pr.latestReviews.filter((r) => r.state === 'approved').map((r) => r.login),
      mergeable: pr.mergeable,
      bucket: bucketFor(pr, ctx),
      reason: reasonFor(pr, ctx),
      workItemIds: workItemIdsOf(pr),
      snoozedUntil: until !== null && until > ctx.now ? new Date(until).toISOString() : null,
      autoMerge: pr.autoMerge,
      reviewedHeadSha: myReview(pr, pr.account)?.commitSha ?? null,
    };
  }

  private buildFocus(): Focus {
    const ranked = [...this.records.values()]
      .filter((pr) => pr.state === 'open')
      .map((pr) => ({ summary: this.summaryOf(pr), score: scoreOf(pr, this.context(pr.account)) }))
      .sort((a, b) => compareFocus(
        { bucket: a.summary.bucket, score: a.score, updatedAt: a.summary.updatedAt, size: a.summary.additions + a.summary.deletions },
        { bucket: b.summary.bucket, score: b.score, updatedAt: b.summary.updatedAt, size: b.summary.additions + b.summary.deletions },
      ));
    const counts = Object.fromEntries(FOCUS_BUCKETS.map((b) => [b, 0])) as Record<FocusBucket, number>;
    for (const { summary } of ranked) counts[summary.bucket]++;
    return {
      generatedAt: new Date(this.clock()).toISOString(),
      counts,
      pullRequests: ranked.map((r) => r.summary),
      agentsWaiting: this.agentsWaiting(),
      accounts: [...this.accountStatus.values()],
    };
  }

  private agentsWaiting(): AgentWaiting[] {
    const waiting: AgentWaiting[] = [];
    for (const entry of this.dispatch.overview?.items ?? []) {
      if (entry.bay !== 'waiting') continue;
      const thread = entry.threads.find((t) => ['question', 'plan', 'approval', 'your-turn', 'failed'].includes(t.status));
      if (!thread) continue;
      waiting.push({ itemId: entry.item.id, threadId: thread.id, title: entry.item.title, detail: waitingDetail(thread), tone: thread.status === 'failed' ? 'bad' : thread.status === 'your-turn' ? 'ok' : 'warn' });
    }
    return waiting;
  }

  /** Rebuilds Focus from what's known (no GitHub calls) and emits 'focus' when it changed. */
  private publishFocus() {
    if (this.accountStatus.size === 0) return;
    const next = this.buildFocus();
    const changed = !this.current || comparable(next) !== comparable(this.current);
    this.current = next;
    if (changed) this.emit('focus', next);
  }

  /* ---------- repositories ---------- */

  /** Where the pull request list comes from and how much of it the last poll read. */
  repositories(): PrRepositories {
    const desktop = this.repositorySettings.desktop();
    const fromDesktop = Boolean(desktop?.repositories.length);
    const searchesCut = [...this.bySearch.values()].some((searches) => [...searches.values()].some((result) => result.cutOff));
    return {
      source: fromDesktop ? 'desktop' : cleanRepositories(this.config.github.repos).length ? 'config' : 'none',
      desktopName: fromDesktop ? desktop!.desktopName : null,
      updatedAt: fromDesktop ? desktop!.updatedAt : null,
      repositories: this.watched().map((name) => {
        const read = this.byRepository.get(name.toLowerCase());
        return { name, open: read?.records.length ?? 0, polledAt: read?.polledAt ?? null, ok: read?.ok ?? true, error: read?.error ?? null };
      }),
      ...this.repositorySettings.preferences(),
      polledAt: this.polledAt,
      cutOff: searchesCut || [...this.byRepository.values()].some((read) => read.cutOff),
    };
  }

  /** The linked desktop's watched repositories; a changed list is searched right away. */
  setDesktopRepositories(names: unknown, desktop: { sessionId: string; name: string }): PrRepositories {
    if (this.repositorySettings.setDesktop(cleanRepositories(names), desktop)) this.refreshAfterChange();
    return this.repositories();
  }

  setRepositoryPreferences(input: PrRepositoryPreferences): PrRepositories {
    this.repositorySettings.setPreferences(input ?? {});
    this.refreshAfterChange();
    return this.repositories();
  }

  /** Polls with the new settings once a poll that read with the old ones is done. Before start() the first poll will. */
  private refreshAfterChange() {
    if (!this.timer) return;
    void (this.polling ?? Promise.resolve(null)).catch(() => null).then(() => this.refresh());
  }

  /* ---------- CI failures ---------- */

  private async readFailures() {
    const open = [...this.records.values()].filter((pr) => pr.state === 'open');
    const queue: { pr: PrRecord; check: CheckContext }[] = [];
    for (const pr of open) {
      for (const check of pr.checks) if (this.wantsLog(check)) queue.push({ pr, check });
    }
    queue.sort((a, b) => (b.check.completedAt ?? '').localeCompare(a.check.completedAt ?? ''));
    for (const { pr, check } of queue.slice(0, LOG_READS_PER_POLL)) await this.readPrJob(pr, check);
    await this.pollBases(open);
    this.rebuildGroups();
  }

  private wantsLog(check: CheckContext): boolean {
    if (check.kind !== 'check' || check.state !== 'failure' || check.runId === null || check.id <= 0) return false;
    const known = this.store.job(check.id);
    return !known || (known.status === 'failed' && this.clock() - Date.parse(known.readAt) > LOG_RETRY_MS);
  }

  private readPrJob(pr: PrRecord, check: CheckContext): Promise<void> {
    const inFlight = this.jobReads.get(check.id);
    if (inFlight) return inFlight;
    const read = this.readJob(this.client(pr.account), `${pr.owner}/${pr.repo}`, check.id, {
      runId: check.runId, headSha: pr.headSha, branch: pr.headRef, prKey: prKey(pr), checkName: check.name, workflow: check.workflow, failedAt: check.completedAt,
    }).finally(() => this.jobReads.delete(check.id));
    this.jobReads.set(check.id, read);
    return read;
  }

  /** Failure reasons for checks nobody has read yet; the next detail read or poll carries them. */
  private readUnreadLogs(record: PrRecord) {
    const unread = record.checks.filter((c) => this.wantsLog(c) && !this.jobReads.has(c.id)).slice(0, 4);
    if (!unread.length) return;
    Promise.all(unread.map((c) => this.readPrJob(record, c)))
      .then(() => this.rebuildGroups())
      .catch((error) => console.error('GitHub: reading CI failures failed', error));
  }

  private async readJob(client: GithubClient, repo: string, jobId: number, meta: { runId: number | null; headSha: string; branch: string; prKey: string | null; checkName: string; workflow: string | null; failedAt: string | null }, steps?: RawJob['steps']) {
    const base: Omit<JobFailure, 'status' | 'error' | 'signals' | 'fingerprint' | 'tier' | 'title' | 'failedStep'> = {
      jobId, repo, runId: meta.runId, headSha: meta.headSha, branch: meta.branch, prKey: meta.prKey, checkName: meta.checkName, workflow: meta.workflow,
      failedAt: meta.failedAt ?? now(), readAt: now(),
    };
    let failedStep: string | null = null;
    try {
      const jobSteps = steps ?? (await client.rest<RawJob>('GET', `/repos/${repo}/actions/jobs/${jobId}`)).steps ?? [];
      failedStep = jobSteps.find((s) => s.conclusion === 'failure')?.name ?? null;
      const [owner, name] = repo.split('/');
      const log = await client.logTail(owner, name, jobId);
      if (log === null) {
        this.store.saveJob({ ...base, failedStep, status: 'unavailable', error: 'GitHub has no log for this job.', signals: [], fingerprint: null, tier: null, title: null });
        return;
      }
      const read = readFailure(log, failedStep, meta.workflow);
      this.store.saveJob({ ...base, failedStep, status: 'read', error: null, ...read });
    } catch (error) {
      this.store.saveJob({ ...base, failedStep, status: 'failed', error: (error as Error).message, signals: [], fingerprint: null, tier: null, title: null });
    }
  }

  /** The default branches of the repositories with your pull requests: which workflows are red, since which commit. */
  private async pollBases(open: readonly PrRecord[]) {
    const perRepo = new Map<string, { branch: string; account: string; count: number }>();
    for (const pr of open) {
      if (!pr.defaultBranch) continue;
      const key = `${pr.owner}/${pr.repo}`;
      const entry = perRepo.get(key) ?? { branch: pr.defaultBranch, account: pr.account, count: 0 };
      entry.count++;
      perRepo.set(key, entry);
    }
    const watched = [...perRepo.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, BASE_REPOS);
    const keep = new Set(watched.map(([repo, { branch }]) => `${repo}:${branch}`));
    for (const key of [...this.bases.keys()]) if (!keep.has(key)) this.bases.delete(key);
    for (const [repo, { branch, account }] of watched) {
      try {
        await this.pollBase(this.client(account), repo, branch, account);
      } catch (error) {
        console.error(`GitHub: reading ${repo} ${branch} failed: ${(error as Error).message}`);
      }
    }
  }

  private async pollBase(client: GithubClient, repo: string, branch: string, account: string) {
    const { workflow_runs: runs } = await client.rest<{ workflow_runs: RawRun[] }>(
      'GET', `/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=50&exclude_pull_requests=true`,
    );
    const byWorkflow = new Map<number, RawRun[]>();
    for (const run of runs) {
      if (run.status !== 'completed' || run.conclusion === 'cancelled' || run.conclusion === 'skipped') continue;
      byWorkflow.set(run.workflow_id, [...(byWorkflow.get(run.workflow_id) ?? []), run]);
    }
    const failing: BaseStatus['failing'] = [];
    for (const list of byWorkflow.values()) {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (!FAILED.has(list[0].conclusion ?? '')) continue;
      const streak = list.slice(0, (list.findIndex((r) => !FAILED.has(r.conclusion ?? '')) + 1 || list.length + 1) - 1);
      const first = streak[streak.length - 1];
      const latest = list[0];
      const jobs = await this.baseJobs(client, repo, latest, branch);
      failing.push({
        workflow: latest.name, runId: latest.id, since: first.created_at,
        suspect: { sha: first.head_sha, message: (first.head_commit?.message ?? '').split('\n')[0] }, jobs,
      });
    }
    this.bases.set(`${repo}:${branch}`, { repo, branch, account, polledAt: now(), failing });
  }

  /** The failed jobs of a red base-branch run, reading the logs not read yet. */
  private async baseJobs(client: GithubClient, repo: string, run: RawRun, branch: string) {
    const known = this.store.jobs().filter((j) => j.runId === run.id);
    if (this.jobsRead.has(run.id) && known.length) return known.map((j) => ({ id: j.jobId, name: j.checkName }));
    const { jobs } = await client.rest<{ jobs: RawJob[] }>('GET', `/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=50`);
    const failed = jobs.filter((j) => FAILED.has(j.conclusion ?? ''));
    for (const job of failed.slice(0, LOG_READS_PER_POLL)) {
      if (this.store.job(job.id)?.status === 'read') continue;
      await this.readJob(client, repo, job.id, {
        runId: run.id, headSha: run.head_sha, branch, prKey: null, checkName: job.name, workflow: run.name, failedAt: job.completed_at,
      }, job.steps ?? []);
    }
    this.jobsRead.add(run.id);
    return failed.map((j) => ({ id: j.id, name: j.name }));
  }

  private rebuildGroups() {
    const openPrs = new Map([...this.records.values()].filter((pr) => pr.state === 'open').map((pr) => [prKey(pr), {
      title: pr.title, failingJobs: new Set(pr.checks.filter((c) => c.state === 'failure').map((c) => c.id)),
    }]));
    const baseBranches = new Map([...this.bases.values()].filter((b) => b.failing.length).map((b) => [`${b.repo}:${b.branch}`, {
      suspect: b.failing[0].suspect, runIds: new Set(b.failing.map((f) => f.runId)),
    }]));
    const next = buildGroups(this.store.jobs(), { openPrs, baseBranches, claims: this.store.claims() });
    const changed = JSON.stringify(next) !== JSON.stringify(this.groups);
    this.groups = next;
    if (changed) this.emit('ci', next);
  }

  private baseSince = (repo: string, branch: string) => this.bases.get(`${repo}:${branch}`)?.failing[0]?.since ?? null;

  ciGroups(): CiFailureGroup[] {
    return this.groups;
  }

  ciGroup(id: string): CiFailureGroup {
    const group = this.groups.find((g) => g.id === id);
    if (!group) throw new UserError('No such CI failure group. It may have passed since.', 404);
    return group;
  }

  claim(id: string, note: string | null): CiFailureGroup {
    const group = this.ciGroup(id);
    const account = group.branches.map((b) => (b.prKey ? this.records.get(b.prKey)?.account : undefined)).find(Boolean) ?? [...this.accountStatus.keys()][0];
    if (!account) throw new UserError('No GitHub account to claim it with.', 503);
    const clean = typeof note === 'string' ? note.trim().slice(0, 500) || null : null;
    this.store.claim(id, { login: account, name: null, avatarUrl: `https://github.com/${account}.png` }, clean);
    this.rebuildGroups();
    return this.ciGroup(id);
  }

  unclaim(id: string): CiFailureGroup {
    this.ciGroup(id);
    this.store.unclaim(id);
    this.rebuildGroups();
    return this.ciGroup(id);
  }

  /** The master-health part of the widget snapshot. */
  masterHealth(): WidgetSnapshot['master'] {
    const bases = [...this.bases.values()];
    const red = bases.filter((b) => b.failing.length).sort((a, b) => a.failing[0].since.localeCompare(b.failing[0].since))[0];
    if (!red) return { state: bases.length ? 'ok' : 'unknown', repo: bases[0]?.repo ?? null, job: null, since: null, prsHit: 0, claimedBy: null };
    const groups = this.groups.filter((g) => g.branches.some((b) => b.prKey === null && b.branch === red.branch));
    const prs = new Set(groups.flatMap((g) => g.branches.filter((b) => b.prKey !== null).map((b) => b.prKey)));
    const claimed = groups.find((g) => g.claim)?.claim?.by ?? null;
    const failure = red.failing[0];
    return {
      state: 'failing', repo: red.repo, job: failure.jobs[0]?.name ?? failure.workflow, since: failure.since, prsHit: prs.size,
      claimedBy: claimed ? (claimed.name ?? claimed.login) : null,
    };
  }

  /* ---------- reads ---------- */

  private accountFor(ref: PrRef): string {
    const known = this.records.get(prKey(ref))?.account ?? this.detailCache.get(prKey(ref))?.account;
    if (known) return known;
    const owner = ref.owner.toLowerCase();
    const sameOwner = [...this.records.values()].find((pr) => pr.owner.toLowerCase() === owner)?.account;
    const account = sameOwner ?? [...this.accountStatus.values()].find((a) => a.ok)?.login ?? this.config.github.accounts[0];
    if (!account) throw new UserError('GitHub is still loading. Try again in a moment.', 503);
    return account;
  }

  private async detailRaw(ref: PrRef): Promise<{ raw: RawDetail; account: string }> {
    const key = prKey(ref);
    const cached = this.detailCache.get(key);
    if (cached && this.clock() - cached.at < DETAIL_TTL_MS) return cached;
    const inFlight = this.detailReads.get(key);
    if (inFlight) return inFlight;
    const read = this.readDetail(ref);
    this.detailReads.set(key, read);
    try {
      const entry = await read;
      if (this.detailReads.get(key) === read) this.detailCache.set(key, { at: this.clock(), ...entry });
      return entry;
    } finally {
      if (this.detailReads.get(key) === read) this.detailReads.delete(key);
    }
  }

  private async readDetail(ref: PrRef): Promise<{ raw: RawDetail; account: string }> {
    const key = prKey(ref);
    // A repository no poll has shown may belong to another account: the first one that can see it reads it from now on.
    const first = this.accountFor(ref);
    const readers = [first, ...[...this.accountStatus.values()].filter((a) => a.ok && a.login !== first).map((a) => a.login)];
    for (const account of readers) {
      const raw = await this.client(account).graphql<RawDetail>(DETAIL_QUERY, { owner: ref.owner, repo: ref.repo, number: ref.number }).catch((error) => {
        if (error instanceof GithubError && [401, 403, 404].includes(error.githubStatus)) return null;
        throw error;
      });
      if (raw?.repository?.pullRequest) return { raw, account };
    }
    throw new UserError(`${key} doesn't exist or ${readers.join(' and ')} can't see it.`, 404);
  }

  private async recordOf(ref: PrRef): Promise<{ record: PrRecord; raw: RawDetail; account: string }> {
    const { raw, account } = await this.detailRaw(ref);
    const record = mapPr(raw.repository!.pullRequest!, account);
    if (this.records.has(prKey(record))) this.records.set(prKey(record), record);
    return { record, raw, account };
  }

  async detail(ref: PrRef): Promise<PrDetail> {
    const { record, raw, account } = await this.recordOf(ref);
    const repository = raw.repository!;
    const pr = repository.pullRequest!;
    this.readUnreadLogs(record);
    const methods: MergeMethod[] = [
      ...(repository.squashMergeAllowed ? ['squash' as const] : []),
      ...(repository.mergeCommitAllowed ? ['merge' as const] : []),
      ...(repository.rebaseMergeAllowed ? ['rebase' as const] : []),
    ];
    const preferred = repository.viewerDefaultMergeMethod.toLowerCase() as MergeMethod;
    const overview = this.dispatch.overview;
    const ids = workItemIdsOf(record);
    const threads = new Map<string, ThreadSummary>();
    for (const entry of overview?.items ?? []) {
      for (const t of entry.threads) if (t.branch === record.headRef) threads.set(t.id, t);
    }
    for (const t of overview?.unlinkedThreads ?? []) if (t.branch === record.headRef) threads.set(t.id, t);
    return {
      ...this.summaryOf(record),
      body: record.body,
      commits: pr.commits.totalCount,
      reviews: mapReviews(pr.reviews.nodes),
      requestedReviewers: pr.reviewRequestsFull.nodes.flatMap((r): Person[] => {
        const who = r.requestedReviewer;
        if (!who) return [];
        return [who.__typename === 'Team' ? { login: who.slug ?? 'team', name: who.name ?? null, avatarUrl: who.avatarUrl ?? null } : { login: who.login ?? 'ghost', name: who.name ?? null, avatarUrl: who.avatarUrl ?? null }];
      }),
      requestedFromYou: isWaitingOnMe(record, account, this.teamsOf(account)),
      checkRuns: this.checkRuns(record),
      proofImages: proofImagesOf(record.body),
      allowedMergeMethods: methods,
      defaultMergeMethod: methods.includes(preferred) ? preferred : (methods[0] ?? 'merge'),
      deleteBranchOnMerge: repository.deleteBranchOnMerge,
      viewerCanMerge: ['ADMIN', 'MAINTAIN', 'WRITE'].includes(repository.viewerPermission ?? ''),
      workItems: (overview?.items ?? []).filter((e) => ids.includes(e.item.id)).map((e) => e.item),
      threads: [...threads.values()],
    };
  }

  private checkRuns(record: PrRecord): CheckRun[] {
    const order = { failure: 0, pending: 1, success: 2, neutral: 3, skipped: 4 };
    return record.checks
      .map((c): CheckRun => {
        const job = c.state === 'failure' && c.kind === 'check' && c.id > 0 ? this.store.job(c.id) : null;
        const started = c.startedAt ? Date.parse(c.startedAt) : Number.NaN;
        const completed = c.completedAt ? Date.parse(c.completedAt) : Number.NaN;
        return {
          id: c.id, name: c.name, workflow: c.workflow, state: c.state, startedAt: c.startedAt, completedAt: c.completedAt,
          durationSeconds: Number.isFinite(started) && Number.isFinite(completed) ? Math.round((completed - started) / 1000) : null,
          url: c.url, runId: c.runId, jobId: c.kind === 'check' && c.runId !== null ? c.id : null,
          failure: job ? checkFailureOf(job, this.groups, this.baseSince) : null,
        };
      })
      .sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
  }

  async files(ref: PrRef): Promise<PrFiles> {
    const { record, account } = await this.recordOf(ref);
    const client = this.client(account);
    const repo = `/repos/${ref.owner}/${ref.repo}`;
    type RawFile = { filename: string; previous_filename?: string; status: string; additions: number; deletions: number; patch?: string };
    const raw: RawFile[] = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await client.rest<RawFile[]>('GET', `${repo}/pulls/${ref.number}/files?per_page=100&page=${page}`);
      raw.push(...batch);
      if (batch.length < 100) break;
    }
    const reviewedHeadSha = myReview(record, account)?.commitSha ?? null;
    let changed: Set<string> | 'all' = new Set();
    if (reviewedHeadSha && reviewedHeadSha !== record.headSha) {
      try {
        const compare = await client.rest<{ files?: RawFile[] }>('GET', `${repo}/compare/${reviewedHeadSha}...${record.headSha}`);
        changed = new Set((compare.files ?? []).flatMap((f) => [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])]));
      } catch (error) {
        // A force-push can drop the reviewed commit; then every file counts as changed.
        if (!(error instanceof GithubError) || error.githubStatus !== 404) throw error;
        changed = 'all';
      }
    }
    const STATUS: Record<string, PrFile['status']> = { added: 'added', removed: 'removed', renamed: 'renamed', copied: 'added' };
    return {
      headSha: record.headSha,
      reviewedHeadSha,
      files: raw.map((f) => ({
        path: f.filename,
        previousPath: f.previous_filename ?? null,
        status: STATUS[f.status] ?? 'modified',
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
        changedSinceReview: changed === 'all' || changed.has(f.filename),
        category: fileCategory(f.filename, f.patch !== undefined),
      })),
    };
  }

  async conversation(ref: PrRef): Promise<PrConversation> {
    const raw = await this.client(this.accountFor(ref)).graphql<RawConversation>(CONVERSATION_QUERY, { owner: ref.owner, repo: ref.repo, number: ref.number });
    if (!raw.repository?.pullRequest) throw new UserError(`${prKey(ref)} doesn't exist.`, 404);
    return mapConversation(raw);
  }

  /** Open pull requests matching a search, best match first. A bare number or AB#123 puts that number first. */
  search(query: string): PrSummary[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const number = /^(?:ab#|#)?(\d+)$/.exec(q)?.[1];
    const words = q.split(/\s+/).filter(Boolean);
    const scored = this.pullRequests.map((pr) => {
      if (number) {
        const n = Number(number);
        return { pr, score: pr.number === n ? 3 : pr.workItemIds.includes(n) ? 2 : 0 };
      }
      const title = pr.title.toLowerCase();
      const haystack = `${title} ${pr.key.toLowerCase()} ${pr.headRef.toLowerCase()} ${pr.author.login.toLowerCase()} ${(pr.author.name ?? '').toLowerCase()} ${pr.labels.map((l) => l.name.toLowerCase()).join(' ')}`;
      if (!words.every((w) => haystack.includes(w))) return { pr, score: 0 };
      return { pr, score: 1 + (title.includes(q) ? 1 : 0) + (title.startsWith(q) ? 0.5 : 0) };
    });
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || b.pr.updatedAt.localeCompare(a.pr.updatedAt)).map((s) => s.pr);
  }

  /* ---------- actions ---------- */

  private async head(ref: PrRef, account: string) {
    const data = await this.client(account).graphql<{ repository: { pullRequest: { id: string; headRefOid: string; state: string; headRefName: string; isCrossRepository: boolean; head: RawPr['head'] } | null } | null }>(
      HEAD_QUERY, { owner: ref.owner, repo: ref.repo, number: ref.number },
    );
    const pr = data.repository?.pullRequest;
    if (!pr) throw new UserError(`${prKey(ref)} doesn't exist.`, 404);
    return { ...pr, checks: mapContexts(pr.head.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? []) };
  }

  private guardHead(head: { headRefOid: string; state: string }, expected: string) {
    if (head.state !== 'OPEN') throw new UserError('The pull request is no longer open.', 409);
    if (head.headRefOid !== expected) throw new UserError('The pull request has new commits since you loaded it. Look at them first.', 409);
  }

  /** After a write: forget the cached detail and read again soon. */
  private changed(ref: PrRef) {
    this.detailCache.delete(prKey(ref));
    this.detailReads.delete(prKey(ref));
    setTimeout(() => void this.refresh(), 1500).unref?.();
  }

  async comment(ref: PrRef, request: PostCommentRequest): Promise<void> {
    const body = cleanBody(request.body);
    const account = this.accountFor(ref);
    if (request.threadId) {
      await this.client(account).graphql(REPLY_MUTATION, { threadId: String(request.threadId), body });
    } else {
      await this.client(account).rest('POST', `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`, { body });
    }
    this.changed(ref);
  }

  async resolveThread(ref: PrRef, threadId: string): Promise<void> {
    await this.client(this.accountFor(ref)).graphql(RESOLVE_MUTATION, { threadId });
    this.changed(ref);
  }

  async review(ref: PrRef, request: SubmitReviewRequest): Promise<{ reviewId: number }> {
    if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(request.event)) throw new UserError('event must be APPROVE, REQUEST_CHANGES or COMMENT');
    const comments = Array.isArray(request.comments) ? request.comments : [];
    for (const c of comments) {
      if (typeof c.path !== 'string' || !Number.isInteger(c.line) || c.line < 1 || !['LEFT', 'RIGHT'].includes(c.side)) throw new UserError('Each comment needs a path, a line and a side.');
      cleanBody(c.body);
    }
    const body = typeof request.body === 'string' ? request.body : '';
    if (request.event !== 'APPROVE' && !body.trim() && comments.length === 0) throw new UserError('Write what you want changed first.');
    const account = this.accountFor(ref);
    this.guardHead(await this.head(ref, account), String(request.headSha));
    const review = await this.client(account).rest<{ id: number }>('POST', `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`, {
      commit_id: request.headSha, event: request.event, body, comments: comments.map((c) => ({ path: c.path, line: c.line, side: c.side, body: c.body })),
    });
    this.changed(ref);
    return { reviewId: review.id };
  }

  async merge(ref: PrRef, request: MergeRequest): Promise<MergeResponse> {
    if (!['squash', 'merge', 'rebase'].includes(request.method)) throw new UserError('method must be squash, merge or rebase');
    const account = this.accountFor(ref);
    const client = this.client(account);
    const head = await this.head(ref, account);
    this.guardHead(head, String(request.headSha));
    const title = typeof request.commitTitle === 'string' && request.commitTitle.trim() ? request.commitTitle.trim() : undefined;
    const message = typeof request.commitMessage === 'string' ? request.commitMessage : undefined;
    if (head.checks.some((c) => c.state === 'pending')) {
      await client.graphql(AUTO_MERGE_MUTATION, { id: head.id, method: request.method.toUpperCase(), headline: title ?? null, body: message ?? null, head: request.headSha });
      this.changed(ref);
      return { merged: false, autoMerge: true, message: 'Checks are still running. GitHub merges it when they pass.' };
    }
    let result: { merged: boolean; message: string };
    try {
      result = await client.rest('PUT', `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/merge`, {
        sha: request.headSha, merge_method: request.method, ...(title ? { commit_title: title } : {}), ...(message !== undefined ? { commit_message: message } : {}),
      });
    } catch (error) {
      if (error instanceof GithubError && error.githubStatus === 405) throw new UserError(error.message.replace(/^GitHub: /, 'GitHub won\'t merge it: '), 400);
      throw error;
    }
    if (result.merged && request.deleteBranch && !head.isCrossRepository) {
      await client.rest('DELETE', `/repos/${ref.owner}/${ref.repo}/git/refs/heads/${head.headRefName.split('/').map(encodeURIComponent).join('/')}`).catch(() => {});
    }
    this.changed(ref);
    return { merged: result.merged, autoMerge: false, message: result.message };
  }

  async rerunFailed(ref: PrRef): Promise<RerunResponse> {
    const account = this.accountFor(ref);
    const head = await this.head(ref, account);
    const runIds = [...new Set(head.checks.filter((c) => c.state === 'failure' && c.runId !== null).map((c) => c.runId!))];
    for (const runId of runIds) await this.client(account).rest('POST', `/repos/${ref.owner}/${ref.repo}/actions/runs/${runId}/rerun-failed-jobs`, {});
    this.changed(ref);
    return { reruns: runIds.length };
  }

  snooze(ref: PrRef, until: string | null) {
    if (until !== null && (typeof until !== 'string' || !Number.isFinite(Date.parse(until)))) throw new UserError('until must be an ISO time or null');
    this.store.snooze(prKey(ref), until === null ? null : new Date(until).toISOString());
    this.publishFocus();
  }
}

/** What a change means: not the poll time, and not a reason's age ("5 h ago" becomes "6 h ago" on its own). */
function comparable(focus: Focus): string {
  return JSON.stringify({
    ...focus,
    generatedAt: null,
    accounts: focus.accounts.map((a) => ({ ...a, polledAt: null })),
    pullRequests: focus.pullRequests.map((p) => ({ ...p, reason: { ...p.reason, text: p.reason.text.replace(/ (just now|\d+ (min|h|days?) ago)/, '') } })),
  });
}

function waitingDetail(thread: ThreadSummary): string {
  switch (thread.status) {
    case 'question': return thread.questions[0]?.question ?? 'The agent has a question.';
    case 'plan': return 'Plan ready for your go-ahead.';
    case 'approval': return 'Waiting for your approval.';
    case 'failed': return 'The agent stopped with an error.';
    default: return thread.lastAgentMessage?.replace(/\s+/g, ' ').slice(0, 160) || 'Your turn.';
  }
}

function cleanBody(body: unknown): string {
  if (typeof body !== 'string' || !body.trim()) throw new UserError('The comment is empty.');
  if (body.length > 65_000) throw new UserError('The comment is longer than 65,000 characters.');
  return body;
}

/** Images in the description, from Markdown and from the `<img>` tags GitHub's editor writes. */
export function proofImagesOf(body: string): { url: string; alt: string }[] {
  const images: { url: string; alt: string }[] = [];
  for (const m of body.matchAll(/!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g)) images.push({ url: m[2], alt: m[1] });
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const src = /\bsrc=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (src) images.push({ url: src, alt: /\balt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '' });
  }
  const seen = new Set<string>();
  return images.filter((i) => /^https:\/\//.test(i.url) && !seen.has(i.url) && seen.add(i.url));
}
