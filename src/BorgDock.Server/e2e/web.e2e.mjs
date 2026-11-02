// End-to-end check of the web app against a running dev server, with a virtual passkey authenticator.
//   DISPATCH_URL=http://localhost:8796 SETUP_CODE=XXXXX-XXXXX node e2e/web.e2e.mjs
// Every write that would reach T3 or Azure DevOps is intercepted and answered with a fake success.
import { chromium } from 'playwright';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const BASE = process.env.DISPATCH_URL ?? 'http://localhost:8796';
const SETUP_CODE = process.env.SETUP_CODE;
const OUT = new URL('../e2e/shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const SIDE_EFFECTS = /\/api\/(threads|items\/\d+\/(state|dismiss)|queue)/;
const intercepted = [];
const check = (ok, message) => {
  if (!ok) throw new Error(`FAILED: ${message}`);
  console.log(`ok - ${message}`);
};

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.route(SIDE_EFFECTS, (route) => {
  if (route.request().method() === 'GET') return route.continue();
  intercepted.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON?.() ?? null });
  const body = route.request().url().includes('/state') ? { state: 'Faked' } : route.request().url().endsWith('/threads') ? { threadId: 'fake', link: 'about:blank', adoState: null, warning: null } : { ok: true };
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});

const cdp = await context.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

// 1. Signed out: data is refused and the app asks for setup.
check((await page.request.get(`${BASE}/api/overview`)).status() === 401, 'API refuses data without a session');
await page.goto(BASE);
await page.getByText(/Set up Dispatch|Sign in/).first().waitFor();
await page.screenshot({ path: `${OUT}01-signed-out.png` });

// 2. Enrol with the setup code and a new passkey.
if (SETUP_CODE) {
  await page.goto(`${BASE}/setup`);
  await page.getByLabel('Setup code').fill('WRONG-CODE0');
  await page.getByRole('button', { name: 'Create passkey' }).click();
  await page.getByRole('alert').waitFor();
  check(/wrong or expired/.test(await page.getByRole('alert').innerText()), 'a wrong setup code is refused');
  await page.getByLabel('Setup code').fill(SETUP_CODE);
  await page.getByRole('button', { name: 'Create passkey' }).click();
}
await page.locator('.review-row').first().waitFor({ timeout: 30_000 });
check(true, 'signed in and the overview shows work items');
await page.screenshot({ path: `${OUT}02-overview.png` });

// 3. Sign out, then back in with the passkey.
await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Dispatch-Intent': '1' } }));
await page.goto(BASE);
await page.getByRole('button', { name: 'Sign in with passkey' }).click();
await page.locator('.review-row').first().waitFor({ timeout: 30_000 });
check(true, 'signed back in with the passkey');

// 4. Item details for a waiting and a drift item.
const firstIn = (bay) => page.locator(`#bay-${bay} .review-row`).first();
if (await page.locator('#bay-waiting .review-row').count()) {
  await firstIn('waiting').click();
  await page.locator('.detail .sheet').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}03-waiting-detail.png` });
}
await page.locator('.rail .nav').filter({ hasText: 'Out of sync' }).click();
if (await page.locator('#bay-drift .review-row').count()) {
  await firstIn('drift').click();
  await page.locator('.detail .item-facts').waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}04-drift-detail.png` });
}

// 5. Start sheet: fill it in, start (intercepted), and check what would be sent.
// Occupancy changes during the day. Reserve a sample slot only in this browser's responses.
const reserveSampleSlot = async (route) => {
  const response = await route.fetch();
  const overview = await response.json();
  const slot = overview.worktrees.find((w) => w.name === 'M9') ?? overview.worktrees.at(-1);
  if (slot) Object.assign(slot, { state: 'free', itemId: null, running: false, needsYou: false });
  else overview.worktrees.push({ name: 'M9', state: 'free', itemId: null, running: false, needsYou: false });
  await route.fulfill({ response, json: overview });
};
await page.route('**/api/overview', reserveSampleSlot);
await page.route('**/api/refresh', reserveSampleSlot);
await page.reload();
await page.locator('.rail .nav').filter({ hasText: 'Not started' }).click();
await firstIn('idle').click();
await page.locator('.detail').getByRole('button', { name: 'Start in T3', exact: true }).click();
await page.locator('.launch').waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}05-start-sheet.png` });
await page.getByRole('button', { name: 'Start in background' }).click();
await page.locator('.toast').first().waitFor();
const start = intercepted.find((r) => r.path === '/api/threads');
check(start && start.body.worktree && start.body.prompt.includes(`AB#${start.body.itemId}`) && start.body.mode === 'plan', 'Start sends worktree, plan mode and a prompt naming the item');
check(/^(codex|claudeAgent)\//.test(start.body.model) && typeof start.body.effort === 'string' && !('agent' in start.body), `Start sends a model and reasoning level (${start.body.model}, ${start.body.effort})`);

// 5b. Update for QA: same sheet, third option.
await page.locator('.detail').getByRole('button', { name: 'Start in T3', exact: true }).click();
await page.locator('.launch').waitFor();
await page.getByRole('button', { name: 'Update for QA' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}05b-start-sheet-qa.png` });
await page.getByRole('button', { name: 'Start in background' }).click();
await page.waitForTimeout(800);
const qa = intercepted.filter((r) => r.path === '/api/threads').at(-1);
check(qa.body.mode === 'qa' && /ado-update-for-qa/.test(qa.body.prompt) && qa.body.moveAdoTo === null, 'Update for QA sends the QA skill prompt and leaves the ADO state to the agent');

// 5c. Close as done.
await page.locator('.detail').getByRole('button', { name: 'Start in T3', exact: true }).click();
await page.locator('.launch').waitFor();
await page.getByRole('button', { name: 'Close as done' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}05c-start-sheet-done.png` });
await page.getByRole('button', { name: 'Start in background' }).click();
await page.waitForTimeout(800);
const done = intercepted.filter((r) => r.path === '/api/threads').at(-1);
check(done.body.mode === 'done' && /as Done without QA/.test(done.body.prompt) && done.body.moveAdoTo === null, 'Close as done sends the done prompt and leaves the ADO state to the agent');

// 6. Browse, settings.
await page.goto(`${BASE}/browse`);
await page.locator('.strip').first().waitFor({ timeout: 30_000 });
await page.screenshot({ path: `${OUT}06-browse.png` });
await page.goto(`${BASE}/settings`);
await page.getByText('Signed-in devices').waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}07-settings.png`, fullPage: true });

// 7. iPhone app sign-in: code from the signed-in browser, redeemed with the PKCE verifier.
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const { code } = await page.evaluate(async (c) => (await fetch('/api/auth/app/code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dispatch-Intent': '1' }, body: JSON.stringify({ codeChallenge: c }) })).json(), challenge);
const wrong = await page.request.post(`${BASE}/api/auth/app/token`, { headers: { 'X-Dispatch-Intent': '1' }, data: { code, codeVerifier: 'x'.repeat(43), deviceName: 'e2e' } });
check(wrong.status() === 400, 'an app code with the wrong verifier is refused (and burned)');
const { code: code2 } = await page.evaluate(async (c) => (await fetch('/api/auth/app/code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dispatch-Intent': '1' }, body: JSON.stringify({ codeChallenge: c }) })).json(), challenge);
const token = await (await page.request.post(`${BASE}/api/auth/app/token`, { headers: { 'X-Dispatch-Intent': '1' }, data: { code: code2, codeVerifier: verifier, deviceName: 'e2e iPhone' } })).json();
const appRequest = await browser.newContext().then((c) => c.request.get(`${BASE}/api/overview`, { headers: { Authorization: `Bearer ${token.token}` } }));
check(appRequest.status() === 200, 'the app token reads the overview');

// 8. Phone layout.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE);
await page.locator('.review-row').first().waitFor();
await page.screenshot({ path: `${OUT}08-phone-overview.png` });
await page.locator('.review-row').first().click();
await page.locator('.sheet').waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}09-phone-detail.png` });

console.log(`intercepted writes: ${intercepted.map((r) => r.path).join(', ') || 'none'}`);
await browser.close();
