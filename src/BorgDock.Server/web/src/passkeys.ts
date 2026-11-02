import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api, ApiError, bindDeviceKey } from './api.ts';

export function deviceName(): string {
  const ua = navigator.userAgent;
  const platform = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : 'Browser';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [platform, browser].filter(Boolean).join(' ');
}

function friendly(error: unknown): Error {
  if (error instanceof ApiError) return error;
  const name = (error as Error)?.name;
  if (name === 'NotAllowedError') return new Error('The passkey prompt was closed or timed out. Try again.');
  if (name === 'InvalidStateError') return new Error('This device already has a Dispatch passkey.');
  return error as Error;
}

export async function signInWithPasskey(): Promise<void> {
  try {
    const { options, challengeId } = await api.post<{ options: any; challengeId: string }>('/api/auth/login/options');
    const response = await startAuthentication({ optionsJSON: options });
    await api.post('/api/auth/login/verify', { challengeId, response, deviceName: deviceName() });
    // Right after the passkey check the server lets this browser bind the key it signs agent commands with.
    await bindDeviceKey().catch(() => {});
  } catch (error) {
    throw friendly(error);
  }
}

/** Proves the passkey again on the current session (step-up before account changes). */
export async function confirmPasskey(): Promise<void> {
  try {
    const { options, challengeId } = await api.post<{ options: any; challengeId: string }>('/api/auth/reverify/options');
    const response = await startAuthentication({ optionsJSON: options });
    await api.post('/api/auth/reverify/verify', { challengeId, response });
  } catch (error) {
    throw friendly(error);
  }
}

/** Runs an account change; if the server asks for a fresh passkey check first, does that and tries once more. */
export async function withPasskeyCheck<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!(error instanceof ApiError && error.reverify)) throw error;
    await confirmPasskey();
    return work();
  }
}

/** With a setup code when nobody is signed in (first device, recovery); without one to add a passkey to the current account. */
export async function registerPasskey(passkeyName: string, setupCode?: string): Promise<void> {
  try {
    const { options, challengeId } = await api.post<{ options: any; challengeId: string }>('/api/auth/register/options', { setupCode });
    const response = await startRegistration({ optionsJSON: options });
    await api.post('/api/auth/register/verify', { challengeId, response, passkeyName, deviceName: deviceName(), setupCode });
    if (setupCode) await bindDeviceKey().catch(() => {});
  } catch (error) {
    throw friendly(error);
  }
}
