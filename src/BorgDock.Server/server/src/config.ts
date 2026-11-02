import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ClerkConfig = { publishableKey: string; secretKey: string; frontendApi: string };

/** GitHub as the server reads it: through `gh` on this machine (`gh auth token --user <login>`). */
export type GithubConfig = {
  /** gh logins to read with; empty means every account `gh auth status` knows. */
  accounts: string[];
  /** Extra repositories to watch beyond the pull requests that involve you, as owner/repo. */
  repos: string[];
  pollSeconds: number;
  staleAfterDays: number;
};

export type ApnsConfig = { keyId: string; teamId: string; bundleId: string; keyFile: string; production: boolean };
export type T3Environment = {
  label: string;
  baseUrl: string;
  environmentId: string;
  webBase: string;
  app: string;
  stateDb: string;
  pollSeconds: number;
  sessionFile?: string;
  sessionCommand?: string[];
};

export type Config = {
  port: number;
  dataDir: string;
  /** The single public origin, e.g. https://host.ts.net:10000. Passkeys are bound to its host. */
  publicOrigin: string;
  /** Extra origins allowed for WebAuthn and CSRF checks, e.g. the Vite dev server. */
  extraOrigins: string[];
  rpId: string;
  webDist: string;
  ado: { orgUrl: string; project: string; team: string; pollSeconds: number };
  t3: T3Environment;
  t3Environments: T3Environment[];
  /** T3 projects that count as worktree slots. */
  worktreePattern: RegExp;
  apns: ApnsConfig | null;
  /** Null until clerk.json exists in the data directory: {publishableKey, secretKey, frontendApi}. */
  clerk: ClerkConfig | null;
  github: GithubConfig;
  /** The server's name in the app and in pairing QR codes. */
  serverName: string;
  /** Who may claim this server on sign-in without a pairing code (lower-cased). Empty lists: only a code claims it. */
  owners: { emails: string[]; githubLogins: string[] };
};

type FileConfig = Partial<Omit<Config, 'worktreePattern'>> & { worktreePattern?: string };

export function loadConfig(env = process.env): Config {
  const dataDir = env.DISPATCH_DATA_DIR ?? join(homedir(), '.dispatch');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const configFile = join(dataDir, 'config.json');
  const file: FileConfig = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};

  const port = Number(env.PORT ?? file.port ?? 8795);
  const publicOrigin = env.DISPATCH_ORIGIN ?? file.publicOrigin ?? `http://127.0.0.1:${port}`;
  const t3Home = join(homedir(), '.t3', 'userdata');
  const apnsFile = join(dataDir, 'apns.json');
  const clerkFile = join(dataDir, 'clerk.json');

  return {
    port,
    dataDir,
    publicOrigin,
    extraOrigins: env.DISPATCH_EXTRA_ORIGINS?.split(',').filter(Boolean) ?? file.extraOrigins ?? [],
    rpId: env.DISPATCH_RP_ID ?? file.rpId ?? new URL(publicOrigin).hostname,
    webDist: new URL('../../web/dist/', import.meta.url).pathname,
    ado: {
      orgUrl: 'https://dev.azure.com/example',
      project: 'Example',
      team: 'Example Team',
      pollSeconds: 60,
      ...file.ado,
    },
    t3: {
      label: 'Mac',
      baseUrl: 'http://127.0.0.1:3773',
      app: ['T3 Code (Nightly)', 'T3 Code (Alpha)', 'T3 Code']
        .map((name) => `/Applications/${name}.app/Contents`)
        .find(existsSync) ?? '/Applications/T3 Code (Alpha).app/Contents',
      stateDb: existsSync(join(t3Home, 'statev2.sqlite')) ? join(t3Home, 'statev2.sqlite') : join(t3Home, 'state.sqlite'),
      environmentId: readEnvironmentId(t3Home),
      webBase: `http://127.0.0.1:3773/${readEnvironmentId(t3Home)}`,
      pollSeconds: 4,
      ...file.t3,
    },
    t3Environments: file.t3Environments ?? [],
    worktreePattern: new RegExp(file.worktreePattern ?? '^[MVW]\\d+$'),
    apns: existsSync(apnsFile) ? JSON.parse(readFileSync(apnsFile, 'utf8')) : null,
    clerk: existsSync(clerkFile) ? JSON.parse(readFileSync(clerkFile, 'utf8')) : null,
    github: { accounts: [], repos: [], pollSeconds: 60, staleAfterDays: 7, ...(file as { github?: Partial<GithubConfig> }).github },
    serverName: (file as { serverName?: string }).serverName ?? 'BorgDock',
    owners: ownersOf((file as { owners?: unknown }).owners),
  };
}

function ownersOf(value: unknown): Config['owners'] {
  const list = (field: unknown) => (Array.isArray(field) ? field.map((v) => String(v).trim().toLowerCase()).filter(Boolean) : []);
  const owners = (value ?? {}) as { emails?: unknown; githubLogins?: unknown };
  return { emails: list(owners.emails), githubLogins: list(owners.githubLogins) };
}

function readEnvironmentId(t3Home: string): string {
  const file = join(t3Home, 'environment-id');
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
}

export function allowedOrigins(config: Config): string[] {
  return [config.publicOrigin, ...config.extraOrigins];
}
