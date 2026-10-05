import type { GitHubClient } from './client';

export interface RequiredCheck {
  name: string;
  appId?: number | null;
}
export interface ReportedCheck {
  name: string;
  appId?: number;
  state: string;
}
export interface RequiredCheckStatus extends RequiredCheck {
  state: string;
}
export interface ReviewReadiness {
  checks: RequiredCheckStatus[];
  complete: boolean;
  warnings: string[];
}
interface Rule {
  type: string;
  parameters?: { required_status_checks?: { context: string; integration_id?: number | null }[] };
}
interface Protection {
  contexts?: string[];
  checks?: { context: string; app_id?: number | null }[];
}
interface Run {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  app?: { id: number };
}
interface Status {
  context: string;
  state: string;
}

export function matchRequiredChecks(
  required: readonly RequiredCheck[],
  reported: readonly ReportedCheck[],
): RequiredCheckStatus[] {
  return required.map((check) => {
    const matches = reported.filter(
      (item) =>
        item.name === check.name &&
        (check.appId == null || check.appId < 0 || item.appId === check.appId),
    );
    const problem = matches.find((item) => !['success', 'neutral', 'skipped'].includes(item.state));
    return {
      ...check,
      state: !matches.length
        ? 'missing'
        : problem
          ? problem.state
          : matches.some((item) => item.state === 'skipped')
            ? 'skipped'
            : matches.some((item) => item.state === 'neutral')
              ? 'neutral'
              : 'success',
    };
  });
}

export async function getReviewReadiness(
  client: GitHubClient,
  owner: string,
  repo: string,
  base: string,
  sha: string,
): Promise<ReviewReadiness> {
  const root = `repos/${owner}/${repo}`;
  async function rules() {
    const rules: Rule[] = [];
    for (let page = 1; ; page++) {
      const batch = await client.get<Rule[]>(
        `${root}/rules/branches/${encodeURIComponent(base)}?per_page=100&page=${page}`,
      );
      rules.push(...batch);
      if (batch.length < 100) return rules;
    }
  }
  async function runs() {
    const all: Run[] = [];
    for (let page = 1; ; page++) {
      const batch = await client.get<{ check_runs: Run[]; total_count: number }>(
        `${root}/commits/${encodeURIComponent(sha)}/check-runs?filter=latest&per_page=100&page=${page}`,
      );
      all.push(...batch.check_runs);
      if (batch.check_runs.length < 100 || all.length >= batch.total_count) return all;
    }
  }
  async function statuses() {
    const all: Status[] = [];
    for (let page = 1; ; page++) {
      const batch = await client.get<Status[]>(
        `${root}/commits/${encodeURIComponent(sha)}/statuses?per_page=100&page=${page}`,
      );
      all.push(...batch);
      if (batch.length < 100)
        return all.filter(
          (item, index) => all.findIndex((other) => other.context === item.context) === index,
        );
    }
  }
  async function protection() {
    return client.get<Protection>(
      `${root}/branches/${encodeURIComponent(base)}/protection/required_status_checks`,
    );
  }
  const results = await Promise.allSettled([rules(), protection(), runs(), statuses()]);
  const [ruleResult, protectionResult, runResult, statusResult] = results;
  const required: RequiredCheck[] = [];
  if (ruleResult.status === 'fulfilled')
    for (const rule of ruleResult.value) {
      if (rule.type === 'required_status_checks')
        for (const check of rule.parameters?.required_status_checks ?? [])
          required.push({ name: check.context, appId: check.integration_id });
    }
  if (protectionResult.status === 'fulfilled') {
    const protection = protectionResult.value;
    for (const check of protection.checks ?? [])
      required.push({ name: check.context, appId: check.app_id });
    for (const name of protection.contexts ?? [])
      if (!required.some((check) => check.name === name)) required.push({ name });
  }
  const reported: ReportedCheck[] = [];
  if (runResult.status === 'fulfilled')
    for (const run of runResult.value)
      reported.push({
        name: run.name,
        appId: run.app?.id,
        state: run.status !== 'completed' ? 'pending' : (run.conclusion ?? 'unknown'),
      });
  if (statusResult.status === 'fulfilled')
    for (const status of statusResult.value)
      reported.push({ name: status.context, state: status.state });
  const labels = [
    'Branch rules unavailable',
    'Classic protection unavailable',
    'Check runs unavailable',
    'Commit statuses unavailable',
  ];
  return {
    checks: matchRequiredChecks(
      required.filter(
        (check, index) =>
          required.findIndex(
            (other) => other.name === check.name && other.appId === check.appId,
          ) === index,
      ),
      reported,
    ).map((check) =>
      check.state === 'missing' &&
      (runResult.status === 'rejected' || statusResult.status === 'rejected')
        ? { ...check, state: 'unverified' }
        : check,
    ),
    complete: results.every((result) => result.status === 'fulfilled'),
    warnings: results.flatMap((result, index) =>
      result.status === 'rejected' ? [labels[index]!] : [],
    ),
  };
}
