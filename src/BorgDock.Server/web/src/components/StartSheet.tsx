import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ModelOption, StartOptions, WorkItemSummary } from '../../../shared/src/api.ts';
import { api } from '../api.ts';
import { fillPrompt, inProgressState, openInT3, t3Href } from '../helpers.ts';
import { useStore } from '../store.tsx';

const NO_MODELS: ModelOption[] = [];

export function StartSheet({ item }: { item: WorkItemSummary }) {
  const { overview, config, act, busy, openStart, navigate } = useStore();
  const worktrees = overview?.worktrees ?? [];
  const first = worktrees.find((w) => w.state === 'free' && w.available !== false);
  const firstFree = first?.id ?? first?.name ?? null;
  const [worktree, setWorktree] = useState<string | null>(firstFree);
  const workspace = worktrees.find((w) => (w.id ?? w.name) === worktree);
  const models = workspace?.models ?? config?.models ?? NO_MODELS;
  const [modelId, setModelId] = useState(config?.defaultModel ?? models[0]?.id ?? '');
  const model = models.find((m) => m.id === modelId);
  const [effort, setEffort] = useState<string | null>(model?.defaultEffort ?? null);
  const pickModel = (id: string) => {
    setModelId(id);
    setEffort(models.find((m) => m.id === id)?.defaultEffort ?? null);
  };
  type Mode = 'plan' | 'default' | 'qa' | 'done';
  const [mode, setMode] = useState<Mode>('plan');
  const [prompt, setPrompt] = useState(() => fillPrompt(config?.promptTemplate ?? 'Pick up AB#{id}: {title}', item));
  const [options, setOptions] = useState<StartOptions | null>(null);
  const edited = useRef(false);
  useEffect(() => {
    let active = true;
    api.startOptions(item.id).then((o) => {
      if (!active) return;
      setOptions(o);
      if (!edited.current) setPrompt(o.prompts.pickup);
    }).catch(() => {});
    return () => { active = false; };
  }, [item.id]);

  // Plan and straight-to-work share the pick-up prompt; QA and Done have their own and prefer the worktree the item last ran in.
  const family = (m: Mode) => (m === 'qa' || m === 'done' ? m : 'pickup');
  const fallback = { qa: `Bring AB#${item.id} up to date for QA with the ado-update-for-qa skill.`, done: `Close AB#${item.id} as Done without QA and write down why.` };
  const handsOff = mode === 'qa' || mode === 'done';
  const pickMode = (next: Mode) => {
    const nextFamily = family(next);
    if (nextFamily !== family(mode)) {
      setPrompt(nextFamily === 'pickup' ? options?.prompts.pickup ?? prompt : options?.prompts[nextFamily] ?? fallback[nextFamily]);
      edited.current = false;
      if (nextFamily !== 'pickup' && options?.qaWorktree) setWorktree(options.qaWorkspaceId ?? options.qaWorktree);
    }
    setMode(next);
  };
  useEffect(() => {
    if (!worktrees.some((w) => (w.id ?? w.name) === worktree && w.state === 'free' && w.available !== false)) setWorktree(firstFree);
  }, [worktrees, worktree, firstFree]);
  useEffect(() => {
    if (!models.some((m) => m.id === modelId)) {
      const id = workspace?.defaultModel ?? models[0]?.id ?? '';
      setModelId(id);
      setEffort(models.find((m) => m.id === id)?.defaultEffort ?? null);
    } else if (effort && !models.find((m) => m.id === modelId)?.efforts.some((e) => e.id === effort)) {
      setEffort(models.find((m) => m.id === modelId)?.defaultEffort ?? null);
    }
  }, [models, modelId, effort, workspace?.defaultModel]);
  const target = inProgressState(item);
  const [moveAdo, setMoveAdo] = useState(item.state !== target);
  const notMine = !item.assignedToMe;
  const [assign, setAssign] = useState(notMine);

  const close = () => openStart(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const freeCount = useMemo(() => worktrees.filter((w) => w.state === 'free' && w.available !== false).length, [worktrees]);

  const start = async (openT3: boolean) => {
    if (!worktree) return;
    const ok = await act(async () => {
      const r = await api.start({ itemId: item.id, worktree, model: modelId, effort, mode, prompt, moveAdoTo: moveAdo && !handsOff ? target : null, assignToMe: assign });
      if (openT3) openInT3(r);
      const moved = r.adoState ? ` ${item.id} is now ${r.adoState}.` : '';
      return { text: `Started in ${workspace?.name ?? worktree}.${moved}${r.warning ? ` ${r.warning}` : ''}`, link: { href: t3Href(r), label: 'Open in T3' } };
    });
    if (ok) {
      close();
      navigate(`/?item=${item.id}`);
    }
  };

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="launch" role="dialog" aria-modal="true" aria-label={`Start ${item.id} in T3`}>
        <div className="launch-head">
          <h2>Start {item.id} in T3</h2>
          <p>{item.title}</p>
        </div>
        <div className="field">
          <span className="lbl">Worktree <span className="sub">{freeCount} free</span></span>
          <div className="chips">
            {worktrees.map((w, i) => (
              <Fragment key={w.id ?? w.name}>
              {(i === 0 || w.environmentId !== worktrees[i - 1].environmentId) && w.environmentLabel && <span className="workspace-host">{w.environmentLabel}</span>}
              <button className={`chip ${(w.id ?? w.name) === worktree ? 'is-on' : ''}`} disabled={w.state !== 'free' || w.available === false} onClick={() => setWorktree(w.id ?? w.name)}>
                <b>{w.name}</b><span>{w.available === false ? 'offline' : w.state === 'free' ? 'free' : w.itemId ?? 'busy'}</span>
              </button>
              </Fragment>
            ))}
          </div>
          {!freeCount && <p className="field-note">No online worktree is free. Reconnect a host or settle an open thread.</p>}
        </div>
        <div className="field">
          <label htmlFor="model" className="lbl">Model</label>
          <select id="model" className="select" value={modelId} onChange={(e) => pickModel(e.target.value)}>
            <ModelGroup label="Recent" models={models.filter((m) => m.recent)} />
            <ModelGroup label="Codex" models={models.filter((m) => !m.recent && m.provider === 'Codex')} />
            <ModelGroup label="Claude" models={models.filter((m) => !m.recent && m.provider === 'Claude')} />
            <ModelGroup label="Other" models={models.filter((m) => !m.recent && m.provider === 'Other')} />
          </select>
        </div>
        {model && model.efforts.length > 0 && (
          <div className="field">
            <span className="lbl">Reasoning</span>
            <div className="levels" role="radiogroup" aria-label="Reasoning level">
              {model.efforts.map((e) => (
                <button key={e.id} role="radio" aria-checked={effort === e.id} className={`level ${effort === e.id ? 'is-on' : ''}`} onClick={() => setEffort(e.id)}>{e.label}</button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <span className="lbl">Begin with</span>
          <div className="seg">
            <button className={mode === 'plan' ? 'is-on' : ''} onClick={() => pickMode('plan')}>A plan for me to approve</button>
            <button className={mode === 'default' ? 'is-on' : ''} onClick={() => pickMode('default')}>Straight to work</button>
            <button className={mode === 'qa' ? 'is-on' : ''} onClick={() => pickMode('qa')}>Update for QA</button>
            <button className={mode === 'done' ? 'is-on' : ''} onClick={() => pickMode('done')}>Close as done</button>
          </div>
          {mode === 'plan' && <p className="field-hint">The agent proposes a plan and waits. Reply in T3 when you're happy with it.</p>}
          {mode === 'qa' && (
            <p className="field-hint">
              Runs the ado-update-for-qa skill{options?.branch ? ` on ${options.branch}` : ''}: notes, proof and PR link on the item, then Code Review. Once the PR is merged it moves the item to Ready For QA.
            </p>
          )}
          {mode === 'done' && <p className="field-hint">For work QA doesn't need to test. The agent checks it's finished, writes why in the item's notes and a comment, then moves it to Done. It stops and asks if anything still needs QA.</p>}
        </div>
        <div className="field">
          <label htmlFor="prompt" className="lbl">First message</label>
          <textarea id="prompt" className="prompt" value={prompt} onChange={(e) => { setPrompt(e.target.value); edited.current = true; }} />
        </div>
        <div className="field">
          {notMine && (
            <label className="check">
              <input type="checkbox" checked={assign} onChange={(e) => setAssign(e.target.checked)} />
              <span>Assign it to me<small>{item.assignedTo ? `Currently ${item.assignedTo}` : 'Nobody has it yet'}</small></span>
            </label>
          )}
          {item.state !== target && !handsOff && (
            <label className="check">
              <input type="checkbox" checked={moveAdo} onChange={(e) => setMoveAdo(e.target.checked)} />
              <span>Also move ADO from {item.state} to {target}<small>Later moves, like Code Review when the PR opens, show up in Out of sync for you to confirm.</small></span>
            </label>
          )}
        </div>
        <div className="launch-foot">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn" disabled={!workspace || workspace.available === false || workspace.state !== 'free' || !model || busy || !prompt.trim()} onClick={() => start(true)}>Start and open T3</button>
          <button className="btn primary" disabled={!workspace || workspace.available === false || workspace.state !== 'free' || !model || busy || !prompt.trim()} onClick={() => start(false)}>Start in background</button>
        </div>
      </div>
    </div>
  );
}

function ModelGroup({ label, models }: { label: string; models: ModelOption[] }) {
  if (!models.length) return null;
  return (
    <optgroup label={label}>
      {models.map((m) => <option key={m.id} value={m.id}>{m.recent ? `${m.label} (${m.provider})` : m.label}</option>)}
    </optgroup>
  );
}
