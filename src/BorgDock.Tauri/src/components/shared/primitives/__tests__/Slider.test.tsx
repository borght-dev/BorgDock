import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from '../Slider';

describe('Slider', () => {
  it('renders value with suffix', () => {
    render(<Slider value={60} min={15} max={600} suffix="s" onChange={() => {}} ariaLabel="X" />);
    expect(screen.getByText('60s')).toBeInTheDocument();
  });

  it('arrow Right increments by step', () => {
    const onChange = vi.fn();
    render(<Slider value={60} min={15} max={600} step={5} onChange={onChange} ariaLabel="X" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(65);
  });

  it('arrow Left decrements by step', () => {
    const onChange = vi.fn();
    render(<Slider value={60} min={15} max={600} step={5} onChange={onChange} ariaLabel="X" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(55);
  });

  it('clamps to max', () => {
    const onChange = vi.fn();
    render(<Slider value={595} min={15} max={600} step={10} onChange={onChange} ariaLabel="X" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(600);
  });

  it('Home jumps to min', () => {
    const onChange = vi.fn();
    render(<Slider value={300} min={15} max={600} onChange={onChange} ariaLabel="X" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('End jumps to max', () => {
    const onChange = vi.fn();
    render(<Slider value={300} min={15} max={600} onChange={onChange} ariaLabel="X" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith(600);
  });

  it('shift+arrow uses 10× step', () => {
    const onChange = vi.fn();
    render(<Slider value={50} min={0} max={1000} step={5} onChange={onChange} ariaLabel="X" />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight', shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(100);
  });
});
