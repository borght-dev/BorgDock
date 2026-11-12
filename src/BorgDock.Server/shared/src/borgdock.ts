// BorgDock's additions to the API contract. The server implements these, the iPhone app mirrors them in Swift
// (src/BorgDock.iOS/BorgDock/Model). Routes are listed next to each type; docs/api.md covers sign-in, signing and errors.
// The iPhone mockups these screens follow: design/ios-app/mockups.html at the repository root.

import type { ModelOption, ThreadSummary, WorkItemSummary } from './api.ts';

/** How alarming something is, the desktop's five tones (services/dispatch/verdict.ts). */
export type Tone = 'bad' | 'warn' | 'ok' | 'run' | 'mute';

/* ======================================================================================
 * Server and account
 * ====================================================================================*/

/** GET /api/server (no session needed): what the app needs before it signs in. */
export type ServerInfo = {
  apiVersion: number;
  name: string;
  /** False until someone claims this server by pairing its first machine. */
  claimed: boolean;
  /** Null when the server has no Clerk application configured. */
  clerk: { publishableKey: string; frontendApi: string } | null;
};

/**
 * POST /api/auth/clerk: trade a Clerk session token for a BorgDock device session (180 days unused).
 * The Clerk token is checked once, here; afterwards the app sends `Authorization: Bearer <token>`.
 *
 * Errors: 401 the Clerk token is invalid or expired. 403 `{error, claimRequired: true}` when the server has no
 * owner yet and no `claim` was sent. 403 when the Clerk user isn't the owner.
 */
export type ClerkExchangeRequest = {
  clerkToken: string;
  deviceName: string;
  /** This device's Secure Enclave P-256 public key: base64 of the 65-byte X9.63 representation. */
  devicePublicKey: string;
  /** Only to claim an unclaimed server: the code from a machine's pairing QR, and the proof for this device. */
  claim?: PairingProof;
};
export type ClerkExchangeResponse = { token: string; sessionId: string; owner: Owner };

export type Owner = { clerkUserId: string; name: string; email: string | null; imageUrl: string | null };

/** GET /api/account */
export type Account = {
  owner: Owner;
  devices: DeviceInfo[];
};
/** `kind` is 'desktop' for a linked BorgDock desktop app (see LinkedDesktop); phones and browsers leave it out. */
export type DeviceInfo = { sessionId: string; name: string; createdAt: string; lastSeenAt: string; current: boolean; trustedBy: string[]; kind?: 'phone' | 'desktop' };

/* ======================================================================================
 * Signed commands
 *
 * Writes that start or steer agents, merge or approve carry a signature from the device's Secure Enclave key:
 *   X-BorgDock-Signed-At: <ISO time>        (within 2 minutes of the server's clock)
 *   X-BorgDock-Nonce:     <random, 16+ chars> (each used once)
 *   X-BorgDock-Signature: base64 DER ECDSA P-256/SHA-256 over
 *       `${method}\n${path}\n${signedAt}\n${nonce}\n${sha256hex(body)}`  (path without query, with the /api prefix)
 * The server checks it against the key registered for the session; a connector checks it again against the
 * device keys it trusts from pairing, so the server can relay agent commands but can't forge one.
 * Unsigned or badly signed: 403 `{error, signatureRequired: true}`.
 *
 * Signed routes: POST /api/threads, /api/agents/launch, /api/threads/:id/answers, /api/threads/:id/messages,
 * /api/threads/:id/approve-plan, /api/threads/:id/settle, /api/prs/:o/:r/:n/merge, /api/prs/:o/:r/:n/reviews
 * (every event), /api/machines/pair, /api/desktop/links/approve.
 * ====================================================================================*/

/* ======================================================================================
 * Machines and sources
 * ====================================================================================*/

export type MachineKind = 'local' | 'connector' | 'ssh';

export type Machine = {
  /** The T3 environment id. */
  id: string;
  label: string;
  kind: MachineKind;
  online: boolean;
  lastSeenAt: string | null;
  /** Open (not settled) threads. */
  threads: number;
  version: string | null;
};

/** GET /api/sources: where each source comes from and whether it works. */
export type Sources = {
  github: GithubAccountStatus[];
  ado: { org: string; project: string; via: 'account' | 'machine'; machine: string | null; ok: boolean; error: string | null } | null;
  machines: Machine[];
  /** Linked BorgDock desktop apps; empty when none is linked. */
  desktops?: LinkedDesktop[];
};
export type GithubAccountStatus = { login: string; via: 'account' | 'machine'; machine: string | null; ok: boolean; error: string | null; polledAt: string | null };

/**
 * Pairing a machine. The connector (`borgdock connect`, or `npm run cli -- pair` for the server's own machine)
 * registers with the server, gets a code, and shows a QR code:
 *   borgdock://pair?server=<url>&code=<code>&secret=<base64url 32 bytes>
 * The secret never reaches the server. The phone proves it scanned the QR by sending
 * proof = base64(HMAC-SHA256(secret, devicePublicKey bytes)).
 * When the camera can't read the QR, the machine also shows a typed code `ABCD-EFGH-JKMN-PQRS`: the server's code
 * plus an 8-character secret (Crockford alphabet) that also never reaches the server; then
 * proof = base64(HMAC-SHA256(UTF-8 of that secret, devicePublicKey bytes)) and `code` is `ABCD-EFGH`.
 * POST /api/machines/pair (signed) → Machine. 409 when the code expired or was used.
 */
export type PairingProof = { code: string; proof: string };
export type PairMachineRequest = PairingProof & { devicePublicKey: string };

/* ======================================================================================
 * GitHub: Focus and pull requests
 * ====================================================================================*/

export type FocusBucket = 'you' | 'wait' | 'ready' | 'stale';

export type CheckState = 'success' | 'failure' | 'pending' | 'neutral' | 'skipped';

export type Person = { login: string; name: string | null; avatarUrl: string | null };

export type PrLabel = { name: string; color: string };

export type PrRef = { owner: string; repo: string; number: number };

export type CheckSummary = {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  skipped: number;
  /** One per check for the check bar, failures first; at most 12. */
  segments: CheckState[];
};

/** Why a pull request is in its bucket: "Sanne asked for your review", "3 new commits since your review". */
export type PrReason = { text: string; tone: Tone; icon: 'review' | 'rerun' | 'comment' | 'approved' | 'failing' | 'clock' | 'conflict' | 'merge' };

export type PrSummary = PrRef & {
  /** `owner/repo#number`, the key everywhere (snoozes, search, activity targets). */
  key: string;
  /** The GitHub account BorgDock read it with. */
  account: string;
  title: string;
  url: string;
  author: Person;
  isMine: boolean;
  isDraft: boolean;
  state: 'open' | 'merged' | 'closed';
  headRef: string;
  baseRef: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: PrLabel[];
  checks: CheckSummary;
  reviewDecision: 'approved' | 'changes_requested' | 'review_required' | null;
  approvedBy: string[];
  mergeable: 'mergeable' | 'conflicting' | 'unknown';
  bucket: FocusBucket;
  reason: PrReason;
  /** AB# numbers in the title, body or branch. */
  workItemIds: number[];
  snoozedUntil: string | null;
  autoMerge: boolean;
  /** The head commit of your last review, for re-reviews; null if you never reviewed it. */
  reviewedHeadSha: string | null;
};

export type AgentWaiting = { itemId: number | null; threadId: string; title: string; detail: string; tone: Tone };

/** GET /api/focus */
export type Focus = {
  generatedAt: string;
  counts: Record<FocusBucket, number>;
  /** Open pull requests that involve you, in bucket order, then most urgent first. */
  pullRequests: PrSummary[];
  /** Agents waiting on you (from Dispatch), for the strip under the pull requests. */
  agentsWaiting: AgentWaiting[];
  accounts: GithubAccountStatus[];
};

export type CheckFailure = {
  step: string | null;
  /** One line: the assertion or error. */
  summary: string | null;
  /** A few lines of the log around it, sanitised. */
  snippet: string | null;
  /** file:line when the log names one. */
  location: string | null;
  newInThisPr: boolean;
  /** Set when the same failure is red on the base branch too. */
  alsoOnBase: { since: string | null; claimedBy: Person | null } | null;
  /** The related CI failure group, if any. */
  groupId: string | null;
};

export type CheckRun = {
  id: number;
  name: string;
  workflow: string | null;
  state: CheckState;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  url: string;
  runId: number | null;
  jobId: number | null;
  /** Only for failed checks; null while BorgDock hasn't read the log yet. */
  failure: CheckFailure | null;
};

export type PrReview = { author: Person; state: 'approved' | 'changes_requested' | 'commented' | 'dismissed' | 'pending'; at: string; body: string };

export type MergeMethod = 'squash' | 'merge' | 'rebase';

/** GET /api/prs/:owner/:repo/:number */
export type PrDetail = PrSummary & {
  /** Markdown. */
  body: string;
  commits: number;
  reviews: PrReview[];
  requestedReviewers: Person[];
  requestedFromYou: boolean;
  checkRuns: CheckRun[];
  /** Images in the description: the desktop's Proof tab. */
  proofImages: { url: string; alt: string }[];
  allowedMergeMethods: MergeMethod[];
  defaultMergeMethod: MergeMethod;
  deleteBranchOnMerge: boolean;
  viewerCanMerge: boolean;
  workItems: WorkItemSummary[];
  /** T3 threads working on this branch. */
  threads: ThreadSummary[];
};

export type PrFile = {
  path: string;
  previousPath: string | null;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  /** GitHub's unified patch for the file; null for binary or very large files. */
  patch: string | null;
  /** Touched by a commit after your last review. */
  changedSinceReview: boolean;
  /** How Quick Review walks it: source files one by one, tests and generated files as one step each, docs last. */
  category?: PrFileCategory;
};

export type PrFileCategory = 'source' | 'tests' | 'generated' | 'docs';

/** GET /api/github/repositories: where the Pull requests list comes from and how much was read. */
export type PrRepositories = {
  /** Where the list comes from: the linked desktop, the server's config, or nothing yet. */
  source: 'desktop' | 'config' | 'none';
  /** The desktop that sent it, and when. */
  desktopName: string | null;
  updatedAt: string | null;
  repositories: { name: string; open: number; polledAt: string | null; ok: boolean; error: string | null }[];
  /** Also read PRs that involve you in any repository (involves:@me, review-requested:@me, reviewed-by:@me). */
  includeInvolving: boolean;
  /** Count your teams' review requests (review-requested:@me), not only yours (user-review-requested:@me). */
  includeTeamRequests: boolean;
  /** The last full read, and whether any search hit GitHub's cap. */
  polledAt: string | null;
  cutOff: boolean;
};

/** PUT /api/github/repositories/preferences */
export type PrRepositoryPreferences = { includeInvolving?: boolean; includeTeamRequests?: boolean };

/** PUT /api/desktop/repositories, sent by the linked desktop with its session token. */
export type DesktopRepositoriesRequest = { repositories: string[] };

/** GET /api/prs/:owner/:repo/:number/files */
export type PrFiles = { headSha: string; reviewedHeadSha: string | null; files: PrFile[] };

export type PrComment = { id: string; author: Person; body: string; at: string; reactions: { content: string; count: number }[] };

export type ReviewThread = {
  id: string;
  path: string | null;
  line: number | null;
  /** The few diff lines the thread was left on. */
  diffHunk: string | null;
  isResolved: boolean;
  comments: PrComment[];
};

/** GET /api/prs/:owner/:repo/:number/comments */
export type PrConversation = { threads: ReviewThread[]; comments: PrComment[] };

/** POST /api/prs/:owner/:repo/:number/comments: a top-level comment, or a reply when threadId is set. → {ok} */
export type PostCommentRequest = { body: string; threadId?: string };

/** POST /api/prs/:owner/:repo/:number/threads/:threadId/resolve → {ok} */

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
/** POST /api/prs/:owner/:repo/:number/reviews (signed) → {ok, reviewId}. 409 when headSha moved on. */
export type SubmitReviewRequest = {
  event: ReviewEvent;
  body: string;
  headSha: string;
  comments: { path: string; line: number; side: 'RIGHT' | 'LEFT'; body: string }[];
};

/** POST /api/prs/:owner/:repo/:number/merge (signed). 409 when headSha moved on. */
export type MergeRequest = { method: MergeMethod; commitTitle: string; commitMessage: string; deleteBranch: boolean; headSha: string };
/** `autoMerge` true: checks were still running, so GitHub merges when they pass. */
export type MergeResponse = { merged: boolean; autoMerge: boolean; message: string };

/** POST /api/prs/:owner/:repo/:number/rerun-failed → how many workflow runs were restarted. */
export type RerunResponse = { reruns: number };

/** POST /api/prs/:owner/:repo/:number/snooze; until null clears it. → {ok} */
export type SnoozeRequest = { until: string | null };

/* ======================================================================================
 * Related CI failures
 * ====================================================================================*/

export type CiBranchHit = {
  branch: string;
  /** Null for the base branch. */
  prKey: string | null;
  title: string | null;
  failures: number;
  sha: string;
  /** For the base branch: the first red commit, the likely cause. */
  suspect: { sha: string; message: string } | null;
};

export type CiFailureGroup = {
  id: string;
  /** "e2e / checkout › keeps the basket on timeout" */
  title: string;
  /** The assertion or error lines. */
  signal: string;
  location: string | null;
  firstFailedAt: string;
  lastFailedAt: string;
  failures: number;
  branches: CiBranchHit[];
  claim: { by: Person; at: string; note: string | null } | null;
};

/** GET /api/ci/groups → CiFailureGroup[] (newest first). GET /api/ci/groups/:id → CiFailureGroup. */
/** POST /api/ci/groups/:id/claim {note} → CiFailureGroup. DELETE /api/ci/groups/:id/claim → CiFailureGroup. */
export type ClaimRequest = { note: string | null };

/* ======================================================================================
 * Dispatch: the states walk (added to Overview; older clients ignore the new fields)
 * ====================================================================================*/

export type Verdict = { label: string; tone: Tone };
export type Evidence = { label: string; tone: Tone | null; kind: 'pr' | 'merged' | 'agent' | 'due' | 'priority' | 'other' };
export type LatestMessage = { by: string; text: string; at: string; source: 'comment' | 'notes' | 'agent' };

/** Added to each ItemOverview. */
export type ItemWalk = { verdict: Verdict; evidence: Evidence[]; latest: LatestMessage | null };

/** Added to Overview: one lane per ADO state in walk order, and the briefing line. */
export type Walk = {
  lanes: { state: string; itemIds: number[]; tone: Tone | null; summary: string }[];
  briefing: { needYou: number; outOfSync: number; running: number };
};

/* ======================================================================================
 * Threads and launching agents
 * ====================================================================================*/

export type ThreadMessage = { id: string; role: 'user' | 'assistant'; text: string; at: string };

/** GET /api/threads/:id */
export type ThreadDetail = {
  thread: ThreadSummary;
  itemId: number | null;
  /** Where its agent works: the branch T3 made a worktree for, else the project title. */
  place: string;
  machine: string;
  /** Oldest first; the bounded snapshot, so long threads start mid-way. */
  messages: ThreadMessage[];
  /** The work between your message and the agent's answer, folded to one line. */
  activity: { reads: number; commands: number; minutes: number } | null;
  /** The agent proposed a plan and waits for the go-ahead (Plan first). */
  planReady: boolean;
};

/** POST /api/threads/:id/messages (signed) → {ok}. Continues a thread with a new turn. */
export type SendMessageRequest = { text: string };
/** POST /api/threads/:id/approve-plan (signed) → {ok}. Sends the go-ahead; leaves T3's plan mode if needed. */

export type LaunchTargets = {
  machines: Machine[];
  /** One per repository per machine; a repository's main checkout wins over projects made for its worktrees. */
  projects: { id: string; machineId: string; title: string; repository: string | null; defaultBranch: string | null }[];
  /** Open threads you can continue or start next to. */
  threads: { id: string; machineId: string; projectId: string; title: string; place: string; status: ThreadSummary['status'] }[];
  models: ModelOption[];
  defaultModel: string | null;
};
/** GET /api/agents/targets → LaunchTargets. GET /api/agents/branches?machine=&project= → {branches, defaultBranch}. */
export type Branches = { branches: string[]; defaultBranch: string | null };

export type LaunchWorkspace =
  | { kind: 'worktree'; baseBranch: string | null }
  | { kind: 'thread'; threadId: string; mode: 'continue' | 'beside' };

/** POST /api/agents/launch (signed) → StartThreadResponse (from api.ts). */
export type LaunchRequest = {
  machineId: string;
  projectId: string;
  workspace: LaunchWorkspace;
  /** A ModelOption id; ignored when continuing a thread. */
  model: string | null;
  effort: string | null;
  /** Appends the desktop's PLAN_FIRST instruction; never T3's plan mode. */
  planFirst: boolean;
  message: string;
  title: string;
  /** Link the thread to this work item. */
  itemId: number | null;
  /** Move the item to this ADO state once the thread starts (the one direct ADO write). */
  moveAdoTo: string | null;
  /** For Fix with Claude / Investigate: the pull request or CI group the agent works on. */
  prKey: string | null;
  ciGroupId: string | null;
};

/* ======================================================================================
 * Activity
 * ====================================================================================*/

export type ActivityCategory = 'review' | 'ci' | 'agent' | 'merge' | 'workitem' | 'comment';

export type ActivityTarget =
  | { kind: 'pr'; key: string }
  | { kind: 'item'; id: number }
  | { kind: 'thread'; id: string; itemId: number | null }
  | { kind: 'ci'; groupId: string }
  | { kind: 'none' };

export type ActivityEntry = {
  id: string;
  category: ActivityCategory;
  title: string;
  detail: string;
  at: string;
  read: boolean;
  tone: Tone;
  target: ActivityTarget;
};

/** GET /api/activity?category=<c>&before=<iso>&limit=<n> */
export type ActivityPage = {
  entries: ActivityEntry[];
  unread: number;
  unreadByCategory: Record<ActivityCategory, number>;
  /** The catch-up since you were last active, when there is one. */
  away: { from: string; to: string; merged: number; ciFailures: number; agentsDone: number; other: number } | null;
};

/** POST /api/activity/read: ids, or every unread entry with `all`. → {unread} */
export type MarkReadRequest = { ids: string[] } | { all: true };

/** GET /api/activity/digest?since=<iso>: lines for the daily note's "Since yesterday" block. */
export type Digest = { since: string; lines: { text: string; refs: string[] }[] };

/* ======================================================================================
 * Search, widgets, live activities, presence, preferences
 * ====================================================================================*/

/** GET /api/search?q=<text>. A bare number or AB#123 puts that item or pull request first. */
export type SearchResults = { query: string; pullRequests: PrSummary[]; items: WorkItemSummary[]; threads: ThreadSummary[] };

/** GET /api/widgets: a small snapshot for widgets, also pushed silently when it changes. */
export type WidgetSnapshot = {
  generatedAt: string;
  focus: { needYou: number; ready: number; waiting: number; top: { key: string; number: number; title: string; segments: CheckState[]; age: string }[] };
  agents: { waitingOnYou: number; running: number };
  master: { state: 'ok' | 'failing' | 'unknown'; repo: string | null; job: string | null; since: string | null; prsHit: number; claimedBy: string | null };
};

/**
 * Live Activities. POST /api/live-activities registers an activity's push token so the server can update it;
 * DELETE /api/live-activities/:token stops. POST /api/live-activities/start-token registers the
 * push-to-start token so the server can start an agent activity when a thread you launched starts running.
 */
export type LiveActivityRegistration = { kind: 'agent'; threadId: string; pushToken: string } | { kind: 'checks'; prKey: string; pushToken: string };
export type PushToStartRegistration = { token: string };

/** Content state of the agent Live Activity (ActivityKit ContentState); the server pushes the same JSON. */
export type AgentActivityState = { step: string; stepIndex: number; stepCount: number; status: 'running' | 'waiting' | 'done' | 'failed'; startedAt: string };
export type ChecksActivityState = { passed: number; failed: number; pending: number; total: number };

/** POST /api/presence (from the desktop app): how long you've been idle at your desk. → {ok} */
export type Presence = { device: string; idleSeconds: number };

export type CategoryDelivery = 'immediate' | 'summary' | 'off';

/** GET/PUT /api/preferences: BorgDock's notification and safety settings. */
export type BorgDockPreferences = {
  categories: Record<ActivityCategory, CategoryDelivery>;
  /** Stay quiet while the desktop app says you're at your desk. */
  quietAtDesk: boolean;
  /** Ask for Face ID before agents, merges and approvals (enforced in the app; the signature is always required). */
  faceIdForActions: boolean;
};

/** POST /api/refs/resolve: live state for workstream and note references. */
export type ResolveRefsRequest = { refs: string[] };
/** Keys are the refs as sent: `gh:github.com/owner/repo#n`, `ado:<org>#id`, `t3:<environmentId>/<threadId>`. */
export type ResolvedRefs = Record<string, { title: string; state: string; tone: Tone; url: string | null; live: boolean }>;

/* ======================================================================================
 * Push
 *
 * APNs payloads keep Dispatch's shape: `aps` plus BorgDock's data under the `dispatch` key (api.ts PushData),
 * with one more kind for activity entries. Categories (the app registers them; the server sets aps.category):
 *   BORGDOCK_QUESTION / _RECOMMENDED / _TEXT  an agent question; the content extension shows the options and
 *                                             offers one action per option (signed by the app)
 *   BORGDOCK_SUGGESTION                       a suggested ADO move ("Move in ADO", opens the run sheet)
 *   BORGDOCK_PR                               review requested, approved, changes requested ("Review", "Open")
 *   BORGDOCK_CI                               checks failed ("Open checks", "Hand to Claude")
 *   BORGDOCK_DEFAULT                          everything else; tapping opens the target
 * A silent push (`content-available: 1`, `dispatch.kind: 'refresh'`) tells the app to refresh widgets, and
 * `dispatch.kind: 'read'` with `ids` removes delivered notifications read elsewhere.
 * ====================================================================================*/

export type ActivityPush = { kind: 'activity'; entryId: string; category: ActivityCategory; target: ActivityTarget };
export type RefreshPush = { kind: 'refresh' };
export type ReadPush = { kind: 'read'; ids: string[] };

/* ======================================================================================
 * Additions from the iPhone extensions slice (I3)
 * ====================================================================================*/

/**
 * `POST /api/refs/resolve` also takes refs as notes write them: `AB#123` (the configured ADO organization) and
 * `repo#12` / `owner/repo#12` (the configured repositories). The answer stays keyed by the ref as sent.
 */
export type ShortRef = string;

/**
 * Optional fields on the `question` push data (api.ts `PushData`), for the notification content extension:
 * the question text, a context line ("AB#61044 · Offline basket · mac-mini") and each option's reason.
 * Without them the extension shows the alert's title and body. The extension offers `answer.option.<index>`
 * (the option at that index), `answer.text` (free text) and `open.thread`; the app signs and sends the answer.
 */
export type QuestionPushExtras = {
  question?: string;
  context?: string;
  options: { label: string; value: string; description?: string | null }[];
};

/* ======================================================================================
 * Owners, desktop link and read sync
 * ====================================================================================*/

/**
 * Claiming without a pairing code: `config.json` may name the owner, `"owners": { "emails": [...], "githubLogins": [...] }`.
 * An unclaimed server then lets the first Clerk user with a verified matching email (or a GitHub account with a
 * matching login) claim it on sign-in, with no pairing step. Anyone else still needs a code from the server's machine.
 */
export type OwnerAllowlist = { emails: string[]; githubLogins: string[] };

/**
 * Linking the BorgDock desktop app, so it shares read state and tells the server when you're at your desk.
 * 1. The desktop calls `POST /api/desktop/links` (no session) and shows `code` as text and as the QR
 *    `borgdock://link-desktop?server=<url>&code=<code>`.
 * 2. The phone calls `POST /api/desktop/links/approve` (signed) with the code; the server answers with the desktop's name.
 * 3. The desktop polls `GET /api/desktop/links/:linkId?secret=<pollSecret>` (no session) until it gets its token, once.
 * A desktop session may only read the server info and activity, mark read, sync reads, send presence and sign out;
 * everything else answers 403. Links expire after 10 minutes; a code works once.
 */
export type DesktopLinkRequest = { deviceName: string };
export type DesktopLinkStart = { linkId: string; code: string; pollSecret: string; expiresAt: string; link: string };
export type DesktopLinkStatus =
  | { status: 'pending' }
  | { status: 'approved'; token: string; sessionId: string; serverName: string }
  | { status: 'expired' };
export type ApproveDesktopRequest = { code: string };
export type DesktopLinkApproval = { deviceName: string; sessionId: string };

/** A linked desktop in `GET /api/sources` (`desktops`) and in `GET /api/account` devices (`kind: 'desktop'`). */
export type LinkedDesktop = { sessionId: string; name: string; lastSeenAt: string | null; atDesk: boolean };

/**
 * `POST /api/activity/read-targets` (desktop or phone): you read these things somewhere else; every unread entry about
 * them from before `before` becomes read, and the phone's delivered notifications for them clear. → {unread}
 */
export type ReadTargetsRequest = { targets: ActivityTarget[]; before: string };

/** `GET /api/activity/reads?since=<iso>`: what was read since `since`, for the desktop to mark its own journal. */
export type ReadsSince = { until: string; targets: ActivityTarget[] };
