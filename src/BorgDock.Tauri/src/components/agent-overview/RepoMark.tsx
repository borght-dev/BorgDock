interface RepoMarkProps {
  repo: string;
  size?: number;
}

const KNOWN: Record<string, string> = {
  'FSP-Horizon': 'linear-gradient(135deg, #3ba68e, #2d8b75)',
  BorgDock: 'linear-gradient(135deg, #6655d4, #7c6af6)',
};

export function RepoMark({ repo, size = 22 }: RepoMarkProps) {
  const initials =
    repo === 'FSP-Horizon'
      ? 'FH'
      : repo === 'BorgDock'
        ? 'BD'
        : repo.slice(0, 2).toUpperCase();
  const tone = KNOWN[repo] ?? 'linear-gradient(135deg, #8a85a0, #5a5670)';
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        background: tone,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size <= 18 ? 9 : 10,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}
