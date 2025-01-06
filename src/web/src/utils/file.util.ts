/**
 * File utility functions for CrimeMiner web application.
 * Implements FedRAMP High and CJIS compliance requirements for secure file handling.
 * @version 1.0.0
 */

import { EvidenceMediaType, EvidenceMetadata } from '../types/evidence.types';
import CryptoJS from 'crypto-js'; // v4.1.1

/**
 * Allowed MIME types per media category with security restrictions
 */
const ALLOWED_MIME_TYPES: Record<EvidenceMediaType, string[]> = {
  [EvidenceMediaType.AUDIO]: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  [EvidenceMediaType.VIDEO]: ['video/mp4', 'video/webm', 'video/ogg'],
  [EvidenceMediaType.IMAGE]: ['image/jpeg', 'image/png', 'image/tiff'],
  [EvidenceMediaType.TEXT]: ['text/plain', 'application/pdf', 'application/msword']
};

/**
 * Maximum file size (2GB) per FedRAMP requirements
 */
const MAX_FILE_SIZE = 2147483648;

/**
 * Chunk size for file processing (2MB)
 */
const CHUNK_SIZE = 2097152;

/**
 * Security classification levels
 */
const SECURITY_CLASSIFICATIONS = ['UNCLASSIFIED', 'SENSITIVE', 'CONFIDENTIAL', 'SECRET'];

/**
 * Calculates SHA-256 hash of file with chunk processing and progress tracking
 * Implements FedRAMP requirements for file integrity verification
 * 
 * @param file - File to calculate hash for
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to file hash
 */
export const calculateFileHash = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const chunks: number = Math.ceil(file.size / CHUNK_SIZE);
    let currentChunk = 0;
    let hashObj = CryptoJS.algo.SHA256.create();

    reader.onerror = () => reject(new Error('File read error during hash calculation'));

    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        if (e.target?.result instanceof ArrayBuffer) {
          const wordArray = CryptoJS.lib.WordArray.create(e.target.result);
          hashObj.update(wordArray);
        }

        currentChunk++;
        if (onProgress) {
          onProgress((currentChunk / chunks) * 100);
        }

        if (currentChunk < chunks) {
          loadNextChunk();
        } else {
          const hash = hashObj.finalize().toString();
          resolve(hash);
        }
      } catch (error) {
        reject(new Error(`Hash calculation error: ${error.message}`));
      }
    };

    const loadNextChunk = () => {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      reader.readAsArrayBuffer(file.slice(start, end));
    };

    loadNextChunk();
  });
};

/**
 * Extracts comprehensive file metadata with security and compliance fields
 * Implements CJIS requirements for evidence metadata tracking
 * 
 * @param file - File to extract metadata from
 * @returns Promise resolving to evidence metadata
 */
export const extractFileMetadata = async (file: File): Promise<EvidenceMetadata> => {
  return new Promise((resolve, reject) => {
    try {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('File exceeds maximum allowed size');
      }

      const metadata: EvidenceMetadata = {
        fileSize: file.size,
        mimeType: file.type,
        encoding: 'utf-8',
        securityClassification: 'UNCLASSIFIED',
        integrityHash: '',
        dimensions: { width: 0, height: 0 },
        duration: 0,
        wormMetadata: {
          retentionPeriod: 2555, // 7 years default retention
          immutableUntil: new Date(Date.now() + 220752000000) // 7 years from now
        }
      };

      // Extract media-specific metadata
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          metadata.dimensions = {
            width: img.width,
            height: img.height
          };
          resolve(metadata);
        };
        img.onerror = () => reject(new Error('Failed to extract image dimensions'));
        img.src = URL.createObjectURL(file);
      } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        const media = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('audio');
        media.onloadedmetadata = () => {
          metadata.duration = media.duration;
          if (file.type.startsWith('video/')) {
            metadata.dimensions = {
              width: (media as HTMLVideoElement).videoWidth,
              height: (media as HTMLVideoElement).videoHeight
            };
          }
          resolve(metadata);
        };
        media.onerror = () => reject(new Error('Failed to extract media metadata'));
        media.src = URL.createObjectURL(file);
      } else {
        resolve(metadata);
      }
    } catch (error) {
      reject(new Error(`Metadata extraction error: ${error.message}`));
    }
  });
};

/**
 * Validates file type with enhanced security checks
 * Implements FedRAMP and CJIS requirements for file validation
 * 
 * @param file - File to validate
 * @param mediaType - Expected media type
 * @returns Promise resolving to validation result
 */
export const validateFileType = async (
  file: File,
  mediaType: EvidenceMediaType
): Promise<boolean> => {
  try {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('File exceeds maximum allowed size');
    }

    // Validate MIME type
    const allowedTypes = ALLOWED_MIME_TYPES[mediaType];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Invalid file type');
    }

    // Read file header for deep format validation
    const header = await readFileHeader(file);
    if (!validateFileHeader(header, file.type)) {
      throw new Error('Invalid file format');
    }

    return true;
  } catch (error) {
    console.error('File validation error:', error);
    return false;
  }
};

/**
 * Reads first 32 bytes of file for format validation
 * @private
 */
const readFileHeader = async (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file header'));
    reader.readAsArrayBuffer(file.slice(0, 32));
  });
};

/**
 * Validates file header against known format signatures
 * @private
 */
const validateFileHeader = (header: ArrayBuffer, mimeType: string): boolean => {
  const view = new Uint8Array(header);
  
  // Common file signatures
  const signatures: Record<string, number[]> = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'audio/mpeg': [0x49, 0x44, 0x33],
    'video/mp4': [0x66, 0x74, 0x79, 0x70],
    'application/pdf': [0x25, 0x50, 0x44, 0x46]
  };

  const signature = signatures[mimeType];
  if (!signature) return true; // Skip validation if signature unknown

  return signature.every((byte, index) => view[index] === byte);
};