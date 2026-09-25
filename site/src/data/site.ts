// Site-wide facts read at build time: the app version, the published release
// and what it offers per platform. Nothing here runs in the browser.
import appPackage from '../../../src/BorgDock.Tauri/package.json';
import { releases as changelogReleases } from './changelog';
import release from './release.json';

export type Os = 'win' | 'mac' | 'linux';

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
  digest?: string;
}

export interface Release {
  repo: string;
  tag: string;
  version: string;
  name: string;
  date: string;
  url: string;
  fetchedAt: string;
  assets: ReleaseAsset[];
}

export const REPO_URL = `https://github.com/${release.repo}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const appVersion: string = appPackage.version;
export const latestRelease: Release = release;

function parse(v: string): [number, number, number] {
  const [a = 0, b = 0, c = 0] = v
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  return [a, b, c];
}

export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * The download page must not offer a release far behind the ones the
 * changelog says are out. An app version ahead of the latest release is the
 * normal state between a version bump and its release, so that only warns.
 * The build fails when two or more CHANGELOG.md releases dated before today
 * are newer than release.json: those were published and the site missed them.
 */
function assertReleaseFresh(): void {
  const today = new Date().toISOString().slice(0, 10);
  const missing = changelogReleases.filter(
    (r) => compareVersions(r.v, latestRelease.version) > 0 && r.date < today,
  );
  if (missing.length > 1) {
    throw new Error(
      `site/src/data/release.json describes release ${latestRelease.version}, but CHANGELOG.md lists ` +
        `${missing.length} newer published releases (${missing.map((r) => r.v).join(', ')}). ` +
        'Run `bun run site:release` from the repo root to fetch the latest GitHub release, then build again.',
    );
  }
  if (compareVersions(appVersion, latestRelease.version) > 0) {
    console.warn(
      `[site] The app is at ${appVersion} but the latest release is ${latestRelease.version}; ` +
        'the site offers the release. Run `bun run site:release` once the new version is published.',
    );
  }
}
assertReleaseFresh();

const OS_OF: [RegExp, Os, string][] = [
  [/\.(exe|msi)$/i, 'win', 'Windows'],
  [/\.(dmg|pkg)$|\.app\.tar\.gz$/i, 'mac', 'macOS'],
  [/\.(AppImage|deb|rpm)$/i, 'linux', 'Linux'],
];

export const OS_NAME: Record<Os, string> = { win: 'Windows', mac: 'macOS', linux: 'Linux' };

export interface Installer extends ReleaseAsset {
  os: Os;
  kind: string;
  sha256?: string;
}

function kindOf(name: string): string {
  if (/-setup\.exe$/i.test(name)) return 'Installer (.exe)';
  if (/\.msi$/i.test(name)) return 'MSI installer';
  if (/\.dmg$/i.test(name)) return 'Disk image (.dmg)';
  if (/\.AppImage$/i.test(name)) return 'AppImage';
  if (/\.deb$/i.test(name)) return 'Debian package';
  if (/\.rpm$/i.test(name)) return 'RPM package';
  return name.split('.').pop() ?? name;
}

/** The installable assets of the release, grouped per OS (updater files left out). */
export const installers: Installer[] = latestRelease.assets.flatMap((a) => {
  const hit = OS_OF.find(([re]) => re.test(a.name));
  if (!hit) return [];
  return [
    {
      ...a,
      os: hit[1],
      kind: kindOf(a.name),
      sha256: a.digest?.startsWith('sha256:') ? a.digest.slice('sha256:'.length) : undefined,
    },
  ];
});

export function primaryInstaller(os: Os): Installer | undefined {
  return installers.find((i) => i.os === os);
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[(m ?? 1) - 1]} ${d}, ${y}`;
}
