import { LOCAL_T3_HOST_ID, type T3HostRef } from '@/services/t3/api';
import type { AppSettings } from '@/types';

/** A T3 server Dispatch follows. */
export interface DispatchHost {
  id: string;
  label: string;
  /** Absent for the T3 on this machine. */
  baseUrl?: string;
}

export const LOCAL_HOST: DispatchHost = { id: LOCAL_T3_HOST_ID, label: 'This machine' };

/** The hosts to follow: the T3 on this machine, then the ones on other machines. */
export function configuredHosts(settings: AppSettings): DispatchHost[] {
  const remote = (settings.agents?.t3Hosts ?? [])
    .filter((host) => host.id && host.id !== LOCAL_T3_HOST_ID && host.baseUrl.trim())
    .map((host) => ({
      id: host.id,
      label: host.label.trim() || host.id,
      baseUrl: host.baseUrl.trim(),
    }));
  return [LOCAL_HOST, ...remote];
}

export function isRemote(host: Pick<DispatchHost, 'id'>): boolean {
  return host.id !== LOCAL_T3_HOST_ID;
}

export function hostRef(host: DispatchHost): T3HostRef {
  return { id: host.id, baseUrl: host.baseUrl };
}

/** Ids from a remote host carry the host id, so two hosts never collide. */
export function scopedId(hostId: string, id: string): string {
  return hostId === LOCAL_T3_HOST_ID ? id : `${hostId}:${id}`;
}

/** The id T3 itself knows a thread or project by. */
export function rawId(hostId: string, id: string): string {
  const prefix = `${hostId}:`;
  return hostId !== LOCAL_T3_HOST_ID && id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** What is wrong with `address` as a host's address, or `null` when nothing is. */
export function addressProblem(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return 'Give the address of the T3 server.';
  if (!/^https?:\/\//i.test(trimmed)) return 'Start the address with http:// or https://.';
  try {
    new URL(trimmed);
    return null;
  } catch {
    return 'That is not a valid address.';
  }
}
