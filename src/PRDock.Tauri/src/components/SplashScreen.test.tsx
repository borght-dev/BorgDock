import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type InitStepId, useInitStore } from '@/stores/initStore';
import { useUpdateStore } from '@/stores/update-store';
import { SplashScreen } from './SplashScreen';

// Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

beforeEach(() => {
  useInitStore.setState({
    currentStep: null,
    completedSteps: {},
    error: null,
    isComplete: false,
    runToken: 0,
  });
  useUpdateStore.setState({ currentVersion: '1.2.3' });
});

describe('SplashScreen', () => {
  it('renders all steps in waiting state when store is empty', () => {
    render(<SplashScreen />);

    const steps = ['auth', 'discover-repos', 'fetch-prs', 'fetch-checks'] as const;
    for (const id of steps) {
      const el = screen.getByTestId(`splash-step-${id}`);
      expect(el.dataset.state).toBe('waiting');
    }
  });

  it('shows active step with rotating spinner and accent color', () => {
    useInitStore.setState({ currentStep: 'fetch-prs' });

    render(<SplashScreen />);

    const step = screen.getByTestId('splash-step-fetch-prs');
    expect(step.dataset.state).toBe('active');

    // Spinner SVG should have splash-spin animation
    const svg = step.querySelector('svg');
    expect(svg?.style.animation).toContain('splash-spin');

    // Text should show activeLabel
    expect(step.textContent).toContain('Fetching open pull requests');
  });

  it('renders completed steps with checkmark', () => {
    useInitStore.setState({
      currentStep: 'fetch-prs',
      completedSteps: { auth: true, 'discover-repos': { count: 3 } },
    });

    render(<SplashScreen />);

    expect(screen.getByTestId('splash-step-auth').dataset.state).toBe('done');
    expect(screen.getByTestId('splash-step-discover-repos').dataset.state).toBe('done');

    // Check SVG circle with green fill (check icon)
    const authStep = screen.getByTestId('splash-step-auth');
    const checkCircle = authStep.querySelector('circle');
    expect(checkCircle?.getAttribute('fill')).toBe('var(--color-wizard-step-complete)');
  });

  it('interpolates count into completed step label', () => {
    useInitStore.setState({
      completedSteps: {
        auth: true,
        'discover-repos': { count: 4 },
        'fetch-prs': { count: 12 },
      },
      currentStep: 'fetch-checks',
    });

    render(<SplashScreen />);

    expect(screen.getByTestId('splash-step-discover-repos').textContent).toContain(
      'Discovered 4 repositories',
    );
    expect(screen.getByTestId('splash-step-fetch-prs').textContent).toContain(
      'Fetched 12 open pull requests',
    );
  });

  it('renders error state with message and Retry button', () => {
    useInitStore.setState({
      completedSteps: { auth: true },
      error: { stepId: 'discover-repos' as InitStepId, message: 'Network timeout' },
    });

    render(<SplashScreen />);

    const failedStep = screen.getByTestId('splash-step-discover-repos');
    expect(failedStep.dataset.state).toBe('error');

    expect(screen.getByTestId('splash-error-message').textContent).toBe('Network timeout');
    expect(screen.getByTestId('splash-retry-button')).toBeTruthy();
  });

  it('calls initStore.reset() when Retry button is clicked', () => {
    useInitStore.setState({
      error: { stepId: 'auth' as InitStepId, message: 'Auth failed' },
    });

    render(<SplashScreen />);

    fireEvent.click(screen.getByTestId('splash-retry-button'));

    // After reset, error should be null and runToken incremented
    const state = useInitStore.getState();
    expect(state.error).toBeNull();
    expect(state.runToken).toBe(1);
  });

  it('displays the app version in the footer', () => {
    render(<SplashScreen />);
    expect(screen.getByText('v1.2.3')).toBeTruthy();
  });
});
