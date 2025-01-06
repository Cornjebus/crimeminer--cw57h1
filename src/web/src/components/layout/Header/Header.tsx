import React, { useState, useCallback, useEffect } from 'react';
import classNames from 'classnames'; // v2.3.0
import { useAuth } from '../../../hooks/useAuth';
import Button from '../../common/Button/Button';
import styles from './Header.scss';
import { AccessLevel } from '../../../types/auth.types';

interface HeaderProps {
  className?: string;
  securityLevel?: string;
  sessionTimeout?: number;
}

const Header: React.FC<HeaderProps> = ({
  className,
  securityLevel = 'FEDRAMP_HIGH',
  sessionTimeout = 900000 // 15 minutes default
}) => {
  // State management
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [sessionTimer, setSessionTimer] = useState<number>(sessionTimeout);

  // Auth hook with security features
  const { user, logout, securityContext, complianceViolations } = useAuth();

  // Handle secure logout with audit logging
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, [logout]);

  // Session timeout management
  useEffect(() => {
    if (!user) return;

    const warningThreshold = sessionTimeout * 0.8; // Show warning at 80% of timeout
    let timer: NodeJS.Timeout;

    const checkSessionTimeout = () => {
      setSessionTimer(prev => {
        const newTime = prev - 1000;
        if (newTime <= warningThreshold && !timeoutWarning) {
          setTimeoutWarning(true);
        }
        if (newTime <= 0) {
          handleLogout();
        }
        return newTime;
      });
    };

    timer = setInterval(checkSessionTimeout, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [user, sessionTimeout, handleLogout, timeoutWarning]);

  // Reset session timer on user activity
  const resetSessionTimer = useCallback(() => {
    setSessionTimer(sessionTimeout);
    setTimeoutWarning(false);
  }, [sessionTimeout]);

  // Handle user activity
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetSessionTimer();

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [resetSessionTimer]);

  // Render security warning if compliance violations exist
  const renderSecurityWarning = () => {
    if (complianceViolations && complianceViolations.length > 0) {
      return (
        <div className={styles.header__warning} role="alert" aria-live="polite">
          <span className={styles['header__warning-icon']}>⚠️</span>
          <span>Security compliance violations detected</span>
        </div>
      );
    }
    return null;
  };

  return (
    <header 
      className={classNames(styles.header, className)}
      role="banner"
      data-security-level={securityLevel}
    >
      <div className={styles.header__container}>
        {/* Logo and branding section */}
        <a 
          href="/" 
          className={styles.header__logo}
          aria-label="CrimeMiner Home"
        >
          <span className={styles['header__logo-icon']}>🔍</span>
          <span className={styles['header__logo-text']}>CrimeMiner</span>
        </a>

        {/* Search section */}
        <div 
          className={classNames(styles.header__search, {
            [styles['header__search--expanded']]: searchExpanded
          })}
        >
          <input
            type="search"
            placeholder="Search evidence and cases..."
            aria-label="Search evidence and cases"
            className={styles.header__searchInput}
          />
        </div>

        {/* Actions section */}
        <div className={styles.header__actions}>
          {/* Profile button */}
          <Button
            variant="secondary"
            size="small"
            icon={<span aria-hidden="true">👤</span>}
            ariaLabel={`Profile: ${user?.username}`}
            onClick={() => {/* Handle profile click */}}
          >
            {user?.username}
          </Button>

          {/* Notifications button */}
          <Button
            variant="secondary"
            size="small"
            icon={<span aria-hidden="true">🔔</span>}
            ariaLabel="View notifications"
            onClick={() => {/* Handle notifications click */}}
          >
            Alerts
          </Button>

          {/* Settings button */}
          <Button
            variant="secondary"
            size="small"
            icon={<span aria-hidden="true">⚙️</span>}
            ariaLabel="Open settings"
            onClick={() => {/* Handle settings click */}}
          >
            Settings
          </Button>

          {/* Logout button */}
          <Button
            variant="secondary"
            size="small"
            icon={<span aria-hidden="true">🚪</span>}
            ariaLabel="Log out"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>
      </div>

      {/* Security warning banner */}
      {renderSecurityWarning()}

      {/* Session timeout warning */}
      {timeoutWarning && (
        <div 
          className={styles.header__timeout}
          role="alert"
          aria-live="assertive"
        >
          <span>Session will expire in {Math.ceil(sessionTimer / 1000)} seconds</span>
          <Button
            variant="primary"
            size="small"
            onClick={resetSessionTimer}
          >
            Extend Session
          </Button>
        </div>
      )}

      {/* Screen reader announcements */}
      <div className={styles['header__sr-only']} aria-live="polite">
        {securityContext?.lastValidated && (
          <span>
            Security context last validated at{' '}
            {new Date(securityContext.lastValidated).toLocaleTimeString()}
          </span>
        )}
      </div>
    </header>
  );
};

export default Header;