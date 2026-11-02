import QRCode from 'qrcode';
import type { Config } from '../config.ts';
import { ConnectorClient, type ConnectorState } from './connector-client.ts';

/** Prints a pairing QR for a terminal, with the link under it for when the camera can't read it. */
export async function printPairing(link: string, code: string, expiresAt: string, typedCode: string) {
  console.log(await QRCode.toString(link, { type: 'terminal', small: true }));
  console.log(`Or type ${typedCode} in the app. Valid until ${new Date(expiresAt).toLocaleTimeString()}.`);
  console.log(`Link: ${link}\n`);
}

/**
 * `npm run cli -- pair`: a pairing QR for this machine, the server's own. It connects over loopback (the only way a
 * claim code is made), holds the secret, and checks the phone's proof itself. Stops once a device paired.
 */
export async function pairThisMachine(config: Config): Promise<void> {
  let state: ConnectorState = { machineToken: null, trusted: [] };
  let paired = false;
  const client = new ConnectorClient({
    serverUrl: `http://127.0.0.1:${config.port}`,
    machine: { id: config.t3.environmentId, label: config.t3.label, version: null },
    t3: null,
    local: true,
    load: () => state,
    save: (next) => { state = next; },
    onPairing: (link, code, expiresAt, typedCode) => {
      console.log(`Scan this with BorgDock on your iPhone to pair ${config.t3.label}${config.serverName ? ` (${config.serverName})` : ''}:\n`);
      printPairing(link, code, expiresAt, typedCode);
    },
    onPaired: (device) => {
      paired = true;
      console.log(`Paired with ${device}.`);
      client.stop();
    },
    log: (message) => console.log(message),
  });
  const timeout = setTimeout(() => {
    console.log('The code expired. Run npm run cli -- pair again.');
    client.stop();
  }, 10 * 60_000);
  await client.run();
  clearTimeout(timeout);
  if (!paired) process.exitCode = 1;
}
