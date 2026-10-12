import clsx from 'clsx';
import { useState } from 'react';
import { Markdown } from '@/components/shared/Markdown';
import { Button } from '@/components/shared/primitives';
import type { AgentQuestion, AgentThread } from '@/services/dispatch/types';

/** Picked option index per question id; `CUSTOM` for the typed answer. */
type Picks = Record<string, number>;
const CUSTOM = -1;

/** The answers T3 expects: each question's picked option value, or the typed text. */
export function collectAnswers(
  questions: readonly AgentQuestion[],
  picks: Picks,
  typed: Record<string, string>,
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of questions) {
    const pick = picks[question.id] ?? question.recommended;
    if (pick === null || pick === undefined) continue;
    const value = pick === CUSTOM ? typed[question.id]?.trim() : question.options[pick]?.value;
    if (value) answers[question.id] = value;
  }
  return answers;
}

interface QuestionsProps {
  thread: AgentThread;
  busy: boolean;
  onAnswer: (answers: Record<string, string>) => void;
}

function Questions({ thread, busy, onAnswer }: QuestionsProps) {
  const [picks, setPicks] = useState<Picks>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const answers = collectAnswers(thread.questions, picks, typed);
  const complete = Object.keys(answers).length === thread.questions.length;

  return (
    <div className="bd-dp-ask">
      {thread.questions.map((question) => {
        const pick = picks[question.id] ?? question.recommended;
        return (
          <fieldset key={question.id} className="bd-dp-ask__question">
            <legend>{question.question}</legend>
            {question.options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={pick === index}
                className={clsx('bd-dp-option', pick === index && 'bd-dp-option--on')}
                onClick={() => setPicks({ ...picks, [question.id]: index })}
              >
                <span className="bd-dp-option__mark" aria-hidden="true" />
                <span className="bd-dp-option__label">{option.label}</span>
                {index === question.recommended && (
                  <span className="bd-dp-option__hint">Recommended</span>
                )}
              </button>
            ))}
            {question.allowCustomAnswer && (
              <button
                type="button"
                role="radio"
                aria-checked={pick === CUSTOM}
                className={clsx('bd-dp-option', pick === CUSTOM && 'bd-dp-option--on')}
                onClick={() => setPicks({ ...picks, [question.id]: CUSTOM })}
              >
                <span className="bd-dp-option__mark" aria-hidden="true" />
                <span className="bd-dp-option__label">Something else</span>
              </button>
            )}
            {pick === CUSTOM && (
              <input
                className="bd-dp-ask__own"
                aria-label={`Your answer to: ${question.question}`}
                placeholder="Your answer"
                value={typed[question.id] ?? ''}
                onChange={(e) => setTyped({ ...typed, [question.id]: e.target.value })}
              />
            )}
          </fieldset>
        );
      })}
      <Button
        variant="primary"
        size="md"
        disabled={!complete || busy || !thread.available}
        onClick={() => onAnswer(answers)}
      >
        {thread.questions.length > 1 ? 'Send answers' : 'Send answer'}
      </Button>
    </div>
  );
}

interface AgentSaysProps {
  thread: AgentThread;
  busy?: boolean;
  onAnswer: (answers: Record<string, string>) => void;
}

/** What the agent waits on you for: its questions, or the last thing it said. */
export function AgentSays({ thread, busy = false, onAnswer }: AgentSaysProps) {
  if (thread.status === 'question' && thread.questions.length > 0) {
    return (
      <Questions key={thread.questionRequestId} thread={thread} busy={busy} onAnswer={onAnswer} />
    );
  }
  if (thread.status === 'running') {
    return <p className="bd-dp-says bd-dp-says--quiet">Working. Nothing to do.</p>;
  }
  if (!thread.lastAgentMessage) return null;
  return (
    <div className="bd-dp-says markdown-body" data-thread-status={thread.status}>
      <Markdown allowRawHtml={false}>{thread.lastAgentMessage}</Markdown>
    </div>
  );
}
