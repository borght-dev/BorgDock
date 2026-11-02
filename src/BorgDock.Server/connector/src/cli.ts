#!/usr/bin/env -S node --no-warnings
// borgdock connect --server <url> [--label <name>] [--t3 <url>] [--pair]
//   Connects this machine's T3 Code to a BorgDock server. The first run shows a QR code: scan it with BorgDock on
//   your iPhone. Later runs reconnect with the stored token; --pair shows a new code for another device.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ConnectorClient, type ConnectorState } from '../../server/src/borgdock/connector-client.ts';
import { printPairing } from '../../server/src/borgdock/pair-cli.ts';
import { T3Client } from '../../server/src/t3/client.ts';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;
const USAGE = 'Usage: borgdock connect --server <url> [--label <name>] [--t3 <url>] [--pair] [--data <dir>]';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    server: { type: 'string' },
    label: { type: 'string' },
    t3: { type: 'string', default: 'http://127.0.0.1:3773' },
    app: { type: 'string' },
    data: { type: 'string', default: join(homedir(), '.borgdock-connector') },
    pair: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals[0] !== 'connect' || !values.server) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

const serverUrl = values.server.replace(/\/+$/, '');
const dataDir = values.data!;
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const stateFile = join(dataDir, `server-${createHash('sha256').update(serverUrl).digest('hex').slice(0, 16)}.json`);
const load = (): ConnectorState => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { machineToken: null, trusted: [] });
const save = (state: ConnectorState) => writeFileSync(stateFile, JSON.stringify({ server: serverUrl, ...state }, null, 2), { mode: 0o600 });

/** T3 Code's desktop app on this machine; its bundled CLI issues the connector's T3 session. */
function t3App(): string {
  if (values.app) return values.app;
  const found = ['T3 Code (Nightly)', 'T3 Code (Alpha)', 'T3 Code'].map((name) => `/Applications/${name}.app/Contents`).find(existsSync);
  if (!found) throw new Error('T3 Code is not installed in /Applications. Pass --app "<path>/T3 Code.app/Contents".');
  return found;
}

const t3 = new T3Client({ baseUrl: values.t3!, app: t3App(), dataDir, sessionFile: join(dataDir, 't3-session.json') });
const config = await t3.rpc<{ environment: { environmentId: string } }>('server.getConfig', {}).catch((error) => {
  console.error(`T3 Code isn't reachable at ${values.t3}: ${(error as Error).message}`);
  process.exit(1);
});
const label = values.label ?? hostname().replace(/\.local$/, '');
const machine = { id: config.environment.environmentId, label, version: VERSION };

const client = new ConnectorClient({
  serverUrl,
  machine,
  t3,
  pair: values.pair,
  reconnect: true,
  load,
  save,
  onPairing: (link, code, expiresAt, typedCode) => {
    console.log(`Scan this with BorgDock on your iPhone (Settings → Machines → Add a machine) to pair ${label}:\n`);
    printPairing(link, code, expiresAt, typedCode);
  },
  onPaired: (device) => console.log(`Paired with ${device}. ${label} now takes commands signed by it.`),
  onReady: (name) => console.log(`${name} is connected to ${serverUrl}.`),
  log: (message) => console.log(message),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { client.stop(); t3.close(); });
await client.run();
t3.close();
