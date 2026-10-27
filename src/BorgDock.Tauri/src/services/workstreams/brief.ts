import type { Assessment } from './attention';
import {
  decisionKey,
  outcomeKey,
  parseReference,
  refKey,
  shortIdentity,
  sourceUrl,
} from './identity';
import { ruleKind } from './rules';
import {
  MEMBER_ROLES,
  type MemberRole,
  type Proposal,
  type ProposalItem,
  type RefKey,
  ROLE_LABEL,
  type WorkstreamDocument,
} from './types';

/**
 * The brief an agent starts from, and what it proposes back. An agent reads
 * the workstream through the brief and the records it links; it proposes,
 * and you accept each proposal yourself.
 */

/** T3 refuses a first message longer than this (`launch.ts`). */
export const PROMPT_LIMIT = 20_000;
/** Room left for the prompt around the brief. */
const BRIEF_LIMIT = 16_000;

export const PROPOSAL_FENCE = 'borgdock-proposal';

export const DEFAULT_WORKSTREAM_PROMPTS = {
  review: [
    'Review the workstream "{title}" below. Read every record it links: the work items (with the repository\'s ADO skills), the pull requests (gh), and the T3 threads (their conversations). Then tell me which implementation to keep where two compete, what is left before the goal is reached, and which decision unblocks it.',
    "Don't change ADO states, close pull requests or settle threads: propose, I decide.",
    [
      'End your reply with exactly one fenced block tagged `borgdock-proposal`, holding JSON:',
      '{ "version": 1,',
      '  "nextAction": { "text": "...", "target": "<key or null>" },',
      '  "decisions": [{ "decision": "<decision id>", "choose": "<key>", "rationale": "..." }],',
      '  "outcomes": [{ "outcome": "<outcome id>", "evidence": ["<key>"], "note": "..." }],',
      '  "members": [{ "add": "<url>", "role": "supporting", "why": "..." }, { "key": "<key>", "role": "superseded", "why": "..." }],',
      '  "newOutcomes": [{ "title": "...", "why": "..." }],',
      '  "risks": ["..."] }',
      'Use the keys and ids from the brief. Leave out what you have nothing to say about.',
    ].join('\n'),
    '{brief}',
  ].join('\n\n'),
  work: [
    'Work on the next action of the workstream "{title}": {nextAction}',
    'The workstream below says what the goal is, what is done and what is open. Stay on the next action; say so when it turns out to be the wrong one.',
    '{brief}',
  ].join('\n\n'),
};

function line(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The workstream in Markdown, as an agent reads it. Records that are context go first when room runs out. */
export function buildBrief(
  document: WorkstreamDocument,
  assessment: Assessment | undefined,
): string {
  const parts: string[] = [];
  parts.push(`# Workstream: ${line(document.title)}`);
  parts.push(`Status: ${document.status}.`);
  if (document.goal.trim()) parts.push(`## Goal\n${document.goal.trim()}`);
  if (document.nextAction) {
    parts.push(
      `## Next action\n${line(document.nextAction.text)}${document.nextAction.target ? ` (about ${document.nextAction.target})` : ''}`,
    );
  }

  const outcomes = document.outcomes.map((outcome) => {
    const status = assessment?.outcomes.find((s) => s.outcome.id === outcome.id);
    const rules = outcome.rules
      .map((rule) => {
        const found = status?.rules.find((r) => r.rule.id === rule.id);
        return `  - rule ${ruleKind(rule.kind)?.describe(rule) ?? rule.kind} on ${rule.target}: ${found?.result ?? 'unknown'} (${found?.summary ?? ''})`;
      })
      .join('\n');
    const blockers = status?.blockers.map((b) => b.key).join(', ');
    return [
      `- ${outcomeKey(outcome.id)} "${line(outcome.title)}"${outcome.required ? '' : ' (optional)'}: ${outcome.verification.state}${blockers ? `, blocked by ${blockers}` : ''}`,
      rules,
    ]
      .filter(Boolean)
      .join('\n');
  });
  if (outcomes.length > 0) parts.push(`## Outcomes\n${outcomes.join('\n')}`);

  const decisions = document.decisions.map(
    (d) =>
      `- ${decisionKey(d.id)} "${line(d.question)}": ${d.status}${d.chosen ? `, kept ${d.chosen}` : ''}; options ${d.options.join(', ')}${d.rationale ? `; why: ${line(d.rationale)}` : ''}`,
  );
  if (decisions.length > 0) parts.push(`## Decisions\n${decisions.join('\n')}`);

  const relations = document.relations.map(
    (r) => `- ${r.from} ${r.kind} ${r.to}${r.note ? ` (${line(r.note)})` : ''}`,
  );
  if (relations.length > 0) parts.push(`## Relations\n${relations.join('\n')}`);

  const order: MemberRole[] = ['primary', 'supporting', 'superseded', 'context'];
  const members = order.flatMap((role) =>
    document.members
      .filter((m) => m.role === role)
      .map((m) => {
        const resolved = assessment?.members.get(m.key);
        const state = resolved
          ? `${resolved.stateLabel || resolved.freshness}${resolved.freshness === 'live' ? '' : ` (${resolved.freshness}${resolved.reason ? `: ${resolved.reason}` : ''})`}`
          : 'not read';
        return {
          role,
          text: `- key ${m.key} [${ROLE_LABEL[role].toLowerCase()}] ${shortIdentity(m.ref)} "${line(resolved?.title ?? m.label)}": ${state}. ${sourceUrl(m.ref)}${m.note ? ` Note: ${line(m.note)}` : ''}`,
        };
      }),
  );
  const head = parts.join('\n\n');
  const kept: string[] = [];
  // Room for the records heading and the note on what was left out.
  let length = head.length + 120;
  let dropped = 0;
  for (const member of members) {
    if (length + member.text.length + 1 > BRIEF_LIMIT) {
      dropped++;
      continue;
    }
    kept.push(member.text);
    length += member.text.length + 1;
  }
  const records = kept.length > 0 ? `\n\n## Records\n${kept.join('\n')}` : '';
  const note = dropped > 0 ? `\n\n(${dropped} records left out for length: context first.)` : '';
  return `${head}${records}${note}`.slice(0, BRIEF_LIMIT);
}

/** Fill a prompt template: `{brief}`, `{title}`, `{nextAction}`. */
export function fillPrompt(template: string, document: WorkstreamDocument, brief: string): string {
  return template
    .replaceAll('{title}', line(document.title))
    .replaceAll(
      '{nextAction}',
      document.nextAction ? line(document.nextAction.text) : 'none set yet',
    )
    .replaceAll('{brief}', brief)
    .slice(0, PROMPT_LIMIT);
}

// ── Proposals ───────────────────────────────────────────────

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The last `borgdock-proposal` block in a message, parsed, or `null`. */
export function proposalBlock(message: string): Raw | null {
  const blocks = [...message.matchAll(/```borgdock-proposal\s*\n([\s\S]*?)```/g)];
  const last = blocks.at(-1)?.[1];
  if (!last) return null;
  try {
    const parsed = JSON.parse(last) as unknown;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * What an agent proposed, checked against the workstream: a key, an id or
 * an address it doesn't hold is dropped and named in `dropped`.
 */
export function parseProposal(
  message: string,
  document: WorkstreamDocument,
  runKey: RefKey,
  at: string,
  context: Parameters<typeof parseReference>[1],
): Proposal | null {
  const block = proposalBlock(message);
  if (!block) return null;
  const members = new Set(document.members.map((m) => m.key));
  const outcomes = new Set(document.outcomes.map((o) => o.id));
  const decisions = new Map(document.decisions.map((d) => [d.id, d]));
  const nodes = new Set([
    ...members,
    ...document.outcomes.map((o) => outcomeKey(o.id)),
    ...document.decisions.map((d) => decisionKey(d.id)),
  ]);
  const items: ProposalItem[] = [];
  const dropped: string[] = [];
  let n = 0;
  const id = () => `${runKey}#${n++}`;

  if (isObject(block.nextAction) && text(block.nextAction.text)) {
    const target = text(block.nextAction.target);
    items.push({
      id: id(),
      kind: 'next-action',
      status: 'open',
      why: '',
      text: text(block.nextAction.text),
      target: target && nodes.has(target) ? target : null,
    });
  }
  for (const raw of list(block.decisions)) {
    if (!isObject(raw)) continue;
    const decisionId = text(raw.decision).replace(/^decision:/, '');
    const choose = text(raw.choose);
    const decision = decisions.get(decisionId);
    if (!decision || decision.status !== 'open' || !decision.options.includes(choose)) {
      dropped.push(`decision ${decisionId || '?'} → ${choose || '?'}`);
      continue;
    }
    items.push({
      id: id(),
      kind: 'decision',
      status: 'open',
      why: text(raw.rationale),
      decisionId,
      choose,
    });
  }
  for (const raw of list(block.outcomes)) {
    if (!isObject(raw)) continue;
    const outcomeId = text(raw.outcome).replace(/^outcome:/, '');
    const evidence = list(raw.evidence)
      .map(text)
      .filter((key) => members.has(key));
    if (!outcomes.has(outcomeId) || evidence.length === 0) {
      dropped.push(`evidence for ${outcomeId || '?'}`);
      continue;
    }
    items.push({
      id: id(),
      kind: 'outcome-evidence',
      status: 'open',
      why: text(raw.note),
      outcomeId,
      evidence,
    });
  }
  for (const raw of list(block.members)) {
    if (!isObject(raw)) continue;
    const role = MEMBER_ROLES.includes(raw.role as MemberRole)
      ? (raw.role as MemberRole)
      : 'supporting';
    if (text(raw.add)) {
      const parsed = parseReference(text(raw.add), context);
      if (!parsed || 'error' in parsed) {
        dropped.push(text(raw.add));
        continue;
      }
      if (members.has(refKey(parsed.ref))) continue;
      items.push({
        id: id(),
        kind: 'add-member',
        status: 'open',
        why: text(raw.why),
        url: text(raw.add),
        role,
      });
    } else if (text(raw.key)) {
      if (!members.has(text(raw.key))) {
        dropped.push(text(raw.key));
        continue;
      }
      items.push({
        id: id(),
        kind: 'set-role',
        status: 'open',
        why: text(raw.why),
        key: text(raw.key),
        role,
      });
    }
  }
  for (const raw of list(block.newOutcomes)) {
    if (!isObject(raw) || !text(raw.title)) continue;
    items.push({
      id: id(),
      kind: 'new-outcome',
      status: 'open',
      why: text(raw.why),
      title: text(raw.title).slice(0, 200),
    });
  }
  for (const raw of list(block.risks)) {
    if (text(raw)) items.push({ id: id(), kind: 'risk', status: 'open', why: '', text: text(raw) });
  }
  if (items.length === 0 && dropped.length === 0) return null;
  return { id: `${runKey}@${at}`, runKey, at, items, dropped };
}
