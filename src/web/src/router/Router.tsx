/**
 * @fileoverview Enhanced secure router component implementing FedRAMP High and CJIS compliant
 * role-based access control with continuous security validation and comprehensive audit logging.
 * @version 1.0.0
 */

import { FC, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'; // v6.14.0
import { useSecureAuth } from '@crimeminer/auth'; // v1.0.0
import secureRoutes from './routes';
import { AuditLogger } from '@crimeminer/audit-logger'; // v1.0.0
import { SecurityValidator } from '@crimeminer/security-utils'; // v1.0.0
import { ComplianceMonitor } from '@crimeminer/compliance-utils'; // v1.0.0
import LoadingSpinner from '../components/LoadingSpinner';
import SecurityViolationPage from '../pages/SecurityViolation';
import NotFoundPage from '../pages/NotFound';

// Initialize security services
const auditLogger = new AuditLogger();
const securityValidator = new SecurityValidator();
const complianceMonitor = new ComplianceMonitor();

/**
 * Enhanced router component with comprehensive security validation and compliance monitoring
 */
const SecureRouter: FC = () => {
  const { 
    loading, 
    user, 
    securityContext, 
    complianceStatus,
    validateAccess 
  } = useSecureAuth();

  // Set up continuous security monitoring
  useEffect(() => {
    const securityMonitor = complianceMonitor.startContinuousMonitoring({
      securityContext,
      complianceStatus,
      auditLogger
    });

    return () => {
      securityMonitor.stop();
    };
  }, [securityContext, complianceStatus]);

  // Show loading state while authenticating
  if (loading) {
    return <LoadingSpinner />;
  }

  // Validate security context
  if (!securityValidator.isValidContext(securityContext)) {
    auditLogger.logSecurityEvent({
      type: 'SECURITY_VIOLATION',
      details: 'Invalid security context detected',
      user: user?.id
    });
    return <SecurityViolationPage />;
  }

  // Validate compliance status
  if (!complianceMonitor.isCompliant(complianceStatus)) {
    auditLogger.logComplianceEvent({
      type: 'COMPLIANCE_VIOLATION',
      details: 'System compliance check failed',
      user: user?.id
    });
    return <SecurityViolationPage />;
  }

  /**
   * Enhanced route access validator with security and compliance checks
   */
  const validateRouteAccess = (route: typeof secureRoutes[0]) => {
    const accessValidation = validateAccess({
      requiredRoles: route.roles,
      securityLevel: route.securityLevel,
      complianceChecks: route.complianceChecks
    });

    // Log access attempt
    auditLogger.logAccessEvent({
      type: 'ROUTE_ACCESS',
      path: route.path,
      allowed: accessValidation.granted,
      user: user?.id,
      auditLevel: route.auditLevel
    });

    return accessValidation.granted;
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Map secure routes with enhanced protection */}
        {secureRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              route.requireAuth && !validateRouteAccess(route) ? (
                <Navigate 
                  to="/login" 
                  state={{ from: route.path }} 
                  replace 
                />
              ) : (
                <route.component />
              )
            }
          />
        ))}

        {/* Secure redirect from root */}
        <Route 
          path="/" 
          element={
            <Navigate 
              to="/dashboard" 
              replace 
            />
          } 
        />

        {/* Secure catch-all route */}
        <Route 
          path="*" 
          element={<NotFoundPage />} 
        />
      </Routes>
    </BrowserRouter>
  );
};

export default SecureRouter;