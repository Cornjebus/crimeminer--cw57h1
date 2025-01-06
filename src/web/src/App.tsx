/**
 * Root application component implementing FedRAMP High and CJIS compliance requirements
 * with enhanced security monitoring, error handling, and accessibility features.
 * @version 1.0.0
 */

import { FC, useEffect } from 'react';
import { Provider } from 'react-redux'; // v8.1.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11
import { SecurityMonitor } from '@security/monitor'; // v2.1.0
import { SecurityProvider } from '@security/provider'; // v2.1.0

// Internal imports
import Router from './router/Router';
import store from './store/store';
import './assets/styles/global.scss';

// Security configuration
const SECURITY_CONFIG = {
  fedrampLevel: 'HIGH',
  cjisCompliance: true,
  auditLevel: 'DETAILED',
  sessionTimeout: 900, // 15 minutes in seconds
  mfaRequired: true,
  securityHeaders: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'"
  }
};

// Compliance settings
const COMPLIANCE_SETTINGS = {
  auditLogging: true,
  dataEncryption: true,
  accessControl: 'RBAC',
  securityMonitoring: true,
  incidentReporting: true
};

/**
 * Error fallback component with security incident reporting
 */
const ErrorFallback: FC<{ error: Error }> = ({ error }) => {
  useEffect(() => {
    // Log security incident
    SecurityMonitor.logSecurityIncident({
      type: 'ERROR_BOUNDARY',
      error: error.message,
      timestamp: new Date(),
      severity: 'HIGH'
    });
  }, [error]);

  return (
    <div role="alert" className="error-boundary">
      <h2>Application Error</h2>
      <p>An error has occurred. Please contact your system administrator.</p>
    </div>
  );
};

/**
 * Root application component with enhanced security features
 */
const App: FC = () => {
  useEffect(() => {
    // Initialize security monitoring
    SecurityMonitor.initialize({
      config: SECURITY_CONFIG,
      compliance: COMPLIANCE_SETTINGS
    });

    // Set up continuous compliance monitoring
    const complianceMonitor = SecurityMonitor.startComplianceMonitoring();

    return () => {
      complianceMonitor.stop();
      SecurityMonitor.cleanup();
    };
  }, []);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        SecurityMonitor.logSecurityIncident({
          type: 'ERROR_BOUNDARY',
          error: error.message,
          timestamp: new Date(),
          severity: 'HIGH'
        });
      }}
    >
      <SecurityProvider
        config={SECURITY_CONFIG}
        compliance={COMPLIANCE_SETTINGS}
      >
        <Provider store={store}>
          <div 
            className="app-root"
            role="application"
            aria-label="CrimeMiner Application"
          >
            <Router />
          </div>
        </Provider>
      </SecurityProvider>
    </ErrorBoundary>
  );
};

// Export with security monitoring decorator
export default SecurityMonitor.withSecurityTracking(App, {
  componentName: 'App',
  auditLevel: 'HIGH'
});