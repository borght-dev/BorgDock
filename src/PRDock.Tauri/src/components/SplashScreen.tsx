import type { InitStepState } from '@/stores/initStore';
import { INIT_STEPS, type InitStepId, useInitStore } from '@/stores/initStore';
import { useUpdateStore } from '@/stores/update-store';

function getStepState(
  stepId: InitStepId,
  currentStep: InitStepId | null,
  completedSteps: Record<string, { count?: number } | true>,
  error: { stepId: InitStepId; message: string } | null,
): InitStepState {
  if (error?.stepId === stepId) return 'error';
  if (stepId in completedSteps) return 'done';
  if (currentStep === stepId) return 'active';
  return 'waiting';
}

function getStepLabel(
  stepId: InitStepId,
  state: InitStepState,
  completedSteps: Record<string, { count?: number } | true>,
): string {
  const step = INIT_STEPS.find((s) => s.id === stepId)!;
  if (state === 'active') return step.activeLabel;
  if (state !== 'done') return step.label;
  const meta = completedSteps[stepId];
  if (meta && typeof meta === 'object' && meta.count !== undefined) {
    return step.label.replace(/^(Authenticated|Discovered|Fetched|Loaded)/, (match) => {
      if (stepId === 'discover-repos') return `Discovered ${meta.count}`;
      if (stepId === 'fetch-prs') return `Fetched ${meta.count}`;
      return match;
    });
  }
  return step.label;
}

const STEP_COLORS: Record<InitStepState, string> = {
  active: 'var(--color-wizard-step-active)',
  waiting: 'var(--color-text-faint)',
  error: 'var(--color-status-red)',
  done: 'var(--color-text-secondary)',
};

/* biome-ignore format: compact SVG icon lookup */
function StepIcon({ state }: { state: InitStepState }) {
  const p = { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' } as const;
  if (state === 'done')
    return (
      <svg {...p}>
        <circle cx="6" cy="6" r="5.5" fill="var(--color-wizard-step-complete)" />
        <path d="M3.5 6L5.25 7.75L8.5 4.25" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === 'active')
    return (
      <svg {...p} style={{ animation: 'splash-spin 1.2s linear infinite' }}>
        <circle cx="6" cy="6" r="5" stroke="var(--color-wizard-step-active)" strokeWidth="1.2" strokeDasharray="6 4" strokeLinecap="round" fill="none" />
      </svg>
    );
  if (state === 'error')
    return (
      <svg {...p}>
        <circle cx="6" cy="6" r="5.5" fill="var(--color-status-red)" />
        <path d="M4.25 4.25L7.75 7.75M7.75 4.25L4.25 7.75" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...p}>
      <circle cx="6" cy="6" r="5" stroke="var(--color-text-ghost)" strokeWidth="1.2" fill="none" opacity={state === 'waiting' ? 0.5 : 1} />
    </svg>
  );
}

export function SplashScreen() {
  const currentStep = useInitStore((s) => s.currentStep);
  const completedSteps = useInitStore((s) => s.completedSteps);
  const error = useInitStore((s) => s.error);
  const reset = useInitStore((s) => s.reset);
  const version = useUpdateStore((s) => s.currentVersion);

  return (
    <div
      className="flex h-screen w-screen flex-col"
      style={{
        background: 'var(--color-background)',
        borderRight: '0.5px solid var(--color-strong-border)',
      }}
    >
      {/* Accent strip */}
      <div
        className="w-full shrink-0"
        style={{
          height: 3,
          background:
            'linear-gradient(90deg, var(--color-logo-gradient-start), var(--color-logo-gradient-end), var(--color-splash-gradient-end))',
        }}
      />

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {/* Logo tile */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background:
              'linear-gradient(135deg, var(--color-logo-gradient-start) 0%, var(--color-logo-gradient-end) 100%)',
            animation: 'splash-breathe 2.4s ease-in-out infinite',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
              stroke="white"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="14" cy="9" r="1.3" fill="white" opacity="0.85" />
          </svg>
        </div>

        {/* Wordmark */}
        <div
          style={{
            marginTop: 20,
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: 'var(--color-text-primary)',
          }}
        >
          PRDock
        </div>

        {/* Step list */}
        <div className="flex flex-col" style={{ marginTop: 32, maxWidth: 220, gap: 10 }}>
          {INIT_STEPS.map((step) => {
            const state = getStepState(step.id, currentStep, completedSteps, error);
            const label = getStepLabel(step.id, state, completedSteps);
            return (
              <div
                key={step.id}
                className="flex items-center"
                style={{ gap: 10 }}
                data-testid={`splash-step-${step.id}`}
                data-state={state}
              >
                <StepIcon state={state} />
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-code)',
                    color: STEP_COLORS[state],
                    animation:
                      state === 'active' ? 'splash-pulse 2s ease-in-out infinite' : undefined,
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error message + Retry */}
        {error && (
          <div className="flex flex-col items-center" style={{ marginTop: 16, maxWidth: 220 }}>
            <p
              data-testid="splash-error-message"
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-code)',
                color: 'var(--color-status-red)',
                textAlign: 'center',
                margin: 0,
              }}
            >
              {error.message}
            </p>
            <button
              type="button"
              data-testid="splash-retry-button"
              onClick={reset}
              className="mt-3 cursor-pointer border-none bg-transparent"
              style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-wizard-step-active)' }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Version footer */}
      <div
        className="shrink-0 text-center"
        style={{ padding: 16, fontSize: 10, color: 'var(--color-text-faint)' }}
      >
        {version ? `v${version}` : ''}
      </div>
    </div>
  );
}
