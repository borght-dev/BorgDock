/** Two-letter avatar fallback for a GitHub login (`koen` → `KO`). */
export function initialsFor(login: string): string {
  return login.slice(0, 2).toUpperCase();
}
