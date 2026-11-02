import type { Overview } from '../../../shared/src/api.ts';
import type { RouteDeps } from '../api/context.ts';
import { BorgDockPusher } from '../push/borgdock.ts';
import { LiveActivities, type LiveThread } from '../push/live-activities.ts';
import { ActivityJournal } from './activity.ts';
import { ciDrafts, focusDrafts, overviewDrafts } from './activity-derive.ts';
import { Sessions } from '../auth/sessions.ts';
import { ClerkVerifier } from './clerk.ts';
import { DesktopLinks, Desktops } from './desktops.ts';
import { DeviceKeys } from './devices.ts';
import { MachineHub } from './machines.ts';
import { Owners } from './owner.ts';
import { PresenceBoard, Preferences } from './preferences.ts';

const SUMMARY_CHECK_MS = 5 * 60_000;

/**
 * BorgDock's platform on top of Dispatch: owner and devices, machines and connectors, the activity journal and
 * its pushes, Live Activities. One per app; the route modules share it.
 */
export class Platform {
  readonly deps: RouteDeps;
  readonly owners: Owners;
  readonly devices: DeviceKeys;
  readonly desktops: Desktops;
  readonly desktopLinks: DesktopLinks;
  readonly hub: MachineHub;
  readonly journal: ActivityJournal;
  readonly preferences: Preferences;
  readonly presence: PresenceBoard;
  readonly pusher: BorgDockPusher;
  readonly live: LiveActivities;
  readonly clerk: ClerkVerifier | null;
  private timer: NodeJS.Timeout | null = null;
  private linkTimer: NodeJS.Timeout | null = null;

  constructor(deps: RouteDeps) {
    this.deps = deps;
    const { config, db, notifier } = deps;
    this.owners = new Owners(db);
    this.devices = new DeviceKeys(db);
    this.desktops = new Desktops(db);
    const sessions = new Sessions(db);
    this.desktopLinks = new DesktopLinks((sessionId) => sessions.revoke(sessionId));
    this.desktops.revokeUncollected((sessionId) => sessions.revoke(sessionId));
    this.presence = new PresenceBoard((sessionId) => sessions.isActive(sessionId));
    this.hub = new MachineHub(config, db, () => deps.service.fleet ?? null);
    this.journal = new ActivityJournal(db);
    this.preferences = new Preferences(db);
    const sender = () => notifier.apnsSender ?? null;
    this.pusher = new BorgDockPusher({ db, sender, preferences: this.preferences, presence: this.presence });
    this.live = new LiveActivities(db, sender, () => (config.apns?.production === false ? 'sandbox' : 'production'));
    // clerk.json may name another Backend API (a local stand-in for tests); Clerk's own is the default.
    const backendApi = (config.clerk as { backendApi?: string } | null)?.backendApi;
    this.clerk = config.clerk ? new ClerkVerifier(config.clerk, { backendApi }) : null;
  }

  start() {
    const { service, github, notifier } = this.deps;
    notifier.apnsFromActivity = true;
    service.pullRequestsForWalk = () => github.pullRequests;
    if (service.fleet) this.hub.attachKnown();
    service.on('overview', (overview: Overview) => this.overviewChanged(overview));
    github.on('focus', (focus) => {
      service.invalidate?.();
      this.journal.commit('github', focusDrafts(focus));
      this.live.checksChanged(focus.pullRequests).catch(() => {});
      this.pusher.scheduleRefresh();
    });
    github.on('ci', (groups) => this.journal.commit('ci', ciDrafts(groups)));
    this.journal.on('entries', (committed) => { this.pusher.deliver(committed).catch((error) => console.error('BorgDock push failed', error)); });
    this.timer = setInterval(() => { this.pusher.flushSummary().catch(() => {}); }, SUMMARY_CHECK_MS);
    this.timer.unref();
    // An approved link nobody picks up is revoked when it expires, not only when the next link comes along.
    this.linkTimer = setInterval(() => this.desktopLinks.sweep(), 30_000);
    this.linkTimer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.linkTimer) clearInterval(this.linkTimer);
    this.pusher.stop();
  }

  /**
   * The overview journals only once ADO and a T3 host answer: a half-read world would seed wrong. A machine that
   * comes online later brings its facts as one burst, which pushes as one summary.
   */
  private overviewChanged(overview: Overview) {
    const { ado, environments } = overview.sources;
    const read = ado?.ok && (environments ?? []).some((e) => e.ok);
    const launched = this.live.launchedThreads();
    if (read) this.journal.commit('dispatch', overviewDrafts(overview, launched, overview.generatedAt));
    this.live.threadsChanged(this.liveThreads(overview)).catch(() => {});
    this.pusher.scheduleRefresh();
  }

  liveThreads(overview: Overview | null = this.deps.service.overview): Map<string, LiveThread> {
    const itemOf = new Map<string, number>();
    for (const o of overview?.items ?? []) for (const t of o.threads) itemOf.set(t.id, o.item.id);
    const threads = new Map<string, LiveThread>();
    const fleet = this.deps.service.fleet;
    if (!fleet) return threads;
    for (const t of fleet.threads.values()) {
      threads.set(t.id, {
        id: t.id, title: t.title, place: t.worktreePath && t.branch ? t.branch : t.worktree, machine: t.environmentLabel ?? '', itemId: itemOf.get(t.id) ?? null, status: t.status, createdAt: t.createdAt,
      });
    }
    return threads;
  }
}

const platforms = new WeakMap<RouteDeps, Platform>();

/** The app's platform; made and started the first time a route module asks for it. */
export function platformFor(deps: RouteDeps): Platform {
  let platform = platforms.get(deps);
  if (!platform) {
    platform = new Platform(deps);
    platforms.set(deps, platform);
    platform.start();
  }
  return platform;
}
