import { useEffect, useState } from 'react';
import type { Release } from '@/types/whats-new';
import { semverGt, semverLte } from '@/utils/semver';

interface ComputeInput {
  allReleases: Release[];
  currentVersion: string;
  lastSeenVersion: string | null;
  targetVersion: string | null;
}

interface ComputeResult {
  releases: Release[];
  expandedVersion: string | null;
  countBehind: number;
}

export function computeReleasesToShow(input: ComputeInput): ComputeResult {
  const { allReleases, currentVersion, lastSeenVersion, targetVersion } = input;

  const missed = allReleases.filter(
    (r) =>
      semverLte(r.version, currentVersion) &&
      (lastSeenVersion === null || semverGt(r.version, lastSeenVersion)),
  );

  const countBehind = missed.length;

  let expandedVersion: string | null = null;
  if (targetVersion && allReleases.some((r) => r.version === targetVersion)) {
    expandedVersion = targetVersion;
  } else {
    // allReleases is sorted newest-first; prefer the newest missed release,
    // else fall back to the newest overall.
    const preferred = missed[0] ?? allReleases[0];
    if (preferred) expandedVersion = preferred.version;
  }

  return { releases: allReleases, expandedVersion, countBehind };
}

interface UseResult extends ComputeResult {
  currentVersion: string;
  ready: boolean;
}

export function useReleasesToShow(
  allReleases: Release[],
  lastSeenVersion: string | null,
  initialTarget: string | null,
): UseResult {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(initialTarget);

  useEffect(() => {
    import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then(setCurrentVersion)
      .catch(() => setCurrentVersion('0.0.0'));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<string | null>;
      setTarget(custom.detail);
    };
    window.addEventListener('whats-new:navigate', handler);
    return () => window.removeEventListener('whats-new:navigate', handler);
  }, []);

  if (!currentVersion) {
    return {
      releases: allReleases,
      expandedVersion: null,
      countBehind: 0,
      currentVersion: '0.0.0',
      ready: false,
    };
  }

  const computed = computeReleasesToShow({
    allReleases,
    currentVersion,
    lastSeenVersion,
    targetVersion: target,
  });
  return { ...computed, currentVersion, ready: true };
}
