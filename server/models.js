// Enum names and scoring order from Models/CitrineModels.cs.
export const riskLevels = ['Low', 'Medium', 'High', 'Critical'];
export const reportStatuses = ['Draft', 'PendingReview', 'Verified', 'Rejected', 'Duplicate'];
export const confidenceLevels = [
  'I personally received this',
  'Reported by someone else',
  'Unsure',
];
export const categories = ['Unknown', 'SMS', 'Phone call', 'Email', 'Website', 'Social media', 'Payment request', 'Impersonation'];
export const roles = ['member', 'moderator', 'admin'];
export const accountStatuses = ['active', 'suspended'];
export const isStaff = user => user?.role === 'moderator' || user?.role === 'admin';

/** @typedef {{name: string, detail: string, weight: number}} ScamSignal */
/** @typedef {{riskLevel: string, riskScore: number, category: string, contentHash: string, fingerprintKey: string, signals: ScamSignal[], seniorProtectionRecommended: boolean}} ScamAnalysisResult */
/** @typedef {{id: string, shortId: string, isDemo: boolean, sourceExampleId: string|null, submittedAt: string, contentPreview: string, containsPersonalInfo: boolean, confidenceLevel: string, contentHash: string, fingerprintKey: string, category: string, riskLevel: string, riskScore: number, status: string, seniorProtectionEnabled: boolean, pointsAwarded: number, signals: ScamSignal[], duplicateOf: string|null}} ScamReport */
/** @typedef {{key: string, category: string, highestRiskLevel: string, seenCount: number, lastSeenAt: string, traits: string[]}} ScamFingerprint */
/** @typedef {{createdAt: string, reportId: string, reason: string, points: number}} PointsLedgerEntry */
