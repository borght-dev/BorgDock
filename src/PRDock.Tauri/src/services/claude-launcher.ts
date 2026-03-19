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

  return prompt;
}

// Build a monitoring prompt for Claude Code
export function buildMonitorPrompt(pr: PullRequestWithChecks, _repoSettings: RepoSettings): string {
  const p = pr.pullRequest;
  let prompt = `# Monitor PR: #${p.number} ${p.title}\n\n`;
  prompt += `## Context\n`;
  prompt += `- **Branch:** ${p.headRef} → ${p.baseRef}\n`;
  prompt += `- **Author:** ${p.authorLogin}\n`;
  prompt += `- **Status:** ${pr.overallStatus}\n\n`;
  prompt += `## Task\n\n`;
  prompt += `Monitor this PR for any issues. Watch for:\n`;
  prompt += `- New check failures\n`;
  prompt += `- Review comments that need addressing\n`;
  prompt += `- Merge conflicts\n\n`;
  prompt += `If any issues arise, fix them automatically.\n`;

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
