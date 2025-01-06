/**
 * FIPS 140-2 compliant encryption utility for CrimeMiner platform
 * Implements secure cryptographic operations with AWS KMS integration
 * @module encryption.util
 * @version 1.0.0
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2 as pbkdf2Callback, timingSafeEqual } from 'crypto'; // native
import { KMS } from 'aws-sdk'; // v2.1450.0

// Constants for encryption configuration
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 310000; // OWASP recommended minimum
const HASH_ALGORITHM = 'sha512';

// Initialize AWS KMS client
const kms = new KMS({
  apiVersion: '2014-11-01',
  maxRetries: 3,
  retryDelayOptions: { base: 100 }
});

// Type definitions
interface EncryptionContext {
  [key: string]: string;
}

interface HashOptions {
  iterations?: number;
  keyLength?: number;
  algorithm?: string;
}

interface EncryptedData {
  encryptedData: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: string;
}

/**
 * Encrypts data using AES-256-GCM with AWS KMS managed keys
 * @param data - Data to encrypt (Buffer or string)
 * @param keyId - AWS KMS key ID
 * @param context - Optional encryption context for AWS KMS
 * @returns Encrypted data bundle with IV, auth tag and key version
 */
export async function encrypt(
  data: Buffer | string,
  keyId: string,
  context?: EncryptionContext
): Promise<EncryptedData> {
  try {
    // Input validation
    if (!data || !keyId) {
      throw new Error('Invalid encryption parameters');
    }

    // Generate cryptographically secure random IV
    const iv = randomBytes(IV_LENGTH);

    // Get encryption key from KMS
    const { Plaintext: dataKey, KeyId: keyArn } = await kms.generateDataKey({
      KeyId: keyId,
      NumberOfBytes: KEY_LENGTH,
      EncryptionContext: context
    }).promise();

    if (!dataKey) {
      throw new Error('Failed to generate data key');
    }

    // Create cipher with AES-256-GCM
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, dataKey, iv, {
      authTagLength: AUTH_TAG_LENGTH
    });

    // Encrypt data
    const inputData = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const encryptedData = Buffer.concat([
      cipher.update(inputData),
      cipher.final()
    ]);

    // Get authentication tag
    const tag = cipher.getAuthTag();

    // Extract key version from ARN
    const keyVersion = keyArn?.split('/').pop() || '';

    // Clear sensitive data from memory
    dataKey.fill(0);

    return {
      encryptedData,
      iv,
      tag,
      keyVersion
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypts data using AES-256-GCM with AWS KMS managed keys
 * @param encryptedData - Encrypted data buffer
 * @param iv - Initialization vector
 * @param tag - Authentication tag
 * @param keyId - AWS KMS key ID
 * @param keyVersion - Key version used for encryption
 * @param context - Optional encryption context for AWS KMS
 * @returns Decrypted data buffer
 */
export async function decrypt(
  encryptedData: Buffer,
  iv: Buffer,
  tag: Buffer,
  keyId: string,
  keyVersion: string,
  context?: EncryptionContext
): Promise<Buffer> {
  try {
    // Input validation
    if (!encryptedData || !iv || !tag || !keyId) {
      throw new Error('Invalid decryption parameters');
    }

    // Verify IV length
    if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }

    // Get decryption key from KMS
    const { Plaintext: dataKey } = await kms.decrypt({
      KeyId: keyId,
      CiphertextBlob: encryptedData,
      EncryptionContext: context
    }).promise();

    if (!dataKey) {
      throw new Error('Failed to retrieve data key');
    }

    // Create decipher
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, dataKey, iv, {
      authTagLength: AUTH_TAG_LENGTH
    });

    // Set auth tag for verification
    decipher.setAuthTag(tag);

    // Decrypt data
    const decryptedData = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);

    // Clear sensitive data from memory
    dataKey.fill(0);

    return decryptedData;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Generates cryptographic hash using PBKDF2
 * @param data - Data to hash
 * @param options - Optional hash configuration
 * @returns Hash bundle with salt and parameters
 */
export async function generateHash(
  data: string,
  options?: HashOptions
): Promise<{ hash: Buffer; salt: Buffer; iterations: number }> {
  return new Promise((resolve, reject) => {
    try {
      // Generate random salt
      const salt = randomBytes(SALT_LENGTH);
      
      // Apply hash options or defaults
      const iterations = options?.iterations || PBKDF2_ITERATIONS;
      const keyLength = options?.keyLength || KEY_LENGTH;
      const algorithm = options?.algorithm || HASH_ALGORITHM;

      // Generate hash using PBKDF2
      pbkdf2Callback(
        data,
        salt,
        iterations,
        keyLength,
        algorithm,
        (err, hash) => {
          if (err) reject(err);
          resolve({ hash, salt, iterations });
        }
      );
    } catch (error) {
      reject(new Error(`Hash generation failed: ${error.message}`));
    }
  });
}

/**
 * Verifies data against stored hash using constant-time comparison
 * @param data - Data to verify
 * @param storedHash - Previously generated hash
 * @param salt - Salt used in hash generation
 * @param iterations - Number of iterations used
 * @returns Boolean indicating verification result
 */
export async function verifyHash(
  data: string,
  storedHash: Buffer,
  salt: Buffer,
  iterations: number
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // Generate hash with same parameters
      pbkdf2Callback(
        data,
        salt,
        iterations,
        storedHash.length,
        HASH_ALGORITHM,
        (err, hash) => {
          if (err) reject(err);
          
          // Constant-time comparison
          const isValid = timingSafeEqual(hash, storedHash);
          resolve(isValid);
        }
      );
    } catch (error) {
      reject(new Error(`Hash verification failed: ${error.message}`));
    }
  });
}