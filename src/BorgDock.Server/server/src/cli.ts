// Local administration. Runs on the Mac against the same database as the server.
//   npm run cli -- setup-code        one-time code to register a passkey (first device, or recovery)
//   npm run cli -- sessions          signed-in browsers and apps
//   npm run cli -- revoke <id>       sign a session out
//   npm run cli -- passkeys          registered passkeys
//   npm run cli -- pair              QR code to pair BorgDock on a phone with this machine (and claim the server)
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { SetupCodes } from './auth/codes.ts';
import { Sessions } from './auth/sessions.ts';
import { pairThisMachine } from './borgdock/pair-cli.ts';

const config = loadConfig();
const db = openDb(config.dataDir);
const [command, argument] = process.argv.slice(2);

switch (command) {
  case 'setup-code': {
    const { code, expiresAt } = new SetupCodes(db).create();
    console.log(`Setup code: ${code}\nOpen ${config.publicOrigin}/setup on the device and enter it before ${expiresAt}.`);
    break;
  }
  case 'sessions':
    console.table(new Sessions(db).list(null).map(({ id, kind, name, lastSeenAt, lastSeenVia }) => ({ id, kind, name, lastSeenAt, lastSeenVia })));
    break;
  case 'revoke':
    console.log(argument && new Sessions(db).revoke(argument) ? 'Signed out.' : 'No active session with that id.');
    break;
  case 'passkeys':
    console.table(db.prepare('SELECT name, created_at, last_used_at FROM passkeys').all());
    break;
  case 'pair':
    await pairThisMachine(config);
    break;
  default:
    console.log('Commands: setup-code, sessions, revoke <id>, passkeys, pair');
}
db.close();
