// The repositories the Pull requests list reads (Settings → Pull requests → Repositories): the sixteen the desktop
// watches, each read on its own. `/preview/repositories-error` makes one fail, `/preview/repositories-cut-off` hits
// GitHub's cap, `/preview/repositories-reset` puts both back.
import { openByRepository } from './10-github.mjs';

const at = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
const names = [
  'acme/shop', 'acme/storefront', 'acme/payments', 'acme/infra', 'acme/shop-api', 'borght-dev/BorgDock', 'acme/catalogue', 'acme/search',
  'acme/mobile', 'acme/design-system', 'acme/docs', 'acme/auth', 'acme/notifications', 'acme/warehouse', 'acme/analytics', 'acme/admin',
];
const preferences = { includeInvolving: true, includeTeamRequests: true };
let failing = null;
let cutOff = false;

function repositories() {
  const open = openByRepository();
  return {
    source: 'desktop',
    desktopName: 'Koen’s desktop',
    updatedAt: at(3600),
    repositories: names.map((name) => ({
      name,
      open: name === failing ? 0 : open.get(name) ?? 0,
      polledAt: at(20),
      ok: name !== failing,
      error: name === failing ? 'Not Found: the GitHub account can’t read this repository.' : null,
    })),
    ...preferences,
    polledAt: at(30),
    cutOff,
  };
}

export function handle({ path, method, body, writes }) {
  if (path === '/api/github/repositories' && method === 'GET') return repositories();
  if (path === '/api/github/repositories/preferences' && method === 'PUT') {
    writes.push({ path, body });
    for (const key of Object.keys(preferences)) if (typeof body[key] === 'boolean') preferences[key] = body[key];
    return repositories();
  }
  if (path === '/preview/repositories-error') { failing = 'acme/warehouse'; return { ok: true }; }
  if (path === '/preview/repositories-cut-off') { cutOff = true; return { ok: true }; }
  if (path === '/preview/repositories-reset') { failing = null; cutOff = false; return { ok: true }; }
  return undefined;
}
