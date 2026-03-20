import type { ParsedError, PullRequestWithChecks, RepoSettings } from '@/types';

// Build a fix prompt for Claude Code when checks are failing
export function buildFixPrompt(
  pr: PullRequestWithChecks,
  checkName: string,
  errors: ParsedError[],
  changedFiles: string[],
  rawLog: string,
  repoSettings: RepoSettings,
): string {
  const p = pr.pullRequest;
  let prompt = `# Fix Failing Check: ${checkName}\n\n`;
  prompt += `## PR Context\n`;
  prompt += `- **PR:** #${p.number} ${p.title}\n`;
  prompt += `- **Branch:** ${p.headRef} → ${p.baseRef}\n`;
  prompt += `- **Author:** ${p.authorLogin}\n\n`;

  if (errors.length > 0) {
    prompt += `## Parsed Errors\n\n`;
    for (const error of errors) {
      prompt += `- **${error.filePath}`;
      if (error.lineNumber) prompt += `:${error.lineNumber}`;
      prompt += `**: ${error.message}`;
      if (error.errorCode) prompt += ` (${error.errorCode})`;
      prompt += `\n`;
    }
    prompt += `\n`;
  }

  if (changedFiles.length > 0) {
    prompt += `## Changed Files in This PR\n\n`;
    for (const file of changedFiles) {
      prompt += `- ${file}\n`;
    }
    prompt += `\n`;
  }

  if (rawLog) {
    // Include last 200 lines of raw log
    const logLines = rawLog.split('\n');
    const tail = logLines.slice(-200).join('\n');
    prompt += `## Raw Log (last 200 lines)\n\n\`\`\`\n${tail}\n\`\`\`\n\n`;
  }

  // Use custom template if provided
  if (repoSettings.fixPromptTemplate) {
    prompt += `## Additional Instructions\n\n${repoSettings.fixPromptTemplate}\n\n`;
  }

  prompt += `## Task\n\n`;
  prompt += `Fix the failing check "${checkName}" by analyzing the errors above and making the necessary code changes. `;
  prompt += `Focus only on errors that are relevant to the files changed in this PR.\n`;

  return prompt;
}

// Build a merge conflict resolution prompt
export function buildConflictPrompt(pr: PullRequestWithChecks): string {
  const p = pr.pullRequest;
  let prompt = `# Resolve Merge Conflicts\n\n`;
  prompt += `## PR Context\n`;
  prompt += `- **PR:** #${p.number} ${p.title}\n`;
  prompt += `- **Branch:** ${p.headRef} → ${p.baseRef}\n`;
  prompt += `- **Author:** ${p.authorLogin}\n\n`;
  prompt += `## Task\n\n`;
  prompt += `This PR has merge conflicts. Please:\n`;
  prompt += `1. Fetch the latest changes from the base branch (${p.baseRef})\n`;
  prompt += `2. Merge ${p.baseRef} into ${p.headRef}\n`;
  prompt += `3. Resolve any merge conflicts, preserving the intent of both sides\n`;
  prompt += `4. Commit the merge resolution\n`;
  prompt += `5. Push the resolved branch to the remote\n`;

  return prompt;
}

// Build a monitoring prompt for Claude Code
export function buildMonitorPrompt(pr: PullRequestWithChecks, repoSettings: RepoSettings): string {
  const p = pr.pullRequest;
  const ghRepo = `${p.repoOwner}/${p.repoName}`;

  let prompt = `# Monitor PR #${p.number}: ${p.title}\n\n`;
  prompt += `## Context\n`;
  prompt += `- **PR:** #${p.number} — ${p.title}\n`;
  prompt += `- **Branch:** ${p.headRef} → ${p.baseRef}\n`;
  prompt += `- **Author:** ${p.authorLogin}\n`;
  prompt += `- **Repo:** ${ghRepo}\n`;
  prompt += `- **URL:** ${p.htmlUrl}\n`;
  prompt += `- **Current status:** ${pr.overallStatus}\n\n`;

  prompt += `## Monitoring Loop\n\n`;
  prompt += `You are monitoring this PR until all CI checks pass. Run the following loop (max 5 fix cycles):\n\n`;
  prompt += `### Step 1: Check CI status\n`;
  prompt += `\`\`\`bash\n`;
  prompt += `gh pr checks ${p.number} --repo ${ghRepo}\n`;
  prompt += `\`\`\`\n\n`;

  prompt += `### Step 2: Evaluate results\n\n`;
  prompt += `- **All checks pass** → Print a success summary and stop.\n`;
  prompt += `- **Checks still in progress** → Wait 60 seconds, then go to Step 1.\n`;
  prompt += `- **One or more checks failed** → Continue to Step 3.\n\n`;

  prompt += `### Step 3: Diagnose the failure\n\n`;
  prompt += `1. Identify which check(s) failed from the output above.\n`;
  prompt += `2. Get the run ID of the failed check:\n`;
  prompt += `   \`\`\`bash\n`;
  prompt += `   gh run list --repo ${ghRepo} --branch ${p.headRef} --status failure --limit 5\n`;
  prompt += `   \`\`\`\n`;
  prompt += `3. Download and read the failed job logs:\n`;
  prompt += `   \`\`\`bash\n`;
  prompt += `   gh run view <run-id> --repo ${ghRepo} --log-failed\n`;
  prompt += `   \`\`\`\n`;
  prompt += `4. Analyze the log output to understand the root cause.\n\n`;

  prompt += `### Step 4: Fix the issue\n\n`;
  prompt += `- Read the relevant source files and make the necessary code changes.\n`;
  prompt += `- Focus only on files changed in this PR — don't fix unrelated issues.\n`;
  prompt += `- If the repo has slash commands or skills relevant to the failure type, use them.\n\n`;

  prompt += `### Step 5: Commit and push\n\n`;
  prompt += `\`\`\`bash\n`;
  prompt += `git add -A\n`;
  prompt += `git commit -m "fix: address CI failure in <check-name>"\n`;
  prompt += `git push\n`;
  prompt += `\`\`\`\n\n`;
  prompt += `Then go back to Step 1 and wait for the new CI run.\n\n`;

  prompt += `## Additional Responsibilities\n\n`;
  prompt += `While monitoring, also check for and handle:\n`;
  prompt += `- **Review comments**: Run \`gh pr view ${p.number} --repo ${ghRepo} --comments\` to check for new review feedback. Address any actionable comments.\n`;
  prompt += `- **Merge conflicts**: If the PR has conflicts, fetch the base branch and resolve them:\n`;
  prompt += `  \`\`\`bash\n`;
  prompt += `  git fetch origin ${p.baseRef}\n`;
  prompt += `  git merge origin/${p.baseRef}\n`;
  prompt += `  # resolve conflicts, then commit and push\n`;
  prompt += `  \`\`\`\n\n`;

  prompt += `## Rules\n\n`;
  prompt += `- Maximum 5 fix-and-push cycles. If checks still fail after 5 attempts, stop and summarize what you tried.\n`;
  prompt += `- Do not force-push or rewrite history.\n`;
  prompt += `- Keep commits small and focused — one commit per fix attempt.\n`;
  prompt += `- If you're unsure about a fix, prefer a minimal safe change over a large refactor.\n`;

  if (repoSettings.fixPromptTemplate) {
    prompt += `\n## Repo-Specific Instructions\n\n${repoSettings.fixPromptTemplate}\n`;
  }

  return prompt;
}

// Write prompt content to a temp file
export async function writePromptFile(content: string): Promise<string> {
  const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  const fileName = `claude-prompt-${Date.now()}.md`;
  await writeTextFile(fileName, content, { baseDir: BaseDirectory.Temp });
  // Return the path - on Windows this would be in the temp directory
  const { tempDir } = await import('@tauri-apps/api/path');
  const tmp = await tempDir();
  return `${tmp}${fileName}`;
}

// Launch Claude Code with the given prompt
export async function launchClaude(
  worktreePath: string,
  promptFile: string,
  message?: string,
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('launch_claude_code', {
    worktreePath,
    promptFile,
    initialMessage: message ?? '',
    claudeCodePath: '',
  });
}
