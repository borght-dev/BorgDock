import { api } from './api.ts';

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js').catch(() => {});
}

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

const keyBytes = (base64url: string) => Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function enablePush(vapidPublicKey: string): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for Dispatch in this browser.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
  await api.registerWebPush(subscription.toJSON());
}
