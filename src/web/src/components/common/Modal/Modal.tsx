import React, { useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import styles from './Modal.scss';

// Constants
const ESCAPE_KEY = 27;
const ANIMATION_DURATION = 300;
const MODAL_Z_INDEX = 1000;
const FOCUS_SELECTOR = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  size?: 'small' | 'medium' | 'large' | 'full';
  ariaLabel?: string;
  ariaDescribedBy?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  finalFocusRef?: React.RefObject<HTMLElement>;
  scrollBehavior?: 'inside' | 'outside';
  closeButtonLabel?: string;
  motionPreset?: 'scale' | 'slideInBottom' | 'slideInRight' | 'none';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  size = 'medium',
  ariaLabel,
  ariaDescribedBy,
  initialFocusRef,
  finalFocusRef,
  scrollBehavior = 'inside',
  closeButtonLabel = 'Close modal',
  motionPreset = 'scale'
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle escape key press
  const handleEscapeKey = useCallback((event: KeyboardEvent) => {
    if (closeOnEscape && event.keyCode === ESCAPE_KEY) {
      event.preventDefault();
      onClose();
    }
  }, [closeOnEscape, onClose]);

  // Handle overlay click
  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      event.stopPropagation();
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  // Handle animation end
  const handleAnimationEnd = useCallback((event: AnimationEvent) => {
    if (event.animationName.includes('modal-exit')) {
      if (finalFocusRef?.current) {
        finalFocusRef.current.focus();
      } else if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
      document.body.style.overflow = '';
    }
  }, [finalFocusRef]);

  // Manage body scroll and keyboard events
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscapeKey);

      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (modalRef.current) {
        const firstFocusable = modalRef.current.querySelector(FOCUS_SELECTOR);
        if (firstFocusable instanceof HTMLElement) {
          firstFocusable.focus();
        }
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isOpen, handleEscapeKey, initialFocusRef]);

  if (!isOpen) {
    return null;
  }

  const modalClasses = classNames(
    styles.modal,
    styles[`modal--${size}`],
    {
      [styles['modal--open']]: isOpen,
      [styles[`modal--${motionPreset}`]]: motionPreset !== 'none',
      [styles['modal--scroll-outside']]: scrollBehavior === 'outside'
    },
    className
  );

  return (
    <FocusTrap>
      <div 
        className={styles['modal-overlay']} 
        onClick={handleOverlayClick}
        style={{ zIndex: MODAL_Z_INDEX }}
      >
        <div
          ref={modalRef}
          className={modalClasses}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel || title}
          aria-describedby={ariaDescribedBy}
          onAnimationEnd={handleAnimationEnd as any}
        >
          <div className={styles['modal-header']}>
            <h2 id={`${ariaDescribedBy}-title`}>{title}</h2>
            <button
              type="button"
              className={styles['modal-close']}
              onClick={onClose}
              aria-label={closeButtonLabel}
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          <div 
            ref={contentRef}
            className={styles['modal-content']}
            id={ariaDescribedBy}
          >
            {children}
          </div>

          {footer && (
            <div className={styles['modal-footer']}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </FocusTrap>
  );
};

export default Modal;