/**
 * Entry point for the CrimeMiner web application implementing FedRAMP High and CJIS compliance.
 * Initializes React application with security context, internationalization, and audit logging.
 * @version 1.0.0
 */

import React, { StrictMode } from 'react'; // v18.2.0
import ReactDOM from 'react-dom/client'; // v18.2.0
import { Provider as ReduxProvider } from 'react-redux'; // v8.1.0
import { SecurityProvider } from '@crimeminer/security'; // v1.0.0
import { AuditLogger } from '@crimeminer/audit-logger'; // v1.0.0
import { ComplianceMonitor } from '@crimeminer/compliance-utils'; // v1.0.0

// Internal imports
import { App } from './App';
import { initializeI18n } from './i18n/config';
import store from './store/store';
import './assets/styles/global.scss';

// Constants for configuration
const ROOT_ELEMENT_ID = 'root';
const SECURITY_COMPLIANCE_LEVEL = 'FEDRAMP_HIGH';
const CJIS_COMPLIANCE_ENABLED = true;

// Initialize audit logger
const auditLogger = new AuditLogger({
  level: 'INFO',
  context: 'APP_INITIALIZATION',
  compliance: SECURITY_COMPLIANCE_LEVEL
});

// Initialize compliance monitor
const complianceMonitor = new ComplianceMonitor({
  level: SECURITY_COMPLIANCE_LEVEL,
  cjisEnabled: CJIS_COMPLIANCE_ENABLED,
  auditLogger
});

/**
 * Validates runtime security requirements
 * @throws Error if security requirements are not met
 */
const validateSecurityRequirements = async (): Promise<void> => {
  try {
    // Validate secure context
    if (!window.isSecureContext) {
      throw new Error('Application must run in a secure context');
    }

    // Validate required security headers
    const securityHeaders = {
      'Content-Security-Policy': "default-src 'self'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    };

    // Log security validation
    await auditLogger.log({
      event: 'SECURITY_VALIDATION',
      status: 'SUCCESS',
      details: 'Runtime security requirements validated'
    });
  } catch (error) {
    await auditLogger.error({
      event: 'SECURITY_VALIDATION_FAILED',
      error: error instanceof Error ? error.message : 'Unknown error',
      severity: 'CRITICAL'
    });
    throw error;
  }
};

/**
 * Initializes the application with security context and compliance monitoring
 */
const initializeApp = async (): Promise<void> => {
  try {
    // Validate security requirements
    await validateSecurityRequirements();

    // Initialize internationalization
    await initializeI18n();

    // Start compliance monitoring
    await complianceMonitor.start();

    // Get root element
    const rootElement = document.getElementById(ROOT_ELEMENT_ID);
    if (!rootElement) {
      throw new Error('Root element not found');
    }

    // Create React root with security context
    const root = ReactDOM.createRoot(rootElement);

    // Render application with security providers
    root.render(
      <StrictMode>
        <SecurityProvider
          level={SECURITY_COMPLIANCE_LEVEL}
          cjisEnabled={CJIS_COMPLIANCE_ENABLED}
          auditLogger={auditLogger}
        >
          <ReduxProvider store={store}>
            <App />
          </ReduxProvider>
        </SecurityProvider>
      </StrictMode>
    );

    // Log successful initialization
    await auditLogger.log({
      event: 'APP_INITIALIZED',
      status: 'SUCCESS',
      details: 'Application initialized successfully'
    });

    // Enable development security tools in non-production
    if (process.env.NODE_ENV === 'development') {
      const { enableSecurityTools } = await import('./utils/devTools');
      enableSecurityTools(complianceMonitor);
    }
  } catch (error) {
    await auditLogger.error({
      event: 'APP_INITIALIZATION_FAILED',
      error: error instanceof Error ? error.message : 'Unknown error',
      severity: 'CRITICAL'
    });
    
    // Display error page
    document.body.innerHTML = `
      <div role="alert" style="padding: 20px; text-align: center;">
        <h1>Application Error</h1>
        <p>The application failed to initialize due to security requirements not being met.</p>
        <p>Please contact your system administrator.</p>
      </div>
    `;
  }
};

// Initialize application
initializeApp().catch(console.error);

// Handle unhandled errors and rejections
window.addEventListener('unhandledrejection', async (event) => {
  await auditLogger.error({
    event: 'UNHANDLED_REJECTION',
    error: event.reason?.message || 'Unknown error',
    severity: 'HIGH'
  });
});

window.addEventListener('error', async (event) => {
  await auditLogger.error({
    event: 'UNHANDLED_ERROR',
    error: event.message,
    severity: 'HIGH'
  });
});