import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--color-bg-primary)] p-6 text-center">
          <div className="text-sm font-medium text-[var(--color-text-primary)]">
            Something went wrong
          </div>
          <div className="max-w-xs text-xs text-[var(--color-text-muted)]">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </div>
          <button
            onClick={this.handleRetry}
            className="mt-1 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
