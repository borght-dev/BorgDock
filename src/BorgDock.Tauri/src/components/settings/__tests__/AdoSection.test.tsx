import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzureDevOpsSettings } from '@/types/settings';
import { AdoSection } from '../AdoSection';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(false),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

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
    linkMatchBy: 'branch',
    showWorkItemStateOnPrCard: true,
    updatePrStatusWhenWiDone: false,
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
    const input = screen.getByRole('textbox', { name: /ado organization/i }) as HTMLInputElement;
    expect(input.value).toBe('my-org');
  });

  it('renders project input', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: /ado project/i }) as HTMLInputElement;
    expect(input.value).toBe('my-project');
  });

  it('updates organization', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: /ado organization/i }), {
      target: { value: 'new-org' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ organization: 'new-org' }));
  });

  it('updates project', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: /ado project/i }), {
      target: { value: 'new-project' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ project: 'new-project' }));
  });

  it('renders PAT input as password when authMethod is pat', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    // TextInput with type="password" renders a password input
    const inputs = document.querySelectorAll('input[type="password"]');
    expect(inputs.length).toBeGreaterThan(0);
    const patInput = inputs[0] as HTMLInputElement;
    expect(patInput.value).toBe('ado-pat-123');
  });

  it('hides PAT input when authMethod is azCli', () => {
    render(<AdoSection azureDevOps={makeAdo({ authMethod: 'azCli' })} onChange={onChange} />);
    const inputs = document.querySelectorAll('input[type="password"]');
    expect(inputs.length).toBe(0);
  });

  it('updates PAT', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    const patInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(patInput, { target: { value: 'new-pat' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ personalAccessToken: 'new-pat' }),
    );
  });

  it('renders poll interval slider', () => {
    render(<AdoSection azureDevOps={makeAdo({ pollIntervalSeconds: 120 })} onChange={onChange} />);
    const slider = screen.getByRole('slider') as HTMLElement;
    expect(slider.getAttribute('aria-valuenow')).toBe('120');
  });

  it('renders Test connection button', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    expect(screen.getByText('Test connection')).toBeDefined();
  });

  it('shows success banner after successful test connection', async () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Test connection'));

    await waitFor(() => {
      expect(screen.getByText(/Connection successful/)).toBeDefined();
    });
  });

  it('shows error banner after failed test connection', async () => {
    const { AdoClient } = await import('@/services/ado/client');
    vi.mocked(AdoClient).mockImplementation(
      () =>
        ({
          testConnection: vi.fn().mockResolvedValue('Auth failed'),
        }) as unknown as InstanceType<typeof AdoClient>,
    );

    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Test connection'));

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
    fireEvent.click(screen.getByText('Test connection'));

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
    fireEvent.click(screen.getByText('Test connection'));

    expect(screen.getByText('Testing…')).toBeDefined();
    const button = screen.getByText('Testing…') as HTMLButtonElement;
    expect(button.closest('button')?.disabled).toBe(true);

    resolveTest!();
    await waitFor(() => {
      expect(screen.getByText(/Connection successful/)).toBeDefined();
    });
  });

  it('handles empty PAT gracefully', () => {
    render(
      <AdoSection azureDevOps={makeAdo({ personalAccessToken: undefined })} onChange={onChange} />,
    );
    const patInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(patInput.value).toBe('');
  });

  it('renders auth method Seg2 with both options', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    expect(screen.getByText('Azure CLI')).toBeDefined();
    // "Personal Access Token" appears in the Seg2 (as a button) + possibly as a field label;
    // verify at least one instance exists
    const patTexts = screen.getAllByText('Personal Access Token');
    expect(patTexts.length).toBeGreaterThan(0);
  });

  it('switching auth method to azCli calls onChange', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Azure CLI'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ authMethod: 'azCli' }));
  });

  it('renders match-by Seg2 with three options', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    expect(screen.getByText('Branch name')).toBeDefined();
    expect(screen.getByText('PR title (AB#)')).toBeDefined();
    expect(screen.getByText('Both')).toBeDefined();
  });

  it('renders two ToggleRows under Work-item linking', () => {
    render(<AdoSection azureDevOps={makeAdo()} onChange={onChange} />);
    expect(screen.getByText('Show work-item state on PR card')).toBeDefined();
    expect(screen.getByText('Update PR status when WI moves to Done')).toBeDefined();
  });

  it('changes linkMatchBy when match-by option clicked', () => {
    render(<AdoSection azureDevOps={makeAdo({ linkMatchBy: 'branch' })} onChange={onChange} />);
    fireEvent.click(screen.getByText('PR title (AB#)'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ linkMatchBy: 'title' }));
  });
});
