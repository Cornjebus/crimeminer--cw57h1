/**
 * Enhanced sidebar navigation component implementing FedRAMP High and CJIS compliant
 * access control with WCAG 2.1 AA accessibility features.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // v6.14.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.1
import styled from 'styled-components'; // v5.3.10
import { analytics } from '@segment/analytics-next'; // v1.51.0

import { ROUTES } from '../../../constants/routes.constants';
import { useAuth } from '../../../hooks/useAuth';
import { toggleSidebar, selectIsSidebarOpen, selectAccessibility } from '../../../store/slices/ui.slice';
import { THEME, TYPOGRAPHY, LAYOUT, ANIMATION, mediaQuery } from '../../../constants/ui.constants';

// Navigation items with role-based access control
const NAV_ITEMS = [
  {
    path: ROUTES.DASHBOARD,
    label: 'Dashboard',
    icon: 'dashboard',
    roles: ['all'],
    ariaLabel: 'Navigate to Dashboard',
    testId: 'nav-dashboard'
  },
  {
    path: ROUTES.CASES,
    label: 'Cases',
    icon: 'folder',
    roles: ['investigator', 'supervisor', 'administrator'],
    ariaLabel: 'Navigate to Cases',
    testId: 'nav-cases'
  },
  {
    path: ROUTES.EVIDENCE,
    label: 'Evidence',
    icon: 'evidence',
    roles: ['investigator', 'supervisor', 'administrator'],
    ariaLabel: 'Navigate to Evidence',
    testId: 'nav-evidence'
  },
  {
    path: ROUTES.ANALYSIS,
    label: 'Analysis',
    icon: 'chart',
    roles: ['analyst', 'investigator', 'supervisor', 'administrator'],
    ariaLabel: 'Navigate to Analysis',
    testId: 'nav-analysis'
  },
  {
    path: ROUTES.SEARCH,
    label: 'Search',
    icon: 'search',
    roles: ['all'],
    ariaLabel: 'Navigate to Search',
    testId: 'nav-search'
  },
  {
    path: ROUTES.REPORTS,
    label: 'Reports',
    icon: 'document',
    roles: ['investigator', 'supervisor', 'administrator'],
    ariaLabel: 'Navigate to Reports',
    testId: 'nav-reports'
  },
  {
    path: ROUTES.SETTINGS,
    label: 'Settings',
    icon: 'settings',
    roles: ['administrator'],
    ariaLabel: 'Navigate to Settings',
    testId: 'nav-settings'
  }
] as const;

// Styled components with WCAG compliance
const SidebarContainer = styled.nav<{ isOpen: boolean; highContrast: boolean }>`
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  width: ${({ isOpen }) => (isOpen ? '280px' : '0')};
  background: ${({ theme, highContrast }) => 
    highContrast ? theme.BACKGROUND : theme.PRIMARY};
  color: ${({ theme }) => theme.TEXT};
  transition: width ${ANIMATION.DURATION.NORMAL}ms ${ANIMATION.EASING.EASE_IN_OUT};
  overflow-x: hidden;
  z-index: ${({ theme }) => theme.Z_INDEX.SIDEBAR};
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  
  ${mediaQuery.mobile} {
    width: ${({ isOpen }) => (isOpen ? '100%' : '0')};
  }
`;

const NavList = styled.ul`
  list-style: none;
  padding: ${LAYOUT.SPACING.MD}px 0;
  margin: 0;
`;

const NavItem = styled.li<{ isActive: boolean; highContrast: boolean }>`
  padding: ${LAYOUT.SPACING.SM}px ${LAYOUT.SPACING.MD}px;
  margin: ${LAYOUT.SPACING.XS}px 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  background: ${({ isActive, theme, highContrast }) =>
    isActive ? (highContrast ? theme.PRIMARY : theme.SECONDARY) : 'transparent'};
  color: ${({ theme }) => theme.TEXT};
  border-radius: 4px;
  transition: background ${ANIMATION.DURATION.FAST}ms ${ANIMATION.EASING.EASE_OUT};
  
  &:hover {
    background: ${({ theme, highContrast }) =>
      highContrast ? theme.PRIMARY : theme.SECONDARY};
  }
  
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.PRIMARY};
    outline-offset: 2px;
  }
`;

const NavIcon = styled.span`
  margin-right: ${LAYOUT.SPACING.SM}px;
  font-size: ${TYPOGRAPHY.FONT_SIZE.MD};
`;

const NavLabel = styled.span`
  font-family: ${TYPOGRAPHY.FONT_FAMILY.PRIMARY};
  font-size: ${TYPOGRAPHY.FONT_SIZE.MD};
  font-weight: ${TYPOGRAPHY.FONT_WEIGHT.MEDIUM};
`;

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, isAuthenticated } = useAuth();
  const isOpen = useSelector(selectIsSidebarOpen);
  const accessibility = useSelector(selectAccessibility);
  const sidebarRef = useRef<HTMLElement>(null);

  // Handle secure navigation with analytics
  const handleNavigation = useCallback((path: string, item: typeof NAV_ITEMS[0]) => {
    if (!isAuthenticated) return;

    // Track navigation attempt
    analytics.track('Navigation_Click', {
      path,
      role: user?.roles?.[0],
      timestamp: new Date().toISOString()
    });

    // Check role-based access
    const hasAccess = item.roles.includes('all') || 
      user?.roles?.some(role => item.roles.includes(role.toLowerCase()));

    if (hasAccess) {
      navigate(path);
      
      // Close sidebar on mobile
      if (window.innerWidth < LAYOUT.BREAKPOINTS.TABLET) {
        dispatch(toggleSidebar());
      }
    }
  }, [isAuthenticated, user, navigate, dispatch]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!sidebarRef.current) return;

    const focusableElements = sidebarRef.current.querySelectorAll(
      'li[tabindex="0"]'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (document.activeElement === lastElement) {
          firstElement?.focus();
        } else {
          (document.activeElement?.nextElementSibling as HTMLElement)?.focus();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (document.activeElement === firstElement) {
          lastElement?.focus();
        } else {
          (document.activeElement?.previousElementSibling as HTMLElement)?.focus();
        }
        break;
    }
  }, []);

  // Set up keyboard navigation
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (sidebar && accessibility.keyboardNavigation) {
      sidebar.addEventListener('keydown', handleKeyDown);
      return () => sidebar.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, accessibility.keyboardNavigation]);

  return (
    <SidebarContainer
      ref={sidebarRef}
      isOpen={isOpen}
      highContrast={accessibility.highContrast}
      role="navigation"
      aria-label="Main navigation"
      data-testid="main-sidebar"
    >
      <NavList>
        {NAV_ITEMS.map((item) => {
          const hasAccess = item.roles.includes('all') || 
            user?.roles?.some(role => item.roles.includes(role.toLowerCase()));

          if (!hasAccess) return null;

          return (
            <NavItem
              key={item.path}
              onClick={() => handleNavigation(item.path, item)}
              onKeyPress={(e) => e.key === 'Enter' && handleNavigation(item.path, item)}
              isActive={location.pathname === item.path}
              highContrast={accessibility.highContrast}
              tabIndex={0}
              role="menuitem"
              aria-label={item.ariaLabel}
              data-testid={item.testId}
            >
              <NavIcon className={`icon-${item.icon}`} aria-hidden="true" />
              <NavLabel>{item.label}</NavLabel>
            </NavItem>
          );
        })}
      </NavList>
    </SidebarContainer>
  );
};

export default Sidebar;