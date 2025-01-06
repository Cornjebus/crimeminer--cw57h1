import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Modal from './Modal';
import { renderWithProviders } from '../../../tests/utils/test-utils';

// Mock crypto for secure request IDs
const mockCrypto = {
  randomUUID: () => '123e4567-e89b-12d3-a456-426614174000'
};
Object.defineProperty(window, 'crypto', { value: mockCrypto });

describe('Modal Component Security and Accessibility Tests', () => {
  // Common test setup
  const mockOnClose = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    title: 'Test Modal',
    children: <div>Modal content</div>,
    ariaLabel: 'Test modal dialog',
    ariaDescribedBy: 'modal-desc',
    securityClassification: 'RESTRICTED'
  };

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe('Security Features', () => {
    test('renders with proper security classification banner', () => {
      renderWithProviders(
        <Modal {...defaultProps} securityClassification="SECRET" />,
        { securityContext: { classificationLevel: 'SECRET' } }
      );

      const banner = screen.getByTestId('security-classification-banner');
      expect(banner).toHaveTextContent('SECRET');
      expect(banner).toHaveClass('modal-security-banner--secret');
    });

    test('prevents content selection based on security level', async () => {
      renderWithProviders(
        <Modal {...defaultProps} securityClassification="TOP_SECRET" />,
        { securityContext: { classificationLevel: 'TOP_SECRET' } }
      );

      const content = screen.getByRole('dialog');
      expect(content).toHaveStyle({ userSelect: 'none' });
      expect(content).toHaveAttribute('data-prevent-capture', 'true');
    });

    test('logs security audit on sensitive interactions', async () => {
      const mockAuditLogger = vi.fn();
      renderWithProviders(
        <Modal {...defaultProps} securityClassification="SECRET" />,
        { 
          securityContext: { classificationLevel: 'SECRET' },
          auditLogger: mockAuditLogger
        }
      );

      await userEvent.click(screen.getByRole('button', { name: /close modal/i }));
      
      expect(mockAuditLogger).toHaveBeenCalledWith({
        action: 'MODAL_CLOSE',
        securityLevel: 'SECRET',
        timestamp: expect.any(Date),
        userId: expect.any(String)
      });
    });
  });

  describe('Accessibility Features', () => {
    test('traps focus within modal when open', async () => {
      renderWithProviders(<Modal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      const closeButton = screen.getByRole('button', { name: /close modal/i });

      await userEvent.tab();
      expect(document.activeElement).toBe(closeButton);

      await userEvent.tab();
      expect(document.activeElement).toBeInTheDocument();
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    test('supports keyboard navigation and escape key', async () => {
      renderWithProviders(<Modal {...defaultProps} />);

      await userEvent.keyboard('{Escape}');
      expect(mockOnClose).toHaveBeenCalledTimes(1);

      const closeButton = screen.getByRole('button', { name: /close modal/i });
      await userEvent.tab();
      expect(document.activeElement).toBe(closeButton);
      await userEvent.keyboard('{Enter}');
      expect(mockOnClose).toHaveBeenCalledTimes(2);
    });

    test('provides proper ARIA attributes', () => {
      renderWithProviders(<Modal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', defaultProps.ariaLabel);
      expect(dialog).toHaveAttribute('aria-describedby', defaultProps.ariaDescribedBy);
    });

    test('announces modal content to screen readers', async () => {
      renderWithProviders(
        <Modal {...defaultProps}>
          <div role="status" aria-live="polite">Dynamic content loaded</div>
        </Modal>
      );

      const announcement = screen.getByRole('status');
      expect(announcement).toHaveAttribute('aria-live', 'polite');
      expect(announcement).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    const resizeWindow = (width: number) => {
      Object.defineProperty(window, 'innerWidth', { value: width, writable: true });
      fireEvent(window, new Event('resize'));
    };

    test('adapts to mobile viewport', async () => {
      resizeWindow(320);
      renderWithProviders(<Modal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('modal--mobile');
      expect(dialog).toHaveStyle({ maxWidth: '100%' });
    });

    test('adapts to tablet viewport', async () => {
      resizeWindow(768);
      renderWithProviders(<Modal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('modal--tablet');
    });

    test('adapts to desktop viewport', async () => {
      resizeWindow(1024);
      renderWithProviders(<Modal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('modal--desktop');
    });
  });

  describe('Animation and Performance', () => {
    test('applies correct animation classes', async () => {
      renderWithProviders(<Modal {...defaultProps} motionPreset="scale" />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('modal--scale');

      // Test exit animation
      fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
      await waitFor(() => {
        expect(dialog).toHaveClass('modal--exit');
      });
    });

    test('respects reduced motion preferences', () => {
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query
        }))
      });

      renderWithProviders(<Modal {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('modal--no-animation');
    });
  });

  describe('Error Handling', () => {
    test('handles focus management errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      renderWithProviders(
        <Modal {...defaultProps}>
          <button onClick={() => { throw new Error('Focus error'); }}>
            Problematic button
          </button>
        </Modal>
      );

      const button = screen.getByRole('button', { name: /problematic/i });
      await userEvent.click(button);

      expect(consoleSpy).toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });

    test('maintains security context during errors', async () => {
      const mockSecurityContext = { classificationLevel: 'SECRET' };
      const { rerender } = renderWithProviders(
        <Modal {...defaultProps} />,
        { securityContext: mockSecurityContext }
      );

      // Simulate error condition
      rerender(
        <Modal {...defaultProps} isOpen={false}>
          <div>Error content</div>
        </Modal>
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('');
    });
  });
});