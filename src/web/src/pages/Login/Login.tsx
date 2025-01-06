/**
 * Login page component implementing FedRAMP High and CJIS compliant authentication
 * with MFA support, SSO integration, and comprehensive security logging.
 * @version 1.0.0
 */

import React, { useState, useEffect } from 'react'; // v18.2.0
import { useNavigate } from 'react-router-dom'; // v6.14.0
import { useAuth } from '../../hooks/useAuth';
import { LoginRequest } from '../../types/auth.types';
import { SecurityLogger } from '@crimeminer/security-logger'; // v1.0.0

// Initialize security logger
const securityLogger = new SecurityLogger({
  service: 'login-page',
  complianceLevel: 'FEDRAMP_HIGH'
});

// FIPS 140-2 password requirements
const PASSWORD_REQUIREMENTS = {
  minLength: 14,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecial: true
};

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, verifyMfa, loading, error, securityContext, complianceStatus } = useAuth();

  // Form state with security tracking
  const [formData, setFormData] = useState<LoginRequest>({
    username: '',
    password: '',
    mfaCode: '',
    securityClearance: '',
    complianceFlags: {
      fedRAMP: false,
      cjis: false
    }
  });

  // Security and validation state
  const [showMfa, setShowMfa] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<Date | null>(null);

  // Reset lockout after timeout
  useEffect(() => {
    if (lockoutTime && new Date() > lockoutTime) {
      setLockoutTime(null);
      setLoginAttempts(0);
    }
  }, [lockoutTime]);

  /**
   * Validates form input against FIPS 140-2 requirements
   */
  const validateInput = (field: string, value: string): string[] => {
    const errors: string[] = [];

    switch (field) {
      case 'password':
        if (value.length < PASSWORD_REQUIREMENTS.minLength) {
          errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
        }
        if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(value)) {
          errors.push('Password must contain uppercase letters');
        }
        if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(value)) {
          errors.push('Password must contain lowercase letters');
        }
        if (PASSWORD_REQUIREMENTS.requireNumbers && !/\d/.test(value)) {
          errors.push('Password must contain numbers');
        }
        if (PASSWORD_REQUIREMENTS.requireSpecial && !/[!@#$%^&*]/.test(value)) {
          errors.push('Password must contain special characters');
        }
        break;

      case 'username':
        if (!value.trim()) {
          errors.push('Username is required');
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
          errors.push('Username contains invalid characters');
        }
        break;

      case 'mfaCode':
        if (!value.trim()) {
          errors.push('MFA code is required');
        }
        if (!/^\d{6}$/.test(value)) {
          errors.push('MFA code must be 6 digits');
        }
        break;
    }

    return errors;
  };

  /**
   * Handles form input changes with validation
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    const errors = validateInput(name, value);
    setValidationErrors(prev => ({
      ...prev,
      [name]: errors.join(', ')
    }));
  };

  /**
   * Handles login form submission with security validation
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check lockout status
    if (lockoutTime && new Date() < lockoutTime) {
      return;
    }

    try {
      // Validate all inputs
      let hasErrors = false;
      const newErrors: Record<string, string> = {};
      
      Object.entries(formData).forEach(([field, value]) => {
        if (typeof value === 'string') {
          const fieldErrors = validateInput(field, value);
          if (fieldErrors.length > 0) {
            hasErrors = true;
            newErrors[field] = fieldErrors.join(', ');
          }
        }
      });

      if (hasErrors) {
        setValidationErrors(newErrors);
        return;
      }

      // Log login attempt
      await securityLogger.logEvent({
        type: 'LOGIN_ATTEMPT',
        username: formData.username,
        ipAddress: window.location.hostname,
        userAgent: navigator.userAgent
      });

      // Attempt login
      const response = await login(formData);

      if (response.mfaRequired) {
        setShowMfa(true);
      } else {
        navigate('/dashboard');
      }

      // Reset attempts on success
      setLoginAttempts(0);

    } catch (error) {
      // Increment failed attempts
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);

      // Implement lockout after 3 failed attempts
      if (newAttempts >= 3) {
        const lockoutEndTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        setLockoutTime(lockoutEndTime);
        
        await securityLogger.logEvent({
          type: 'ACCOUNT_LOCKOUT',
          username: formData.username,
          lockoutUntil: lockoutEndTime
        });
      }

      // Log failure
      await securityLogger.logEvent({
        type: 'LOGIN_FAILURE',
        username: formData.username,
        error: error instanceof Error ? error.message : 'Unknown error',
        attemptNumber: newAttempts
      });
    }
  };

  /**
   * Handles MFA code verification
   */
  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const errors = validateInput('mfaCode', formData.mfaCode);
      if (errors.length > 0) {
        setValidationErrors(prev => ({
          ...prev,
          mfaCode: errors.join(', ')
        }));
        return;
      }

      await securityLogger.logEvent({
        type: 'MFA_ATTEMPT',
        username: formData.username
      });

      await verifyMfa(formData.mfaCode);
      navigate('/dashboard');

    } catch (error) {
      await securityLogger.logEvent({
        type: 'MFA_FAILURE',
        username: formData.username,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>CrimeMiner Login</h1>
        
        {lockoutTime && (
          <div className="error-message">
            Account locked. Please try again after {lockoutTime.toLocaleTimeString()}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {!showMfa ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                disabled={loading || (lockoutTime && new Date() < lockoutTime)}
                aria-invalid={!!validationErrors.username}
              />
              {validationErrors.username && (
                <div className="validation-error">{validationErrors.username}</div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                disabled={loading || (lockoutTime && new Date() < lockoutTime)}
                aria-invalid={!!validationErrors.password}
              />
              {validationErrors.password && (
                <div className="validation-error">{validationErrors.password}</div>
              )}
            </div>

            <button 
              type="submit"
              disabled={loading || (lockoutTime && new Date() < lockoutTime)}
            >
              {loading ? 'Authenticating...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="mfa-form">
            <div className="form-group">
              <label htmlFor="mfaCode">Enter MFA Code</label>
              <input
                type="text"
                id="mfaCode"
                name="mfaCode"
                value={formData.mfaCode}
                onChange={handleInputChange}
                disabled={loading}
                maxLength={6}
                aria-invalid={!!validationErrors.mfaCode}
              />
              {validationErrors.mfaCode && (
                <div className="validation-error">{validationErrors.mfaCode}</div>
              )}
            </div>

            <button type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify MFA'}
            </button>
          </form>
        )}

        <div className="compliance-status">
          <div>FedRAMP Status: {complianceStatus?.fedRAMP ? 'Compliant' : 'Non-Compliant'}</div>
          <div>CJIS Status: {complianceStatus?.cjis ? 'Compliant' : 'Non-Compliant'}</div>
        </div>
      </div>
    </div>
  );
};

export default Login;