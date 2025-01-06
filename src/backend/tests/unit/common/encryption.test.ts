import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals'; // v29.0.0
import AWSMock from 'aws-sdk-mock'; // v5.8.0
import { randomBytes } from 'crypto'; // built-in
import { 
  encrypt, 
  decrypt, 
  generateHash, 
  verifyHash 
} from '../../src/common/utils/encryption.util';

// Test constants
const TEST_KEY_ID = 'test-key-id';
const TEST_DATA = 'sensitive-test-data';
const TEST_CONTEXT = { purpose: 'unit-test', environment: 'test' };
const TEST_KEY_VERSION = '1';
const TEST_TIMEOUT = 5000;

describe('Encryption Utility', () => {
  beforeAll(() => {
    // Configure AWS KMS mocks
    AWSMock.setSDKInstance(require('aws-sdk'));
    
    // Mock KMS generateDataKey
    AWSMock.mock('KMS', 'generateDataKey', (params: any, callback: Function) => {
      callback(null, {
        Plaintext: randomBytes(32),
        CiphertextBlob: randomBytes(32),
        KeyId: `arn:aws:kms:us-east-1:123456789012:key/${TEST_KEY_ID}/${TEST_KEY_VERSION}`
      });
    });

    // Mock KMS decrypt
    AWSMock.mock('KMS', 'decrypt', (params: any, callback: Function) => {
      callback(null, {
        Plaintext: randomBytes(32),
        KeyId: `arn:aws:kms:us-east-1:123456789012:key/${TEST_KEY_ID}/${TEST_KEY_VERSION}`
      });
    });
  });

  afterAll(() => {
    AWSMock.restore('KMS');
  });

  describe('Encryption Operations', () => {
    test('should encrypt data with AES-256-GCM successfully', async () => {
      const result = await encrypt(TEST_DATA, TEST_KEY_ID, TEST_CONTEXT);
      
      expect(result).toHaveProperty('encryptedData');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('tag');
      expect(result).toHaveProperty('keyVersion');
      expect(result.iv.length).toBe(12); // GCM IV length
      expect(result.tag.length).toBe(16); // Auth tag length
    }, TEST_TIMEOUT);

    test('should generate unique IVs for each encryption', async () => {
      const result1 = await encrypt(TEST_DATA, TEST_KEY_ID);
      const result2 = await encrypt(TEST_DATA, TEST_KEY_ID);
      
      expect(Buffer.compare(result1.iv, result2.iv)).not.toBe(0);
    });

    test('should fail encryption with invalid parameters', async () => {
      await expect(encrypt('', TEST_KEY_ID)).rejects.toThrow('Invalid encryption parameters');
      await expect(encrypt(TEST_DATA, '')).rejects.toThrow('Invalid encryption parameters');
    });

    test('should decrypt encrypted data correctly', async () => {
      const encrypted = await encrypt(TEST_DATA, TEST_KEY_ID, TEST_CONTEXT);
      const decrypted = await decrypt(
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag,
        TEST_KEY_ID,
        encrypted.keyVersion,
        TEST_CONTEXT
      );
      
      expect(decrypted.toString()).toBe(TEST_DATA);
    }, TEST_TIMEOUT);

    test('should fail decryption with tampered auth tag', async () => {
      const encrypted = await encrypt(TEST_DATA, TEST_KEY_ID);
      const tamperedTag = Buffer.alloc(16, 0);
      
      await expect(decrypt(
        encrypted.encryptedData,
        encrypted.iv,
        tamperedTag,
        TEST_KEY_ID,
        encrypted.keyVersion
      )).rejects.toThrow();
    });
  });

  describe('Hash Operations', () => {
    test('should generate secure hash with salt', async () => {
      const result = await generateHash(TEST_DATA);
      
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('salt');
      expect(result).toHaveProperty('iterations');
      expect(result.salt.length).toBe(32);
      expect(result.iterations).toBe(310000); // OWASP recommended
    });

    test('should verify hash correctly', async () => {
      const { hash, salt, iterations } = await generateHash(TEST_DATA);
      const isValid = await verifyHash(TEST_DATA, hash, salt, iterations);
      
      expect(isValid).toBe(true);
    });

    test('should fail verification with incorrect data', async () => {
      const { hash, salt, iterations } = await generateHash(TEST_DATA);
      const isValid = await verifyHash('wrong-data', hash, salt, iterations);
      
      expect(isValid).toBe(false);
    });

    test('should support custom hash options', async () => {
      const customOptions = {
        iterations: 400000,
        keyLength: 64,
        algorithm: 'sha512'
      };
      
      const result = await generateHash(TEST_DATA, customOptions);
      expect(result.iterations).toBe(customOptions.iterations);
    });
  });

  describe('Security Compliance', () => {
    test('should use FIPS 140-2 compliant algorithms', async () => {
      const spy = jest.spyOn(crypto, 'createCipheriv');
      await encrypt(TEST_DATA, TEST_KEY_ID);
      
      expect(spy).toHaveBeenCalledWith('aes-256-gcm', expect.any(Buffer), expect.any(Buffer), 
        expect.objectContaining({ authTagLength: 16 }));
      
      spy.mockRestore();
    });

    test('should handle encryption context correctly', async () => {
      const encrypted = await encrypt(TEST_DATA, TEST_KEY_ID, TEST_CONTEXT);
      const decrypted = await decrypt(
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag,
        TEST_KEY_ID,
        encrypted.keyVersion,
        TEST_CONTEXT
      );
      
      expect(decrypted.toString()).toBe(TEST_DATA);
      
      // Should fail with incorrect context
      await expect(decrypt(
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.tag,
        TEST_KEY_ID,
        encrypted.keyVersion,
        { ...TEST_CONTEXT, purpose: 'wrong' }
      )).rejects.toThrow();
    });

    test('should track key versions', async () => {
      const encrypted = await encrypt(TEST_DATA, TEST_KEY_ID);
      expect(encrypted.keyVersion).toBe(TEST_KEY_VERSION);
    });

    test('should use constant-time comparison for hash verification', async () => {
      const spy = jest.spyOn(crypto, 'timingSafeEqual');
      const { hash, salt, iterations } = await generateHash(TEST_DATA);
      await verifyHash(TEST_DATA, hash, salt, iterations);
      
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('should handle KMS service errors gracefully', async () => {
      AWSMock.remock('KMS', 'generateDataKey', (params: any, callback: Function) => {
        callback(new Error('KMS service error'));
      });
      
      await expect(encrypt(TEST_DATA, TEST_KEY_ID))
        .rejects.toThrow('Encryption failed: KMS service error');
    });

    test('should validate IV length', async () => {
      const encrypted = await encrypt(TEST_DATA, TEST_KEY_ID);
      const invalidIv = Buffer.alloc(8); // Wrong length
      
      await expect(decrypt(
        encrypted.encryptedData,
        invalidIv,
        encrypted.tag,
        TEST_KEY_ID,
        encrypted.keyVersion
      )).rejects.toThrow('Invalid IV length');
    });

    test('should handle hash generation errors', async () => {
      const invalidOptions = { algorithm: 'invalid-algo' as any };
      await expect(generateHash(TEST_DATA, invalidOptions))
        .rejects.toThrow();
    });
  });
});