import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LoadingSpinner from '../../components/LoadingSpinner.svelte';

describe('LoadingSpinner', () => {
  it('should render with default props', () => {
    render(LoadingSpinner);
    const spinner = screen.getByRole('status', { name: /loading/i });
    expect(spinner).toBeInTheDocument();
  });

  it('should render with custom size', () => {
    const { container } = render(LoadingSpinner, {
      props: { size: 'lg' }
    });
    const spinner = container.querySelector('.spinner');
    expect(spinner).toHaveClass('w-12', 'h-12');
  });

  it('should render with custom color', () => {
    const { container } = render(LoadingSpinner, {
      props: { color: 'success' }
    });
    const spinner = container.querySelector('.spinner');
    expect(spinner).toHaveClass('border-green-600');
  });

  it('should render with message', () => {
    render(LoadingSpinner, {
      props: { message: 'Loading data...' }
    });
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('should render as overlay', () => {
    const { container } = render(LoadingSpinner, {
      props: { overlay: true }
    });
    const overlay = container.querySelector('.loading-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass('fixed', 'inset-0');
  });

  it('should render overlay with message', () => {
    render(LoadingSpinner, {
      props: { 
        overlay: true,
        message: 'Processing...'
      }
    });
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(LoadingSpinner, {
      props: { className: 'custom-spinner' }
    });
    const spinner = container.querySelector('.spinner');
    expect(spinner).toHaveClass('custom-spinner');
  });
});