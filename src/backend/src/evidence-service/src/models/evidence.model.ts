/**
 * @file Evidence model implementation with enhanced security and compliance features
 * @version 1.0.0
 * @description Implements FedRAMP and CJIS compliant evidence model with WORM storage,
 * chain of custody tracking, and integrity verification
 */

import { Schema, model, Document } from 'mongoose'; // v7.4.0
import { createHash } from 'crypto';
import { 
  IEvidence, 
  EvidenceMediaType, 
  EvidenceStatus 
} from '../interfaces/evidence.interface';

/**
 * Enhanced Mongoose schema for evidence with security and compliance features
 */
const evidenceSchema = new Schema<IEvidence & Document>({
  caseId: {
    type: String,
    required: true,
    index: true
  },
  mediaType: {
    type: String,
    enum: Object.values(EvidenceMediaType),
    required: true
  },
  filePath: {
    type: String,
    required: true,
    immutable: true // WORM compliance
  },
  fileHash: {
    type: String,
    required: true,
    immutable: true
  },
  status: {
    type: String,
    enum: Object.values(EvidenceStatus),
    required: true,
    default: EvidenceStatus.UPLOADED
  },
  metadata: {
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    duration: Number,
    dimensions: {
      width: Number,
      height: Number
    },
    encoding: { type: String, required: true },
    securityHash: { type: String, required: true },
    encryptionMetadata: {
      algorithm: { type: String, required: true },
      keyId: { type: String, required: true },
      iv: { type: String, required: true }
    }
  },
  chainOfCustody: [{
    timestamp: { type: Date, required: true },
    action: { type: String, required: true },
    userId: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
    digitalSignature: { type: String, required: true },
    complianceMetadata: {
      standard: { type: String, required: true },
      controls: [{ type: String }]
    }
  }],
  wormCompliance: {
    retentionPeriod: { type: Number, required: true },
    lockStatus: { type: Boolean, required: true, default: false },
    policyId: { type: String, required: true }
  },
  integrityVerification: {
    lastVerified: { type: Date, required: true },
    status: { type: String, required: true },
    verificationHash: { type: String, required: true }
  }
}, {
  timestamps: true,
  strict: true,
  collection: 'evidence'
});

// Indexes for performance and compliance
evidenceSchema.index({ 'metadata.securityHash': 1 });
evidenceSchema.index({ 'chainOfCustody.timestamp': 1 });
evidenceSchema.index({ 'integrityVerification.lastVerified': 1 });

/**
 * Static method to find evidence by case ID with security checks
 */
evidenceSchema.statics.findByCaseId = async function(
  caseId: string
): Promise<IEvidence[]> {
  const evidence = await this.find({ caseId }).exec();
  
  // Verify integrity of each evidence document
  for (const doc of evidence) {
    const isValid = await doc.verifyIntegrity();
    if (!isValid) {
      throw new Error(`Evidence integrity verification failed for ID: ${doc.id}`);
    }
  }
  
  return evidence;
};

/**
 * Method to update evidence status with WORM compliance
 */
evidenceSchema.methods.updateStatus = async function(
  status: EvidenceStatus
): Promise<IEvidence> {
  // Check WORM lock status
  if (this.wormCompliance.lockStatus) {
    throw new Error('Evidence is locked and cannot be modified');
  }

  // Update status
  this.status = status;

  // Add chain of custody entry
  this.chainOfCustody.push({
    timestamp: new Date(),
    action: 'STATUS_UPDATE',
    userId: this.updatedBy,
    details: { oldStatus: this.status, newStatus: status },
    digitalSignature: this.generateDigitalSignature(),
    complianceMetadata: {
      standard: 'CJIS',
      controls: ['5.4.1.1', '5.10.1.3']
    }
  });

  // Update integrity verification
  await this.updateIntegrityVerification();

  return this.save();
};

/**
 * Method to verify evidence integrity
 */
evidenceSchema.methods.verifyIntegrity = async function(): Promise<boolean> {
  const currentHash = this.calculateVerificationHash();
  const isValid = currentHash === this.integrityVerification.verificationHash;

  this.integrityVerification = {
    lastVerified: new Date(),
    status: isValid ? 'VALID' : 'INVALID',
    verificationHash: currentHash
  };

  await this.save();
  return isValid;
};

/**
 * Method to enforce WORM retention policy
 */
evidenceSchema.methods.enforceRetentionPolicy = async function(): Promise<void> {
  const retentionEndDate = new Date(
    this.createdAt.getTime() + 
    (this.wormCompliance.retentionPeriod * 24 * 60 * 60 * 1000)
  );

  if (new Date() >= retentionEndDate) {
    this.wormCompliance.lockStatus = true;
    
    this.chainOfCustody.push({
      timestamp: new Date(),
      action: 'RETENTION_LOCK',
      userId: 'SYSTEM',
      details: { retentionPeriod: this.wormCompliance.retentionPeriod },
      digitalSignature: this.generateDigitalSignature(),
      complianceMetadata: {
        standard: 'FedRAMP',
        controls: ['AC-4', 'AU-11']
      }
    });

    await this.save();
  }
};

/**
 * Private helper method to calculate verification hash
 */
evidenceSchema.methods.calculateVerificationHash = function(): string {
  const hashContent = JSON.stringify({
    caseId: this.caseId,
    filePath: this.filePath,
    fileHash: this.fileHash,
    metadata: this.metadata,
    chainOfCustody: this.chainOfCustody
  });

  return createHash('sha512').update(hashContent).digest('hex');
};

/**
 * Private helper method to generate digital signature
 */
evidenceSchema.methods.generateDigitalSignature = function(): string {
  const signatureContent = JSON.stringify({
    timestamp: new Date(),
    evidenceId: this._id,
    fileHash: this.fileHash,
    status: this.status
  });

  return createHash('sha512').update(signatureContent).digest('hex');
};

/**
 * Private helper method to update integrity verification
 */
evidenceSchema.methods.updateIntegrityVerification = async function(): Promise<void> {
  this.integrityVerification = {
    lastVerified: new Date(),
    status: 'VALID',
    verificationHash: this.calculateVerificationHash()
  };
};

// Create and export the evidence model
const EvidenceModel = model<IEvidence & Document>('Evidence', evidenceSchema);
export default EvidenceModel;