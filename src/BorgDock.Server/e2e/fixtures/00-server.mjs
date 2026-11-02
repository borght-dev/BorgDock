// BorgDock's own sample data: the server and account. Feature slices add their own files next to this one.
const at = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

export function handle({ path, method }) {
  if (path === '/api/server') return { apiVersion: 2, name: 'BorgDock', claimed: true, clerk: globalThis.borgdockClerk ?? null };
  if (path === '/api/account' && method === 'GET') {
    return {
      owner: { clerkUserId: 'user_sample', name: 'Koen', email: null, imageUrl: null },
      devices: [
        { sessionId: 's1', name: 'iPhone', createdAt: at(200), lastSeenAt: at(0), current: true, trustedBy: ['mac-mini'] },
        // Linked desktops live in 20-platform.mjs.
        ...(globalThis.borgdockDesktops ?? []).map((d) => ({ sessionId: d.sessionId, name: d.name, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt ?? d.createdAt, current: false, trustedBy: [], kind: 'desktop' })),
      ],
    };
  }
  return undefined;
}
