import type {
  AnswerRequest, AppConfig, AuthStatus, BrowseQuery, BrowseResult, ItemDetail, MoveStateResponse, NotificationPreferences, Overview,
  PasskeyInfo, SessionInfo, StartOptions, StartThreadRequest, StartThreadResponse,
} from '../../shared/src/api.ts';
import { devicePublicKey, signatureHeaders } from './device-key.ts';

export class ApiError extends Error {
  readonly status: number;
  /** The server wants a fresh passkey check before it does this. */
  readonly reverify: boolean;
  constructor(status: number, message: string, reverify = false) {
    super(message);
    this.status = status;
    this.reverify = reverify;
  }
}

// Commands that start or steer agents carry the device's signature.
const SIGNED = /^\/api\/threads(\/[^/]+\/(answers|settle))?$/;

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const text = body === undefined ? undefined : JSON.stringify(body);
  const signed = method === 'POST' && SIGNED.test(path) ? await signatureHeaders(method, path, text ?? '') : {};
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(text === undefined ? {} : { 'Content-Type': 'application/json' }), 'X-Dispatch-Intent': '1', ...signed },
    body: text,
  });
  const answer = await response.text();
  const json = answer ? JSON.parse(answer) : {};
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('dispatch:signed-out'));
    // A session from before device keys: bind this browser's key (after a passkey check) and try once more.
    if (json.signatureRequired && !retried) {
      const { withPasskeyCheck } = await import('./passkeys.ts');
      await withPasskeyCheck(bindDeviceKey);
      return request<T>(method, path, body, true);
    }
    throw new ApiError(response.status, json.error ?? `Request failed (${response.status})`, Boolean(json.reverify));
  }
  return json as T;
}

/** Binds this browser's key to the session; needs a passkey check from the last few minutes. */
export async function bindDeviceKey(): Promise<void> {
  try {
    await request('POST', '/api/devices/key', { devicePublicKey: await devicePublicKey() });
  } catch (error) {
    // 409: the session has a key already. If it isn't this browser's, signing in again makes a fresh pair.
    if (!(error instanceof ApiError && error.status === 409)) throw error;
  }
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T = { ok: true }>(path: string, body: unknown = {}) => request<T>('POST', path, body);

export const api = {
  authStatus: () => get<AuthStatus>('/api/auth/status'),
  logout: () => post('/api/auth/logout'),
  sessions: () => get<SessionInfo[]>('/api/auth/sessions'),
  revokeSession: (id: string) => request('DELETE', `/api/auth/sessions/${id}`),
  passkeys: () => get<PasskeyInfo[]>('/api/auth/passkeys'),
  renamePasskey: (id: string, name: string) => request('PATCH', `/api/auth/passkeys/${encodeURIComponent(id)}`, { name }),
  removePasskey: (id: string) => request('DELETE', `/api/auth/passkeys/${encodeURIComponent(id)}`),
  appCode: (codeChallenge: string) => post<{ code: string; redirect: string }>('/api/auth/app/code', { codeChallenge }),

  config: () => get<AppConfig>('/api/config'),
  overview: () => get<Overview>('/api/overview'),
  syncNow: () => post<Overview>('/api/refresh'),
  item: (id: number) => get<ItemDetail>(`/api/items/${id}`),
  startOptions: (id: number) => get<StartOptions>(`/api/items/${id}/start`),
  queries: () => get<BrowseQuery[]>('/api/browse/queries'),
  browse: (query: string | null, search: string) =>
    get<BrowseResult>(`/api/browse?${new URLSearchParams(search ? { search } : { query: query ?? 'sprint' })}`),

  start: (body: StartThreadRequest) => post<StartThreadResponse>('/api/threads', body),
  answer: (threadId: string, body: AnswerRequest) => post(`/api/threads/${threadId}/answers`, body),
  settle: (threadId: string) => post(`/api/threads/${threadId}/settle`),
  link: (threadId: string, itemId: number | null) => post(`/api/threads/${threadId}/link`, { itemId }),
  moveState: (itemId: number, to: string) => post<MoveStateResponse>(`/api/items/${itemId}/state`, { to }),
  dismiss: (itemId: number) => post(`/api/items/${itemId}/dismiss`),
  queue: (itemId: number) => post(`/api/queue/${itemId}`),
  unqueue: (itemId: number) => request('DELETE', `/api/queue/${itemId}`),

  registerWebPush: (subscription: PushSubscriptionJSON) => post('/api/push/web', { subscription }),
  testPush: () => post('/api/push/test'),
  notificationPreferences: () => get<NotificationPreferences>('/api/preferences/notifications'),
  setNotificationPreferences: (p: NotificationPreferences) => request<NotificationPreferences>('PUT', '/api/preferences/notifications', p),
  audit: () => get<{ at: string; via: string; ip: string | null; action: string; detail: any }[]>('/api/audit'),

  post,
};
