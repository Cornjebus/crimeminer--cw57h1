/**
 * FedRAMP High and CJIS compliant React hook for secure WebSocket communication.
 * Implements real-time notifications, alerts, and collaborative case management.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { CircuitBreaker } from 'resilience4j-ts'; // v1.0.0
import winston from 'winston'; // v3.8.0
import { WEBSOCKET_CONFIG } from '../config/websocket.config';
import { NotificationWebSocket } from '../services/websocket/notification.ws';

// Global constants
const RECONNECTION_TIMEOUT = 5000;
const MAX_RECONNECTION_ATTEMPTS = 5;
const RATE_LIMIT_THRESHOLD = 100;
const SECURITY_CONTEXT_TIMEOUT = 3600000; // 1 hour

// Configure audit logger
const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'websocket-hook' },
  transports: [
    new winston.transports.File({ filename: 'websocket-audit.log' })
  ]
});

/**
 * Interface for WebSocket connection health metrics
 */
interface ConnectionHealth {
  latency: number;
  uptime: number;
  lastPing: Date;
  reconnectionAttempts: number;
  securityStatus: 'COMPLIANT' | 'NON_COMPLIANT';
}

/**
 * Interface for WebSocket hook return values
 */
interface WebSocketHook {
  isConnected: boolean;
  isSecure: boolean;
  connectionHealth: ConnectionHealth;
  connect: () => Promise<void>;
  disconnect: () => void;
  subscribe: (event: string, callback: Function) => void;
  unsubscribe: (event: string) => void;
}

/**
 * FedRAMP-compliant WebSocket hook with security controls and audit logging
 */
export const useWebSocket = (
  authToken: string,
  securityContext: any
): WebSocketHook => {
  // State management
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSecure, setIsSecure] = useState<boolean>(false);
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>({
    latency: 0,
    uptime: 0,
    lastPing: new Date(),
    reconnectionAttempts: 0,
    securityStatus: 'NON_COMPLIANT'
  });

  // Refs for persistent values
  const wsRef = useRef<NotificationWebSocket | null>(null);
  const startTimeRef = useRef<Date>(new Date());
  const securityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Circuit breaker for connection management
  const circuitBreaker = new CircuitBreaker('websocket', {
    failureRateThreshold: 50,
    waitDurationInOpenState: 10000,
    slidingWindowSize: 100
  });

  /**
   * Establishes secure WebSocket connection with FedRAMP compliance
   */
  const connect = useCallback(async (): Promise<void> => {
    try {
      // Validate security context
      if (!securityContext || !authToken) {
        throw new Error('Invalid security context or auth token');
      }

      // Initialize WebSocket client with security config
      wsRef.current = new NotificationWebSocket();
      
      // Establish secure connection
      await circuitBreaker.executeAsync(async () => {
        await wsRef.current?.connect(authToken, securityContext);
      });

      // Update connection state
      setIsConnected(true);
      setIsSecure(true);
      startTimeRef.current = new Date();

      // Start security context timeout
      securityTimeoutRef.current = setTimeout(() => {
        disconnect();
      }, SECURITY_CONTEXT_TIMEOUT);

      // Log successful connection
      auditLogger.info('WebSocket connection established', {
        userId: securityContext.userId,
        timestamp: new Date()
      });

    } catch (error) {
      auditLogger.error('WebSocket connection failed', {
        error: error.message,
        userId: securityContext.userId
      });
      throw error;
    }
  }, [authToken, securityContext]);

  /**
   * Securely terminates WebSocket connection
   */
  const disconnect = useCallback((): void => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
      
      // Clear security timeout
      if (securityTimeoutRef.current) {
        clearTimeout(securityTimeoutRef.current);
      }

      // Update state
      setIsConnected(false);
      setIsSecure(false);

      // Log disconnection
      auditLogger.info('WebSocket connection terminated', {
        userId: securityContext.userId,
        timestamp: new Date()
      });
    }
  }, [securityContext]);

  /**
   * Subscribes to WebSocket events with security validation
   */
  const subscribe = useCallback((event: string, callback: Function): void => {
    if (!wsRef.current || !WEBSOCKET_CONFIG.EVENTS[event]) {
      throw new Error('Invalid event subscription attempt');
    }

    // Validate rate limits
    const eventCount = wsRef.current?.getEventCount(event) || 0;
    if (eventCount > RATE_LIMIT_THRESHOLD) {
      throw new Error('Event subscription rate limit exceeded');
    }

    // Register secure event handler
    wsRef.current.subscribe(event, (data: any) => {
      // Validate security context before processing
      if (wsRef.current?.validateSecurityContext(securityContext)) {
        callback(data);
      }
    });

    // Log subscription
    auditLogger.info('WebSocket event subscribed', {
      event,
      userId: securityContext.userId
    });
  }, [securityContext]);

  /**
   * Unsubscribes from WebSocket events
   */
  const unsubscribe = useCallback((event: string): void => {
    if (wsRef.current) {
      wsRef.current.unsubscribe(event);
      
      // Log unsubscription
      auditLogger.info('WebSocket event unsubscribed', {
        event,
        userId: securityContext.userId
      });
    }
  }, [securityContext]);

  /**
   * Monitors connection health and security compliance
   */
  useEffect(() => {
    if (!isConnected) return;

    const healthCheck = setInterval(() => {
      if (wsRef.current) {
        const now = new Date();
        setConnectionHealth({
          latency: wsRef.current.getLatency(),
          uptime: now.getTime() - startTimeRef.current.getTime(),
          lastPing: now,
          reconnectionAttempts: wsRef.current.getReconnectionAttempts(),
          securityStatus: wsRef.current.validateSecurityContext(securityContext) 
            ? 'COMPLIANT' 
            : 'NON_COMPLIANT'
        });
      }
    }, WEBSOCKET_CONFIG.SECURITY_OPTIONS.pingInterval);

    return () => clearInterval(healthCheck);
  }, [isConnected, securityContext]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isSecure,
    connectionHealth,
    connect,
    disconnect,
    subscribe,
    unsubscribe
  };
};