import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import './Select.scss';

export interface SelectProps {
  name: string;
  options: string[];
  value: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  isHighContrast?: boolean;
  onChange: (value: string) => void;
  className?: string;
}

interface KeyboardSearchState {
  query: string;
  lastKeyTime: number;
}

const KEYBOARD_SEARCH_RESET_DELAY = 1000;

const useSelectKeyboardSearch = (options: string[]) => {
  const [searchState, setSearchState] = useState<KeyboardSearchState>({
    query: '',
    lastKeyTime: 0,
  });
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const handleCharacterKey = useCallback((char: string) => {
    const now = Date.now();
    setSearchState(prev => ({
      query: now - prev.lastKeyTime > KEYBOARD_SEARCH_RESET_DELAY ? char : prev.query + char,
      lastKeyTime: now,
    }));
  }, []);

  const findMatchingOption = useCallback((query: string) => {
    return options.findIndex(option => 
      option.toLowerCase().startsWith(query.toLowerCase())
    );
  }, [options]);

  useEffect(() => {
    if (searchState.query) {
      searchTimeoutRef.current = setTimeout(() => {
        setSearchState({ query: '', lastKeyTime: 0 });
      }, KEYBOARD_SEARCH_RESET_DELAY);
    }
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchState]);

  return { searchState, handleCharacterKey, findMatchingOption };
};

export const Select: React.FC<SelectProps> = ({
  name,
  options,
  value,
  placeholder = 'Select an option',
  disabled = false,
  error = false,
  ariaLabel,
  ariaDescribedBy,
  isHighContrast = false,
  onChange,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const controlRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const selectedIndex = options.indexOf(value);
  
  const { searchState, handleCharacterKey, findMatchingOption } = useSelectKeyboardSearch(options);

  const handleKeyboardNavigation = useCallback((event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(selectedIndex !== -1 ? selectedIndex : 0);
        } else {
          setFocusedIndex(prev => (prev + 1) % options.length);
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(selectedIndex !== -1 ? selectedIndex : options.length - 1);
        } else {
          setFocusedIndex(prev => (prev - 1 + options.length) % options.length);
        }
        break;

      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;

      case 'End':
        event.preventDefault();
        setFocusedIndex(options.length - 1);
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen && focusedIndex !== -1) {
          handleOptionSelect(options[focusedIndex]);
        } else {
          setIsOpen(true);
        }
        break;

      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        controlRef.current?.focus();
        break;

      default:
        if (event.key.length === 1 && /^[a-zA-Z0-9]$/.test(event.key)) {
          handleCharacterKey(event.key);
          const matchIndex = findMatchingOption(searchState.query + event.key);
          if (matchIndex !== -1) {
            setFocusedIndex(matchIndex);
            if (!isOpen) setIsOpen(true);
          }
        }
    }
  }, [disabled, isOpen, options, selectedIndex, focusedIndex, handleCharacterKey, findMatchingOption, searchState.query]);

  const handleOptionSelect = useCallback((selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
    controlRef.current?.focus();
    
    // Announce selection to screen readers
    const announcement = `Selected ${selectedValue}`;
    const ariaLive = document.createElement('div');
    ariaLive.setAttribute('aria-live', 'polite');
    ariaLive.setAttribute('class', 'select__screen-reader-announcement');
    ariaLive.textContent = announcement;
    document.body.appendChild(ariaLive);
    setTimeout(() => document.body.removeChild(ariaLive), 1000);
  }, [onChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        controlRef.current &&
        dropdownRef.current &&
        !controlRef.current.contains(event.target as Node) &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectClasses = classNames(
    'select',
    {
      'select--disabled': disabled,
      'select--error': error,
      'select--high-contrast': isHighContrast,
    },
    className
  );

  return (
    <div className={selectClasses}>
      <label className="select__label" id={`${name}-label`}>
        {ariaLabel || placeholder}
      </label>
      
      <button
        ref={controlRef}
        className="select__control"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={`${name}-label`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={error}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyboardNavigation}
      >
        <span className="select__value">
          {value || placeholder}
        </span>
        <span className="select__arrow" aria-hidden="true">
          ▼
        </span>
      </button>

      {isOpen && (
        <ul
          ref={dropdownRef}
          className="select__dropdown"
          role="listbox"
          aria-labelledby={`${name}-label`}
          tabIndex={-1}
        >
          {options.map((option, index) => (
            <li
              key={option}
              id={`${name}-option-${index}`}
              className={classNames('select__option', {
                'select__option--selected': option === value,
                'select__option--focused': index === focusedIndex,
              })}
              role="option"
              aria-selected={option === value}
              onClick={() => handleOptionSelect(option)}
              onMouseEnter={() => setFocusedIndex(index)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export type { SelectProps };