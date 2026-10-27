import type { Assessment } from './attention';
import { decisionKey, outcomeKey, shortIdentity, sourceUrl } from './identity';
import { ruleKind } from './rules';
import { readDocument } from './schema';
import { MEMBER_ROLES, ROLE_LABEL, type WorkstreamDocument } from './types';

/**
 * A workstream to hand to someone: Markdown to paste into a pull request or
 * a work item, JSON to import on a machine that doesn't share the folder.
 * Only what you see in the workstream goes in; nothing is sent anywhere.
 */

function line(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function toMarkdown(
  document: WorkstreamDocument,
  assessment: Assessment | undefined,
): string {
  const out: string[] = [`# ${line(document.title)}`];
  if (document.goal.trim()) out.push(document.goal.trim());
  if (assessment && assessment.progress.required > 0) {
    out.push(
      `**${assessment.progress.counted} of ${assessment.progress.required} required outcomes verified.**`,
    );
  }
  if (document.nextAction) out.push(`**Next:** ${line(document.nextAction.text)}`);

  if (document.outcomes.length > 0) {
    out.push('## Outcomes');
    for (const outcome of document.outcomes) {
      const status = assessment?.outcomes.find((s) => s.outcome.id === outcome.id);
      const done =
        status?.counts ??
        (outcome.verification.state === 'verified' || outcome.verification.state === 'confirmed');
      const how =
        outcome.verification.state === 'confirmed'
          ? ` (confirmed: ${line(outcome.verification.note)})`
          : outcome.verification.state === 'verified'
            ? ` (verified: ${outcome.verification.facts.map((f) => f.summary).join('; ')})`
            : outcome.rules.length > 0
              ? ` (${outcome.rules.map((r) => ruleKind(r.kind)?.describe(r) ?? r.kind).join(', ')})`
              : '';
      out.push(
        `- [${done ? 'x' : ' '}] ${line(outcome.title)}${outcome.required ? '' : ' (optional)'}${how}`,
      );
    }
  }

  if (document.decisions.length > 0) {
    out.push('## Decisions');
    for (const decision of document.decisions) {
      const name = (key: string) => {
        const member = document.members.find((m) => m.key === key);
        return member ? shortIdentity(member.ref) : key;
      };
      out.push(
        decision.status === 'decided' && decision.chosen
          ? `- ${line(decision.question)} Kept ${name(decision.chosen)}${decision.rationale ? `: ${line(decision.rationale)}` : ''}`
          : `- ${line(decision.question)} Open between ${decision.options.map(name).join(', ')}`,
      );
    }
  }

  for (const role of MEMBER_ROLES) {
    const members = document.members.filter((m) => m.role === role);
    if (members.length === 0) continue;
    out.push(`## ${ROLE_LABEL[role]}`);
    for (const member of members) {
      const resolved = assessment?.members.get(member.key);
      const title = line(resolved?.title ?? member.label);
      const state = resolved?.stateLabel ? ` · ${resolved.stateLabel}` : '';
      out.push(`- [${shortIdentity(member.ref)}](${sourceUrl(member.ref)}) ${title}${state}`);
    }
  }

  const blocks = document.relations.filter((r) => r.kind === 'blocks');
  if (blocks.length > 0) {
    const label = (key: string) => {
      const member = document.members.find((m) => m.key === key);
      if (member) return shortIdentity(member.ref);
      const outcome = document.outcomes.find((o) => outcomeKey(o.id) === key);
      if (outcome) return `"${line(outcome.title)}"`;
      const decision = document.decisions.find((d) => decisionKey(d.id) === key);
      return decision ? `the decision "${line(decision.question)}"` : key;
    };
    out.push('## Blockers');
    for (const relation of blocks)
      out.push(`- ${label(relation.from)} blocks ${label(relation.to)}`);
  }
  return `${out.join('\n\n')}\n`;
}

export function toJson(document: WorkstreamDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export type ImportResult =
  | { ok: true; document: WorkstreamDocument }
  | { ok: false; reason: string };

/** A workstream from an exported file. */
export function fromJson(contents: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch {
    return { ok: false, reason: 'The file is not JSON.' };
  }
  const read = readDocument(raw);
  if (!read.ok) return read;
  if (read.readOnly)
    return { ok: false, reason: 'A newer BorgDock exported this workstream. Update to import it.' };
  return { ok: true, document: read.document };
}
