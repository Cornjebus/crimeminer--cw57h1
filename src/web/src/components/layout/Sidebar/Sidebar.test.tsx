import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import axe from '@axe-core/react';
import { SecurityProvider } from '@company/security-context';
import { ThemeProvider } from '@mui/material';
import { AuditLogger } from '@company/audit-logger';
import Sidebar from './Sidebar';
import { renderWithProviders } from '../../../tests/utils/test-utils';
import { ROUTES } from '../../../constants/routes.constants';

// Mock navigation and dispatch
const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
const mockAuditLog = vi.fn();

// Mock security context
const mockSecurityContext = {
  classificationLevel: 'FEDRAMP_HIGH',
  userId: 'test-user-id',
  agencyId: 'test-agency',
  jurisdiction: 'FEDERAL',
  sessionId: 'test-session',
  clearanceLevel: 'SECRET'
};

// Mock audit logger
vi.mock('@company/audit-logger', () => ({
  AuditLogger: {
    log: mockAuditLog
  }
}));

// Mock router
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

// Mock redux
vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: vi.fn((selector) => {
    if (selector.name === 'selectIsSidebarOpen') return true;
    if (selector.name === 'selectAccessibility') {
      return {
        highContrast: false,
        keyboardNavigation: true,
        screenReaderOptimized: true
      };
    }
    return {};
  })
}));

describe('Sidebar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with proper security context and pass accessibility audit', async () => {
    const { container } = renderWithProviders(
      <SecurityProvider context={mockSecurityContext}>
        <ThemeProvider theme={{ mode: 'light' }}>
          <Sidebar />
        </ThemeProvider>
      </SecurityProvider>
    );

    // Verify security context
    expect(container.querySelector('[data-testid="main-sidebar"]'))
      .toHaveAttribute('data-security-level', 'FEDRAMP_HIGH');

    // Run accessibility audit
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify audit logging
    expect(mockAuditLog).toHaveBeenCalledWith({
      action: 'SIDEBAR_RENDER',
      userId: mockSecurityContext.userId,
      sessionId: mockSecurityContext.sessionId,
      timestamp: expect.any(String)
    });
  });

  it('should enforce role-based access control for navigation items', async () => {
    const { rerender } = renderWithProviders(
      <Sidebar />,
      {
        preloadedState: {
          auth: {
            user: {
              roles: ['INVESTIGATOR']
            }
          }
        }
      }
    );

    // Verify investigator access
    expect(screen.getByTestId('nav-cases')).toBeInTheDocument();
    expect(screen.getByTestId('nav-evidence')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-settings')).not.toBeInTheDocument();

    // Verify admin access
    rerender(
      <Sidebar />,
      {
        preloadedState: {
          auth: {
            user: {
              roles: ['ADMINISTRATOR']
            }
          }
        }
      }
    );

    expect(screen.getByTestId('nav-settings')).toBeInTheDocument();

    // Verify audit logging of access control
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RBAC_CHECK',
        result: expect.any(String)
      })
    );
  });

  it('should handle keyboard navigation in compliance with WCAG 2.1', async () => {
    renderWithProviders(<Sidebar />);

    const sidebar = screen.getByTestId('main-sidebar');
    const firstItem = screen.getByTestId('nav-dashboard');
    const lastItem = screen.getByTestId('nav-search');

    // Focus first item
    firstItem.focus();
    expect(document.activeElement).toBe(firstItem);

    // Test arrow down navigation
    fireEvent.keyDown(sidebar, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('nav-cases'));
    });

    // Test arrow up navigation
    fireEvent.keyDown(sidebar, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(document.activeElement).toBe(firstItem);
    });

    // Test wrap-around navigation
    fireEvent.keyDown(sidebar, { key: 'ArrowUp' });
    await waitFor(() => {
      expect(document.activeElement).toBe(lastItem);
    });
  });

  it('should handle secure navigation with audit logging', async () => {
    renderWithProviders(<Sidebar />);

    const caseNav = screen.getByTestId('nav-cases');
    fireEvent.click(caseNav);

    // Verify navigation
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.CASES);

    // Verify audit logging
    expect(mockAuditLog).toHaveBeenCalledWith({
      action: 'NAVIGATION',
      from: expect.any(String),
      to: ROUTES.CASES,
      userId: mockSecurityContext.userId,
      timestamp: expect.any(String)
    });
  });

  it('should support high contrast mode for accessibility', async () => {
    renderWithProviders(
      <Sidebar />,
      {
        preloadedState: {
          ui: {
            accessibility: {
              highContrast: true
            }
          }
        }
      }
    );

    const sidebar = screen.getByTestId('main-sidebar');
    expect(sidebar).toHaveStyle({
      background: expect.stringContaining('contrast')
    });

    const navItems = screen.getAllByRole('menuitem');
    navItems.forEach(item => {
      expect(item).toHaveStyle({
        color: expect.stringContaining('contrast')
      });
    });
  });

  it('should handle mobile responsiveness and sidebar toggle', async () => {
    renderWithProviders(<Sidebar />);

    // Simulate mobile viewport
    global.innerWidth = 500;
    fireEvent(window, new Event('resize'));

    const caseNav = screen.getByTestId('nav-cases');
    fireEvent.click(caseNav);

    // Verify sidebar toggle on mobile
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ui/toggleSidebar'
      })
    );
  });

  it('should maintain security context during state changes', async () => {
    const { rerender } = renderWithProviders(<Sidebar />);

    // Simulate security context update
    const newContext = {
      ...mockSecurityContext,
      sessionId: 'new-session'
    };

    rerender(
      <SecurityProvider context={newContext}>
        <Sidebar />
      </SecurityProvider>
    );

    // Verify security context persistence
    expect(screen.getByTestId('main-sidebar'))
      .toHaveAttribute('data-session-id', 'new-session');

    // Verify audit logging of context change
    expect(mockAuditLog).toHaveBeenCalledWith({
      action: 'SECURITY_CONTEXT_UPDATE',
      oldSession: mockSecurityContext.sessionId,
      newSession: newContext.sessionId,
      timestamp: expect.any(String)
    });
  });
});