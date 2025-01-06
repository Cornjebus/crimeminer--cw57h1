/**
 * Higher-order component that protects routes requiring authentication with enhanced
 * security features implementing FedRAMP High and CJIS compliance requirements.
 * @version 1.0.0
 */

import { FC, PropsWithChildren, useCallback, useEffect } from 'react'; // v18.2.0
import { Navigate, useLocation } from 'react-router-dom'; // v6.14.0
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from '../constants/routes.constants';
import { useAuditLog } from '@crimeminer/audit-logger'; // v1.0.0
import { useSecurityMonitor } from '@crimeminer/security-monitor'; // v1.0.0

/**
 * Security level enum for route protection
 */
enum SecurityLevel {
  STANDARD = 'STANDARD',
  HIGH = 'HIGH',
  RESTRICTED = 'RESTRICTED'
}

/**
 * Audit options interface for route access logging
 */
interface AuditOptions {
  logAccess: boolean;
  logViolations: boolean;
  trackActivity: boolean;
}

/**
 * Props interface for PrivateRoute component with enhanced security options
 */
interface PrivateRouteProps extends PropsWithChildren {
  roles?: string[];
  securityLevel?: SecurityLevel;
  auditOptions?: AuditOptions;
}

/**
 * Default audit options with comprehensive logging enabled
 */
const DEFAULT_AUDIT_OPTIONS: AuditOptions = {
  logAccess: true,
  logViolations: true,
  trackActivity: true
};

/**
 * Higher-order component that implements secure route protection with
 * role-based access control and comprehensive security monitoring
 */
const PrivateRoute: FC<PrivateRouteProps> = ({
  children,
  roles = [],
  securityLevel = SecurityLevel.STANDARD,
  auditOptions = DEFAULT_AUDIT_OPTIONS
}) => {
  // Get authentication state and security context
  const { isAuthenticated, user, loading, securityContext } = useAuth();
  const location = useLocation();

  // Initialize security monitoring and audit logging
  const { logRouteAccess, logSecurityViolation } = useAuditLog();
  const { monitorSession, validateSecurityContext } = useSecurityMonitor();

  /**
   * Validates user's role-based access against required roles
   */
  const validateRoleAccess = useCallback(() => {
    if (!user || !roles.length) return true;
    return roles.some(role => user.roles.includes(role));
  }, [user, roles]);

  /**
   * Validates security level requirements
   */
  const validateSecurityLevel = useCallback(() => {
    if (!user || !securityContext) return false;

    switch (securityLevel) {
      case SecurityLevel.HIGH:
        return securityContext.complianceStatus === 'COMPLIANT' &&
          user.securityClearance === 'SECRET';
      case SecurityLevel.RESTRICTED:
        return securityContext.complianceStatus === 'COMPLIANT' &&
          user.securityClearance === 'TOP_SECRET';
      default:
        return true;
    }
  }, [user, securityContext, securityLevel]);

  /**
   * Monitors security context and session activity
   */
  useEffect(() => {
    if (isAuthenticated && user) {
      // Start session monitoring
      const stopMonitoring = monitorSession({
        userId: user.id,
        sessionId: user.sessionId,
        securityLevel
      });

      // Validate security context periodically
      const contextInterval = setInterval(() => {
        validateSecurityContext(user.id);
      }, 60000); // Check every minute

      return () => {
        stopMonitoring();
        clearInterval(contextInterval);
      };
    }
  }, [isAuthenticated, user, securityLevel, monitorSession, validateSecurityContext]);

  // Handle loading state
  if (loading) {
    return null; // Or return a loading spinner component
  }

  // Log route access attempt if enabled
  if (auditOptions.logAccess) {
    logRouteAccess({
      path: location.pathname,
      userId: user?.id,
      timestamp: new Date(),
      successful: isAuthenticated && validateRoleAccess() && validateSecurityLevel()
    });
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  // Validate role-based access
  if (!validateRoleAccess()) {
    if (auditOptions.logViolations) {
      logSecurityViolation({
        type: 'UNAUTHORIZED_ACCESS',
        userId: user?.id,
        path: location.pathname,
        requiredRoles: roles,
        userRoles: user?.roles
      });
    }
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  // Validate security level requirements
  if (!validateSecurityLevel()) {
    if (auditOptions.logViolations) {
      logSecurityViolation({
        type: 'INSUFFICIENT_CLEARANCE',
        userId: user?.id,
        path: location.pathname,
        requiredLevel: securityLevel,
        userClearance: user?.securityClearance
      });
    }
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  // Render protected route content
  return <>{children}</>;
};

export default PrivateRoute;