import { rest, RequestHandler } from 'msw'; // v1.2.0
import {
  LoginRequest,
  LoginResponse,
  User,
  AuthState,
  MFAMethod,
  SecurityClearanceLevel,
  UserRole
} from '../../src/types/auth.types';

import {
  Case,
  CaseCreateRequest,
  CaseResponse,
  CaseListResponse,
  CaseStatus,
  AuditEntry
} from '../../src/types/case.types';

import {
  Evidence,
  EvidenceMediaType,
  EvidenceStatus,
  SecurityClassification,
  ChainOfCustodyEntry,
  RetentionPolicy,
  AccessLog
} from '../../src/types/evidence.types';

// Mock storage for security state
const mockMfaChallenges = new Map<string, string>();
const mockSessions = new Map<string, AuthState>();
const mockAuditLog: AuditEntry[] = [];
const mockCustodyChains = new Map<string, ChainOfCustodyEntry[]>();

// Authentication Handlers
export const authHandlers: RequestHandler[] = [
  // Login handler with MFA validation
  rest.post('/api/v1/auth/login', async (req, res, ctx) => {
    const { username, password, mfaCode } = await req.json<LoginRequest>();

    // Validate security headers
    const securityHeaders = req.headers.get('x-security-context');
    if (!securityHeaders) {
      return res(
        ctx.status(401),
        ctx.json({
          error: 'Missing security context headers',
          code: 'SEC_HEADERS_MISSING'
        })
      );
    }

    // Generate MFA challenge if not provided
    if (!mfaCode) {
      const challengeId = crypto.randomUUID();
      mockMfaChallenges.set(username, challengeId);
      
      return res(
        ctx.status(200),
        ctx.json({
          mfaRequired: true,
          challengeId,
          mfaMethod: MFAMethod.AUTHENTICATOR
        })
      );
    }

    // Mock successful authentication
    const mockUser: User = {
      id: crypto.randomUUID(),
      username,
      email: `${username}@agency.gov`,
      roles: [UserRole.INVESTIGATOR],
      securityClearance: SecurityClearanceLevel.SECRET,
      mfaEnabled: true,
      lastLogin: new Date(),
      sessionTimeout: 3600,
      department: 'Investigation Unit',
      lastPasswordChange: new Date(),
      accessLevel: 'FULL',
      mfaPreference: MFAMethod.AUTHENTICATOR
    };

    const response: LoginResponse = {
      accessToken: 'mock-jwt-token',
      refreshToken: 'mock-refresh-token',
      user: mockUser,
      mfaRequired: false,
      expiresIn: 3600,
      tokenType: 'Bearer',
      sessionId: crypto.randomUUID(),
      permissions: ['CASE_READ', 'CASE_WRITE', 'EVIDENCE_UPLOAD']
    };

    return res(
      ctx.status(200),
      ctx.set('x-session-id', response.sessionId),
      ctx.json(response)
    );
  })
];

// Case Management Handlers
export const caseHandlers: RequestHandler[] = [
  // Get cases with security classification
  rest.get('/api/v1/cases', (req, res, ctx) => {
    const securityLevel = req.headers.get('x-security-clearance');
    
    const mockCases: Case[] = [
      {
        id: crypto.randomUUID(),
        title: 'Mock Investigation',
        description: 'Test case for mock data',
        status: CaseStatus.ACTIVE,
        metadata: {
          classification: SecurityClassification.SECRET,
          priority: 1,
          tags: ['test', 'mock'],
          customFields: {}
        },
        assignedUsers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'test-user',
        lastModifiedBy: 'test-user'
      }
    ];

    const response: CaseListResponse = {
      cases: mockCases,
      total: 1,
      page: 0,
      limit: 10,
      hasMore: false
    };

    return res(
      ctx.status(200),
      ctx.set('x-total-count', '1'),
      ctx.json(response)
    );
  }),

  // Create case with audit logging
  rest.post('/api/v1/cases', async (req, res, ctx) => {
    const caseData = await req.json<CaseCreateRequest>();
    
    const newCase: Case = {
      id: crypto.randomUUID(),
      ...caseData,
      status: CaseStatus.ACTIVE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'test-user',
      lastModifiedBy: 'test-user'
    };

    // Create audit entry
    const auditEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'CASE_CREATED',
      userId: 'test-user',
      details: { caseId: newCase.id }
    };

    mockAuditLog.push(auditEntry);

    return res(
      ctx.status(201),
      ctx.json({
        case: newCase,
        auditLog: [auditEntry]
      })
    );
  })
];

// Evidence Handlers
export const evidenceHandlers: RequestHandler[] = [
  // Upload evidence with chain of custody
  rest.post('/api/v1/evidence/upload', async (req, res, ctx) => {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const caseId = formData.get('caseId') as string;

    // Create custody chain entry
    const custodyEntry: ChainOfCustodyEntry = {
      timestamp: new Date(),
      fromUserId: 'system',
      toUserId: 'test-user',
      reason: 'Initial upload',
      signature: 'mock-digital-signature',
      location: {
        latitude: 0,
        longitude: 0,
        accuracy: 0
      }
    };

    // Create retention policy
    const retentionPolicy: RetentionPolicy = {
      retentionPeriod: 365,
      retentionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      retentionJustification: 'Standard evidence retention',
      dispositionInstructions: 'Secure deletion required'
    };

    const evidence: Evidence = {
      id: crypto.randomUUID(),
      caseId,
      mediaType: EvidenceMediaType.IMAGE,
      filePath: `evidence/${caseId}/${file.name}`,
      fileHash: 'mock-sha256-hash',
      status: EvidenceStatus.UPLOADED,
      metadata: {
        originalFilename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        customMetadata: {}
      },
      classificationLevel: SecurityClassification.CONFIDENTIAL,
      securityControls: [],
      retentionPolicy,
      accessHistory: [],
      chainOfCustody: [custodyEntry],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      lastAccessedBy: 'test-user',
      lastAccessedAt: new Date()
    };

    mockCustodyChains.set(evidence.id, [custodyEntry]);

    return res(
      ctx.status(201),
      ctx.json({
        success: true,
        data: evidence,
        timestamp: new Date(),
        requestId: crypto.randomUUID()
      })
    );
  })
];

export default [...authHandlers, ...caseHandlers, ...evidenceHandlers];