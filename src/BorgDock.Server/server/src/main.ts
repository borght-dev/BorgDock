import { serve } from '@hono/node-server';
import { writeFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { join } from 'node:path';
import { createApp } from './api/app.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { Notifier } from './push/notifier.ts';
import { DispatchService } from './service.ts';
import { GithubService } from './github/service.ts';

// Everything Dispatch writes (database, keys, sessions) is for this user only.
process.umask(0o077);
const config = loadConfig();
const db = openDb(config.dataDir);
const notifier = new Notifier(config, db);
const service = new DispatchService(config, db, notifier);
const github = new GithubService(config, db, service);
const { app, setupCodes, passkeys } = createApp({ config, db, service, notifier, github });

if (config.clerk) {
  // With Clerk, a server is claimed from the phone with a pairing code shown on this machine.
  const owned = (() => {
    try { return Boolean(db.prepare('SELECT 1 FROM bd_owner').get()); } catch { return false; }
  })();
  const allowed = [...config.owners.emails, ...config.owners.githubLogins];
  if (!owned) {
    console.log(allowed.length
      ? `Nobody owns ${config.serverName} yet. Sign in on your iPhone as ${allowed.join(', ')} to claim it, or run npm run cli -- pair on this machine.`
      : `Nobody owns ${config.serverName} yet. Run npm run cli -- pair on this machine and scan the code with BorgDock on your iPhone.`);
  }
} else if (passkeys.count() === 0) {
  const { code, expiresAt } = setupCodes.create();
  const url = `${config.publicOrigin}/setup`;
  const file = join(config.dataDir, 'setup-code.txt');
  writeFileSync(file, `${code}\n${url}\nexpires ${expiresAt}\n`, { mode: 0o600 });
  console.log(`No passkeys yet. Open ${url} with the setup code in ${file} (valid until ${expiresAt}), or run npm run cli -- setup-code.`);
}

service.start();
github.start();
// Connectors dial in on /api/connector; a busy T3 shell is several megabytes per frame.
const websocket = { server: new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 }) };
const server = serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1', websocket }, ({ port }) => {
  console.log(`${config.serverName} listening on 127.0.0.1:${port}, public origin ${config.publicOrigin}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    service.stop();
    github.stop();
    notifier.close();
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
