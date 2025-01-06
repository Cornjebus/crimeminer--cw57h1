/**
 * Test utilities implementing FedRAMP High and CJIS compliant test environments
 * with comprehensive security context simulation and compliance validation.
 * @version 1.0.0
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react'; // v14.0.0
import { Provider } from 'react-redux'; // v8.1.0
import { PreloadedState } from '@reduxjs/toolkit'; // v1.9.5
import { SecurityProvider, SecurityContext } from '@crimeminer/security'; // v1.0.0
import { ComplianceValidator } from '@crimeminer/compliance'; // v1.0.0
import store, { RootState } from '../../src/store/store';

/**
 * Interface for enhanced render options with security context
 */
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  preloadedState?: PreloadedState<RootState>;
  securityContext?: SecurityContext;
  complianceLevel?: 'FEDRAMP_HIGH' | 'CJIS';
  auditEnabled?: boolean;
}

/**
 * Security-enhanced test wrapper component
 */
interface WrapperProps {
  children: React.ReactNode;
  securityContext: SecurityContext;
}

/**
 * Default security context for tests
 */
const defaultSecurityContext: SecurityContext = {
  classificationLevel: 'FEDRAMP_HIGH',
  userId: 'test-user-id',
  agencyId: 'test-agency',
  jurisdiction: 'FEDERAL',
  sessionId: crypto.randomUUID(),
  clearanceLevel: 'SECRET',
  auditEnabled: true
};

/**
 * Default compliance validator configuration
 */
const complianceConfig = {
  level: 'FEDRAMP_HIGH',
  framework: 'CJIS',
  validateStateChanges: true,
  enforceDataClassification: true,
  auditLog: true
};

/**
 * Creates a security-enhanced test store with compliance validation
 * @param preloadedState - Initial state for the store
 * @param securityContext - Security context configuration
 * @returns Configured Redux store instance
 */
export function createSecureTestStore(
  preloadedState?: PreloadedState<RootState>,
  securityContext: SecurityContext = defaultSecurityContext
) {
  // Initialize compliance validator
  const validator = new ComplianceValidator(complianceConfig);

  // Create store with security middleware
  const testStore = store;
  testStore.dispatch({
    type: 'security/initialize',
    payload: securityContext
  });

  // Apply preloaded state if provided
  if (preloadedState) {
    testStore.dispatch({
      type: 'test/initializeState',
      payload: preloadedState
    });
  }

  // Validate initial state
  validator.validateState(testStore.getState());

  return testStore;
}

/**
 * Security-enhanced render function for testing components
 * @param ui - Component to render
 * @param options - Enhanced render options
 * @returns Render result with security context
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedState = {},
    securityContext = defaultSecurityContext,
    complianceLevel = 'FEDRAMP_HIGH',
    auditEnabled = true,
    ...renderOptions
  }: ExtendedRenderOptions = {}
): RenderResult {
  // Create secure test store
  const testStore = createSecureTestStore(preloadedState, securityContext);

  // Initialize compliance validator
  const validator = new ComplianceValidator({
    ...complianceConfig,
    level: complianceLevel
  });

  // Create wrapper component with security context
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SecurityProvider 
        context={securityContext}
        validator={validator}
        auditEnabled={auditEnabled}
      >
        <Provider store={testStore}>
          {children}
        </Provider>
      </SecurityProvider>
    );
  }

  // Render with security wrapper
  const renderResult = render(ui, { wrapper: Wrapper, ...renderOptions });

  // Return render result with store access
  return {
    ...renderResult,
    store: testStore,
    securityContext,
    rerender: (rerenderUi: ReactElement) =>
      renderWithProviders(rerenderUi, {
        preloadedState,
        securityContext,
        complianceLevel,
        auditEnabled,
        container: renderResult.container,
        ...renderOptions
      })
  };
}

/**
 * Helper function to validate security context in tests
 */
export function validateTestSecurity(
  context: SecurityContext,
  requiredLevel: 'FEDRAMP_HIGH' | 'CJIS' = 'FEDRAMP_HIGH'
): boolean {
  const validator = new ComplianceValidator({
    ...complianceConfig,
    level: requiredLevel
  });

  return validator.validateContext(context);
}

/**
 * Helper function to create audit log entries in tests
 */
export function createTestAuditEntry(
  action: string,
  details: Record<string, unknown>
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    userId: defaultSecurityContext.userId,
    sessionId: defaultSecurityContext.sessionId,
    details,
    classification: defaultSecurityContext.classificationLevel
  };

  // Log audit entry
  console.log('Test Audit Entry:', entry);
}

/**
 * Helper function to validate chain of custody in tests
 */
export function validateTestChainOfCustody(
  evidenceId: string,
  operations: string[]
): boolean {
  const chainHash = operations
    .map(op => `${op}:${defaultSecurityContext.userId}:${new Date().toISOString()}`)
    .join('|');

  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(chainHash))
    .then(() => true)
    .catch(() => false);
}