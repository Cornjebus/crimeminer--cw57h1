/**
 * Date utility functions for CrimeMiner web application.
 * Implements CJIS-compliant date handling with strict validation and security measures.
 * @version 1.0.0
 */

import { format, parseISO } from 'date-fns'; // v2.30.0
import { BaseEntity } from '../types/common.types';

// Constants for date validation and formatting
const MAX_FUTURE_YEARS = 1;
const MIN_PAST_YEARS = 100;
const CJIS_TIMESTAMP_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
const ALLOWED_DATE_FORMATS = [
  'yyyy-MM-dd',
  'MM/dd/yyyy',
  'dd-MM-yyyy',
  "yyyy-MM-dd'T'HH:mm:ss",
  CJIS_TIMESTAMP_FORMAT
];

/**
 * Validates if a given date is within acceptable bounds and properly formatted
 * @param date - Date to validate
 * @returns boolean indicating if date is valid
 */
export const isValidDate = (date: Date | string): boolean => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!dateObj || isNaN(dateObj.getTime())) {
      return false;
    }

    const now = new Date();
    const minDate = new Date(now.getFullYear() - MIN_PAST_YEARS, 0, 1);
    const maxDate = new Date(now.getFullYear() + MAX_FUTURE_YEARS, 11, 31);

    return dateObj >= minDate && dateObj <= maxDate;
  } catch (error) {
    return false;
  }
};

/**
 * Formats a date into a standardized string representation with validation
 * @param date - Date to format
 * @param formatString - Format pattern to apply
 * @throws Error if date or format is invalid
 * @returns Formatted date string
 */
export const formatDate = (
  date: Date | string | number,
  formatString: string
): string => {
  try {
    if (!ALLOWED_DATE_FORMATS.includes(formatString)) {
      throw new Error('Invalid date format specified');
    }

    const dateObj = typeof date === 'string' ? parseISO(date) : new Date(date);
    if (!isValidDate(dateObj)) {
      throw new Error('Invalid date provided');
    }

    return format(dateObj, formatString);
  } catch (error) {
    throw new Error(`Date formatting error: ${error.message}`);
  }
};

/**
 * Securely parses a date string into a Date object
 * @param dateString - ISO date string to parse
 * @throws Error if date string is invalid
 * @returns Parsed and validated Date object
 */
export const parseDate = (dateString: string): Date => {
  try {
    const parsedDate = parseISO(dateString);
    if (!isValidDate(parsedDate)) {
      throw new Error('Invalid date string provided');
    }
    return parsedDate;
  } catch (error) {
    throw new Error(`Date parsing error: ${error.message}`);
  }
};

/**
 * Formats a timestamp for evidence and audit logs with CJIS compliance
 * @param timestamp - Timestamp to format
 * @throws Error if timestamp is invalid
 * @returns CJIS-compliant formatted timestamp string
 */
export const formatTimestamp = (timestamp: Date | string | number): string => {
  try {
    const dateObj = typeof timestamp === 'string' ? parseISO(timestamp) : new Date(timestamp);
    if (!isValidDate(dateObj)) {
      throw new Error('Invalid timestamp provided');
    }

    return format(dateObj, CJIS_TIMESTAMP_FORMAT);
  } catch (error) {
    throw new Error(`Timestamp formatting error: ${error.message}`);
  }
};

/**
 * Calculates a validated date range for evidence timelines
 * @param startDate - Range start date
 * @param days - Number of days to include
 * @throws Error if parameters are invalid
 * @returns Object containing start and end dates
 */
export const getTimeRange = (
  startDate: Date,
  days: number
): { start: Date; end: Date } => {
  try {
    if (!isValidDate(startDate)) {
      throw new Error('Invalid start date provided');
    }

    if (!Number.isInteger(days) || days <= 0 || days > 365) {
      throw new Error('Invalid days parameter: must be between 1 and 365');
    }

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + days);

    if (!isValidDate(endDate)) {
      throw new Error('Calculated end date is invalid');
    }

    return {
      start: startDate,
      end: endDate
    };
  } catch (error) {
    throw new Error(`Time range calculation error: ${error.message}`);
  }
};

/**
 * Helper function to format BaseEntity dates consistently
 * @param entity - Entity containing date fields
 * @returns Object with formatted date strings
 */
export const formatEntityDates = (entity: BaseEntity): {
  createdAt: string;
  updatedAt: string;
} => {
  return {
    createdAt: formatTimestamp(entity.createdAt),
    updatedAt: formatTimestamp(entity.updatedAt)
  };
};