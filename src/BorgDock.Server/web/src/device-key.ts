// The browser's device key for signed commands (shared/src/borgdock.ts, "Signed commands"): a non-extractable
// P-256 key kept in IndexedDB, bound to the session right after a passkey check. WebCrypto signs r‖s, which the
// server accepts beside the Secure Enclave's DER.

const DB = 'borgdock';
const STORE = 'keys';
const ID = 'device';

function store<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = work(open.result.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
  });
}

async function keyPair(): Promise<CryptoKeyPair> {
  const stored = await store<CryptoKeyPair | undefined>('readonly', (s) => s.get(ID));
  if (stored) return stored;
  const created = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  await store('readwrite', (s) => s.put(created, ID));
  return created;
}

const base64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** The public key as the server takes it: base64 of the 65-byte X9.63 point. */
export async function devicePublicKey(): Promise<string> {
  return base64(await crypto.subtle.exportKey('raw', (await keyPair()).publicKey));
}

/** The X-BorgDock-* headers for one request; `path` without query, with the /api prefix. */
export async function signatureHeaders(method: string, path: string, body: string): Promise<Record<string, string>> {
  const signedAt = new Date().toISOString();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
  const bodyHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))), (b) => b.toString(16).padStart(2, '0')).join('');
  const canonical = `${method}\n${path}\n${signedAt}\n${nonce}\n${bodyHash}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, (await keyPair()).privateKey, new TextEncoder().encode(canonical));
  return { 'X-BorgDock-Signed-At': signedAt, 'X-BorgDock-Nonce': nonce, 'X-BorgDock-Signature': base64(signature) };
}
