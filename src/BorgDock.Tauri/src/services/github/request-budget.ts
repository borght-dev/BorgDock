const MAX_REQUESTS = 4;
interface Budget {
  active: number;
  waiting: (() => void)[];
}
const budgets = new Map<string, Budget>();

export async function withAccountRequest<T>(
  account: string,
  request: () => Promise<T>,
): Promise<T> {
  const key = account.trim().toLowerCase() || '__active__';
  let budget = budgets.get(key);
  if (!budget) {
    budget = { active: 0, waiting: [] };
    budgets.set(key, budget);
  }
  if (budget.active >= MAX_REQUESTS)
    await new Promise<void>((resolve) => budget.waiting.push(resolve));
  else budget.active++;
  try {
    return await request();
  } finally {
    const next = budget.waiting.shift();
    if (next) next();
    else budget.active--;
  }
}
