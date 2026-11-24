/** An AI account found on this machine, as `ai_usage_accounts` returns it. */
export interface AiAccount {
  /** The provider and the folder: `claude:~/.claude-ops`. */
  id: string;
  /** `claude` or `codex`. */
  provider: string;
  /** The folder as its owner writes it: `~/.claude-ops`. */
  folder: string;
  email: string | null;
  /** "Max 20x", "Pro", "Team". */
  plan: string | null;
  /** What T3 Code calls the provider instance that runs on this account. */
  t3Name: string | null;
  /** The T3 Code provider instances that run on this account. */
  t3Instances: string[];
}

export interface AiLimit {
  /** `weekly`, `model` (a weekly limit for one model) or `session`. */
  kind: string;
  /** "Weekly", "Fable", "5 hours". */
  label: string;
  usedPercent: number;
  /** Epoch seconds. */
  resetsAt: number | null;
  windowSeconds: number | null;
}

/** Why an account has no reading. */
export interface AiUsageProblem {
  /** `expired`, `signed-out`, `missing-cli` or `unavailable`. */
  kind: string;
  message: string;
}

/** One account as `ai_usage_read` returns it. */
export interface AiUsage {
  account: AiAccount;
  limits: AiLimit[];
  credits: string | null;
  problem: AiUsageProblem | null;
}
