import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzureDevOpsSettings } from '@/types';
import { AdoSection } from '../AdoSection';

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn().mockImplementation(() => ({
    testConnection: vi.fn().mockResolvedValue(null),
  })),
}));

function makeAdo(overrides?: Partial<AzureDevOpsSettings>): AzureDevOpsSettings {
  return {
    organization: 'my-org',
    project: 'my-project',
    personalAccessToken: 'ado-pat-123',
    authMethod: 'pat',
    authAutoDetected: true,
    pollIntervalSeconds: 120,
    favoriteQueryIds: [],
    trackedWorkItemIds: [],
    workingOnWorkItemIds: [],
    workItemWorktreePaths: {},
    recentWorkItemIds: [],
    ...overrides,
  };
}

describe('AdoSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders organization input', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    const input = screen.getByPlaceholderText('my-org') as HTMLInputElement;
    expect(input.value).toBe('my-org');
  });

  it('renders project input', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    const input = screen.getByPlaceholderText('my-project') as HTMLInputElement;
    expect(input.value).toBe('my-project');
  });

  it('updates organization', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('my-org'), {
      target: { value: 'new-org' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ organization: 'new-org' }));
  });

  it('updates project', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('my-project'), {
      target: { value: 'new-project' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ project: 'new-project' }));
  });

  it('renders PAT input as password by default', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    const input = screen.getByPlaceholderText('ADO PAT') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('ado-pat-123');
  });

  it('toggles PAT visibility', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    const input = screen.getByPlaceholderText('ADO PAT') as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByText('Show'));
    expect(input.type).toBe('text');

    fireEvent.click(screen.getByText('Hide'));
    expect(input.type).toBe('password');
  });

  it('updates PAT', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('ADO PAT'), {
      target: { value: 'new-pat' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ personalAccessToken: 'new-pat' }),
    );
  });

  it('renders poll interval slider', () => {
    render(<AdoSection azureDevOps={makeAdo({ pollIntervalSeconds: 120 })} onChange={onChange} />);
    expect(screen.getByText('Poll Interval: 120s')).toBeDefined();
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('120');
  });

  it('updates poll interval', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '240' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pollIntervalSeconds: 240 }));
  });

  it('renders Test Connection button', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    expect(screen.getByText('Test Connection')).toBeDefined();
  });

  it('shows success after successful test connection', async () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeDefined();
    });
  });

  it('shows error after failed test connection', async () => {
    const { AdoClient } = await import('@/services/ado/client');
    vi.mocked(AdoClient).mockImplementation(
      () =>
        ({
          testConnection: vi.fn().mockResolvedValue('Auth failed'),
        }) as unknown as InstanceType<typeof AdoClient>,
    );

    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Auth failed')).toBeDefined();
    });
  });

  it('shows error when test connection throws', async () => {
    const { AdoClient } = await import('@/services/ado/client');
    vi.mocked(AdoClient).mockImplementation(
      () =>
        ({
          testConnection: vi.fn().mockRejectedValue(new Error('Network error')),
        }) as unknown as InstanceType<typeof AdoClient>,
    );

    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(screen.getByText('Connection failed.')).toBeDefined();
    });
  });

  it('disables button while testing', async () => {
    const { AdoClient } = await import('@/services/ado/client');
    let resolveTest: () => void;
    const testPromise = new Promise<null>((r) => {
      resolveTest = () => r(null);
    });
    vi.mocked(AdoClient).mockImplementation(
      () =>
        ({
          testConnection: vi.fn().mockReturnValue(testPromise),
        }) as unknown as InstanceType<typeof AdoClient>,
    );

    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Test Connection'));

    expect(screen.getByText('Testing...')).toBeDefined();
    const button = screen.getByText('Testing...') as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    resolveTest!();
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeDefined();
    });
  });

  it('handles empty PAT gracefully', () => {
    render(
      <AdoSection azureDevOps={makeAdo({ personalAccessToken: undefined })} onChange={onChange} />,
    );
    const input = screen.getByPlaceholderText('ADO PAT') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
