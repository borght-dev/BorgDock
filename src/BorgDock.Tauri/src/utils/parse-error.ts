export function parseError(err: unknown): { message: string } {
  if (err instanceof Error) return { message: err.message };
  if (typeof err === 'string') return { message: err };
  return { message: String(err) };
}
