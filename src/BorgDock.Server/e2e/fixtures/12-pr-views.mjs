// Saved pull request views the phone and the linked desktop share (GET/PUT /api/pr-views): two the desktop saved,
// kept in memory and written by compare and set like the server. `/preview/pr-views-reset` puts them back.
const desktopDisplay = (fields) => ({
  layout: 'table', groupBy: 'status', subGroupBy: 'none', sortBy: 'priority', sortDir: 'desc', pinYourTurn: true,
  collapseQuiet: false, showEmptyGroups: false, columns: ['checks', 'reviews', 'next', 'size', 'updated'], ...fields,
});
const seeded = () => ({
  revision: 3,
  views: [
    { id: 'view-shop', name: 'Shop, green', filter: 'all', query: 'repo:shop,storefront -checks:failing', display: desktopDisplay({ subGroupBy: 'repo' }) },
    { id: 'view-payments', name: 'Payments', filter: 'all', query: 'repo:payments', display: desktopDisplay({ groupBy: 'author' }) },
  ],
  updatedAt: new Date(Date.now() - 3600_000).toISOString(),
});
let state = seeded();

export function handle({ path, method, body, writes }) {
  if (path === '/preview/pr-views-reset') {
    state = seeded();
    return { ok: true };
  }
  if (path !== '/api/pr-views') return undefined;
  if (method === 'GET') return state;
  if (method !== 'PUT') return undefined;
  writes.push({ path, body });
  if (body?.baseRevision !== state.revision) return { httpStatus: 409, error: 'Your saved views changed on another device.', current: state };
  state = { revision: state.revision + 1, views: body.views ?? [], updatedAt: new Date().toISOString() };
  return state;
}
