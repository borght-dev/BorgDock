# Security Policy

## Reporting a Vulnerability

If you discover a security issue in BorgDock, please report it privately rather than opening a public issue.

**Contact**: koenvanderborght@outlook.com

Please include:
- A description of the issue and its impact
- Steps to reproduce
- Affected version(s)
- Any relevant logs, screenshots, or proof-of-concept

I will acknowledge receipt within a few days and work with you on a timeline for a fix and public disclosure.

## Scope

BorgDock handles sensitive developer credentials (GitHub PATs, Azure DevOps PATs, SQL Server passwords, Anthropic API keys). Credential handling, storage (OS keychain), and IPC surfaces are the highest-priority areas for review.

## Out of Scope

- Vulnerabilities in upstream dependencies that are already tracked by their own advisories and have no exploit path specific to BorgDock
- Issues requiring a pre-compromised local machine (local attacker already has file system / process access)
- Social engineering of users
