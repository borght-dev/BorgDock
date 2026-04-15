import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthStep } from '../AuthStep';

describe('AuthStep', () => {
  const defaultProps = {
    authMethod: 'ghCli' as const,
    pat: '',
    isAuthValid: false,
    authStatus: '',
    username: '',
    onAuthMethodChange: vi.fn(),
    onPatChange: vi.fn(),
    onValidateAuth: vi.fn(),
    onUsernameChange: vi.fn(),
  };

  it('renders the heading and description', () => {
    render(<AuthStep {...defaultProps} />);
    expect(screen.getByText('Connect to GitHub')).toBeTruthy();
    expect(screen.getByText('Choose how PRDock authenticates with GitHub')).toBeTruthy();
  });

  it('renders auth method buttons', () => {
    render(<AuthStep {...defaultProps} />);
    expect(screen.getByText('GitHub CLI')).toBeTruthy();
    expect(screen.getByText('Access Token')).toBeTruthy();
  });

  it('calls onAuthMethodChange when clicking Access Token button', () => {
    const onAuthMethodChange = vi.fn();
    render(<AuthStep {...defaultProps} onAuthMethodChange={onAuthMethodChange} />);
    fireEvent.click(screen.getByText('Access Token'));
    expect(onAuthMethodChange).toHaveBeenCalledWith('pat');
  });

  it('calls onAuthMethodChange when clicking GitHub CLI button', () => {
    const onAuthMethodChange = vi.fn();
    render(<AuthStep {...defaultProps} authMethod="pat" onAuthMethodChange={onAuthMethodChange} />);
    fireEvent.click(screen.getByText('GitHub CLI'));
    expect(onAuthMethodChange).toHaveBeenCalledWith('ghCli');
  });

  it('does not show PAT input when authMethod is ghCli', () => {
    render(<AuthStep {...defaultProps} authMethod="ghCli" />);
    expect(screen.queryByPlaceholderText('ghp_...')).toBeNull();
  });

  it('shows PAT input when authMethod is pat', () => {
    render(<AuthStep {...defaultProps} authMethod="pat" />);
    expect(screen.getByPlaceholderText('ghp_...')).toBeTruthy();
  });

  it('calls onPatChange when typing in PAT input', () => {
    const onPatChange = vi.fn();
    render(<AuthStep {...defaultProps} authMethod="pat" onPatChange={onPatChange} />);
    fireEvent.change(screen.getByPlaceholderText('ghp_...'), {
      target: { value: 'ghp_test123' },
    });
    expect(onPatChange).toHaveBeenCalledWith('ghp_test123');
  });

  it('toggles token visibility with Show/Hide button', () => {
    render(<AuthStep {...defaultProps} authMethod="pat" pat="ghp_secret" />);
    const input = screen.getByPlaceholderText('ghp_...') as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByText('Show'));
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByText('Hide'));
    expect(input.type).toBe('password');
  });

  it('renders Verify Connection button', () => {
    render(<AuthStep {...defaultProps} />);
    expect(screen.getByText('Verify Connection')).toBeTruthy();
  });

  it('calls onValidateAuth when Verify Connection is clicked', () => {
    const onValidateAuth = vi.fn();
    render(<AuthStep {...defaultProps} onValidateAuth={onValidateAuth} />);
    fireEvent.click(screen.getByText('Verify Connection'));
    expect(onValidateAuth).toHaveBeenCalledTimes(1);
  });

  it('does not show auth status when empty', () => {
    const { container } = render(<AuthStep {...defaultProps} authStatus="" />);
    expect(
      container.querySelector('.border-\\[var\\(--color-success-badge-border\\)\\]'),
    ).toBeNull();
  });

  it('shows auth status when provided', () => {
    render(<AuthStep {...defaultProps} authStatus="Checking..." />);
    expect(screen.getByText('Checking...')).toBeTruthy();
  });

  it('shows success auth status styling when valid', () => {
    render(<AuthStep {...defaultProps} authStatus="Authenticated as user" isAuthValid={true} />);
    expect(screen.getByText('Authenticated as user')).toBeTruthy();
  });

  it('shows failure auth status', () => {
    render(<AuthStep {...defaultProps} authStatus="Authentication failed" isAuthValid={false} />);
    expect(screen.getByText('Authentication failed')).toBeTruthy();
  });
});
