import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from '../Field';

describe('Field', () => {
  it('renders label, hint, and an anchor div when given', () => {
    render(
      <Field label="Poll interval" hint="seconds" anchorId="poll-interval">
        <input data-testid="ctrl" />
      </Field>,
    );
    expect(screen.getByText('Poll interval')).toBeInTheDocument();
    expect(screen.getByText('seconds')).toBeInTheDocument();
    expect(document.getElementById('field-poll-interval')).toBeInTheDocument();
    expect(screen.getByTestId('ctrl')).toBeInTheDocument();
  });

  it('omits anchor div when no anchorId', () => {
    render(<Field label="X"><input data-testid="ctrl" /></Field>);
    expect(document.getElementById('field-x')).toBeNull();
  });
});
