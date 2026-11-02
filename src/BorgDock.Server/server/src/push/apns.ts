import { connect, type ClientHttp2Session } from 'node:http2';
import { sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ApnsConfig } from '../config.ts';

export type ApnsMessage = {
  title: string;
  body: string;
  category: string;
  threadId: string;
  collapseId: string;
  data: Record<string, unknown>;
};

export type ApnsResult = 'sent' | 'gone' | 'failed';

export type ApnsPush = {
  pushType: 'alert' | 'background' | 'liveactivity';
  payload: Record<string, unknown>;
  priority?: 5 | 10;
  collapseId?: string;
};

const HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' };
const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

/** Apple Push over HTTP/2 with a token (.p8) key. Inert until apns.json exists in the data directory. */
export class ApnsSender {
  private readonly config: ApnsConfig;
  private readonly key: string;
  private jwt: { value: string; issuedAt: number } | null = null;
  private sessions = new Map<string, ClientHttp2Session>();

  constructor(config: ApnsConfig) {
    this.config = config;
    this.key = readFileSync(config.keyFile, 'utf8');
  }

  // Apple accepts a provider token for up to an hour and rejects refreshing more than every 20 minutes.
  private token(): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.jwt && nowSeconds - this.jwt.issuedAt < 40 * 60) return this.jwt.value;
    const header = base64url(JSON.stringify({ alg: 'ES256', kid: this.config.keyId }));
    const claims = base64url(JSON.stringify({ iss: this.config.teamId, iat: nowSeconds }));
    const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: this.key, dsaEncoding: 'ieee-p1363' });
    this.jwt = { value: `${header}.${claims}.${base64url(signature)}`, issuedAt: nowSeconds };
    return this.jwt.value;
  }

  private session(environment: 'production' | 'sandbox'): ClientHttp2Session {
    const existing = this.sessions.get(environment);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = connect(HOSTS[environment]);
    session.on('error', () => this.sessions.delete(environment));
    session.on('close', () => this.sessions.delete(environment));
    this.sessions.set(environment, session);
    return session;
  }

  send(deviceToken: string, environment: 'production' | 'sandbox', message: ApnsMessage): Promise<ApnsResult> {
    return this.push(deviceToken, environment, {
      pushType: 'alert',
      collapseId: message.collapseId,
      payload: {
        aps: {
          alert: { title: message.title, body: message.body },
          sound: 'default',
          category: message.category,
          'thread-id': message.threadId,
        },
        ...message.data,
      },
    });
  }

  /**
   * Any APNs push: `alert`, a silent `background` push (priority 5), or a `liveactivity` update on the
   * `<bundleId>.push-type.liveactivity` topic.
   */
  push(deviceToken: string, environment: 'production' | 'sandbox', push: ApnsPush): Promise<ApnsResult> {
    const topic = push.pushType === 'liveactivity' ? `${this.config.bundleId}.push-type.liveactivity` : this.config.bundleId;
    const priority = push.priority ?? (push.pushType === 'background' ? 5 : 10);
    return new Promise((resolve) => {
      const request = this.session(environment).request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.token()}`,
        'apns-topic': topic,
        'apns-push-type': push.pushType,
        'apns-priority': String(priority),
        ...(push.collapseId ? { 'apns-collapse-id': push.collapseId.slice(0, 64) } : {}),
      });
      let status = 0;
      let body = '';
      request.setTimeout(15_000, () => request.close());
      request.on('response', (headers) => { status = Number(headers[':status']); });
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        if (status === 200) return resolve('sent');
        let reason = '';
        try { reason = body ? JSON.parse(body).reason : ''; } catch { /* not JSON */ }
        resolve(status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' ? 'gone' : 'failed');
      });
      request.on('error', () => resolve('failed'));
      request.end(JSON.stringify(push.payload));
    });
  }

  close() {
    for (const s of this.sessions.values()) s.close();
  }
}
