import { randomUUID } from 'node:crypto';
import { isStaff, riskLevels } from '../models.js';
import { analyze, redact, buildTraits, buildSeniorProtectionNote } from './scamAnalysis.js';
import { requireValue } from './errors.js';
import { audit, requireReason } from './moderation.js';
import { exampleDatasetId } from './examples.js';

function calculatePoints(analysis, confidenceLevel) {
  let points = { Low: 8, Medium: 15, High: 25, Critical: 35 }[analysis.riskLevel];
  if (analysis.seniorProtectionRecommended) points += 10;
  if (confidenceLevel.toLowerCase().includes('unsure')) points = Math.max(5, Math.floor(points / 2));
  return points;
}

function pointsReason(analysis, confidenceLevel) {
  const reason = `${analysis.riskLevel} ${analysis.category.toLowerCase()} report`;
  return confidenceLevel.toLowerCase().includes('unsure') ? `${reason}, reduced for low confidence` : reason;
}

export function createWorkspace({ db, statements: sql }) {
  const signalsFor = analysisId => sql.listSignals.all(analysisId);
  function reportFromRow(row, user) {
    if (!row) return null;
    return {
      id: row.id, shortId: row.id.replaceAll('-', '').slice(0, 8), ownerId: row.owner_id,
      submittedBy: row.submitted_by ?? '', submittedAt: row.submitted_at,
      isDemo: Boolean(row.source_example_id), sourceExampleId: row.source_example_id,
      contentPreview: row.content_preview, containsPersonalInfo: Boolean(row.contains_personal_info),
      confidenceLevel: row.confidence_level, contentHash: row.content_hash,
      fingerprintKey: row.fingerprint_key, category: row.category,
      riskLevel: row.risk_level, riskScore: row.risk_score, status: row.status,
      seniorProtectionEnabled: Boolean(row.senior_protection_enabled), pointsAwarded: row.points_awarded,
      duplicateOf: row.duplicate_of && user && !isStaff(user)
        && sql.getReport.get(row.duplicate_of)?.owner_id !== user.id ? null : row.duplicate_of,
      signals: signalsFor(row.analysis_id),
    };
  }

  function authorizedRow(id, user) {
    const row = sql.getReport.get(id);
    requireValue(row && (row.owner_id === user.id || isStaff(user)), 404, 'NOT_FOUND', 'Report not found.');
    return row;
  }

  function upsertFingerprint(analysis, submittedAt) {
    const existing = sql.getFingerprint.get(analysis.fingerprintKey);
    if (!existing) {
      sql.insertFingerprint.run({
        key: analysis.fingerprintKey, category: analysis.category, highestRiskLevel: analysis.riskLevel,
        seenCount: 1, lastSeenAt: submittedAt, traits: JSON.stringify(buildTraits(analysis)),
      });
    } else {
      sql.updateFingerprint.run({
        key: analysis.fingerprintKey, lastSeenAt: submittedAt,
        highestRiskLevel: riskLevels[Math.max(riskLevels.indexOf(existing.highest_risk_level), riskLevels.indexOf(analysis.riskLevel))],
      });
    }
  }

  const addReport = db.transaction((user, { content, category, confidenceLevel, containsPersonalInfo }) => {
    const analysis = analyze(content, category);
    requireValue(!sql.findExampleByHash.get(analysis.contentHash), 400, 'REFERENCE_EXAMPLE',
      'This message is in the reference example library. It cannot be submitted for points.');
    const duplicate = sql.findDuplicate.get(analysis.contentHash);
    const points = duplicate ? 0 : calculatePoints(analysis, confidenceLevel);
    const id = randomUUID();
    const analysisId = randomUUID();
    const submittedAt = new Date().toISOString();
    sql.insertAnalysis.run({ ...analysis, id: analysisId, seniorProtectionRecommended: Number(analysis.seniorProtectionRecommended) });
    analysis.signals.forEach((signal, position) => sql.insertSignal.run({ ...signal, analysisId, position }));
    // A duplicate can use a different manual category, and still needs its FK target.
    if (!duplicate || !sql.getFingerprint.get(analysis.fingerprintKey)) upsertFingerprint(analysis, submittedAt);
    sql.insertReport.run({
      id, ownerId: user.id, sourceExampleId: null, basePoints: points, analysisId, submittedAt,
      contentPreview: redact(content), containsPersonalInfo: Number(containsPersonalInfo), confidenceLevel,
      contentHash: analysis.contentHash, fingerprintKey: analysis.fingerprintKey, category: analysis.category,
      riskLevel: analysis.riskLevel, riskScore: analysis.riskScore,
      status: duplicate ? 'Duplicate' : 'PendingReview',
      seniorProtectionEnabled: Number(analysis.seniorProtectionRecommended),
      pointsAwarded: points, duplicateOf: duplicate?.id ?? null,
    });
    sql.insertPointsEntry.run({
      createdAt: submittedAt, reportId: id,
      reason: duplicate ? 'Duplicate report linked' : pointsReason(analysis, confidenceLevel), points,
    });
    sql.recalculateFingerprint.run({ key: analysis.fingerprintKey });
    return reportFromRow(sql.getReport.get(id), user);
  });

  // Explicit local setup only. Reference copies never enter scoring or moderation.
  const addDemoReports = db.transaction((user, count) => {
    requireValue(user?.status === 'active', 400, 'INVALID_USER', 'Choose an existing active account.');
    requireValue(Number.isInteger(count) && count >= 1 && count <= 25, 400, 'INVALID_COUNT', 'Choose 1 to 25 examples.');
    const examples = sql.listExamples.all({ datasetId: exampleDatasetId, label: 'spam', search: '', limit: count, offset: 0 });
    requireValue(examples.length > 0, 400, 'NO_EXAMPLES', 'Import the SMS example dataset first.');
    let created = 0;
    for (const example of examples) {
      if (sql.findDemoReport.get({ userId: user.id, exampleId: example.id })) continue;
      const analysis = analyze(example.content, 'SMS');
      const analysisId = randomUUID();
      const submittedAt = new Date().toISOString();
      const contentPreview = redact(example.content);
      sql.insertAnalysis.run({ ...analysis, id: analysisId, seniorProtectionRecommended: Number(analysis.seniorProtectionRecommended) });
      analysis.signals.forEach((signal, position) => sql.insertSignal.run({ ...signal, analysisId, position }));
      // The report FK needs a fingerprint, but an example must not alter real sightings.
      if (!sql.getFingerprint.get(analysis.fingerprintKey)) sql.insertFingerprint.run({
        key: analysis.fingerprintKey, category: analysis.category, highestRiskLevel: analysis.riskLevel,
        seenCount: 0, lastSeenAt: submittedAt, traits: JSON.stringify(buildTraits(analysis)),
      });
      sql.insertReport.run({
        id: randomUUID(), ownerId: user.id, sourceExampleId: example.id, basePoints: 0, analysisId, submittedAt,
        contentPreview, containsPersonalInfo: Number(contentPreview !== example.content), confidenceLevel: 'Unsure',
        contentHash: analysis.contentHash, fingerprintKey: analysis.fingerprintKey, category: analysis.category,
        riskLevel: analysis.riskLevel, riskScore: analysis.riskScore, status: 'Draft',
        seniorProtectionEnabled: Number(analysis.seniorProtectionRecommended), pointsAwarded: 0, duplicateOf: null,
      });
      created++;
    }
    return { created, skipped: examples.length - created };
  });

  const updateStatus = db.transaction((user, id, input) => {
    const row = authorizedRow(id, user);
    requireValue(!row.source_example_id, 409, 'DEMO_REPORT', 'Demo reports are reference copies and cannot be submitted or reviewed.');
    const withdrawal = input.status === 'Draft';
    if (withdrawal) {
      requireValue(row.owner_id === user.id, 403, 'FORBIDDEN', 'Only the author can withdraw this report.');
    } else {
      requireValue(isStaff(user), 403, 'FORBIDDEN', 'Moderator access is required.');
      requireValue(row.owner_id !== user.id, 403, 'SELF_REVIEW', 'Another moderator must review your report.');
      requireValue(['Verified', 'Rejected', 'PendingReview'].includes(input.status), 400, 'INVALID_STATUS', 'Select a valid review decision.');
      requireValue(input.status === 'Rejected' || row.base_points > 0, 409, 'DUPLICATE_REPORT', 'Exact duplicates cannot be verified or reopened for points.');
    }
    requireValue(row.status === input.expectedStatus, 409, 'STALE_REPORT', 'This report changed. Refresh before reviewing it.');
    const reason = withdrawal ? 'Report withdrawn by its author.' : requireReason(input.reason);
    if (row.status === input.status) return reportFromRow(row, user);
    const points = ['Draft', 'Rejected'].includes(input.status) ? 0 : row.base_points;
    const delta = points - row.points_awarded;
    sql.updateReportStatus.run({ id, status: input.status, points });
    if (delta !== 0) sql.insertPointsEntry.run({
      createdAt: new Date().toISOString(), reportId: id, points: delta,
      reason: `Report ${input.status}: ${reason}`,
    });
    audit(sql, user.id, {
      reportId: id, targetUserId: row.owner_id, action: withdrawal ? 'Report withdrawn' : 'Report reviewed',
      reason, previousStatus: row.status, newStatus: input.status, pointsDelta: delta,
    });
    sql.recalculateFingerprint.run({ key: row.fingerprint_key });
    return reportFromRow(sql.getReport.get(id), user);
  });

  const clearOwn = db.transaction(user => {
    const rows = sql.reportsForOwner.all(user.id);
    sql.detachDuplicateLinks.run(user.id);
    sql.deleteOwnReports.run(user.id);
    for (const row of rows) sql.deleteAnalysis.run(row.analysis_id);
    for (const key of new Set(rows.map(row => row.fingerprint_key))) sql.recalculateFingerprint.run({ key });
    sql.deleteUnusedFingerprints.run();
    if (rows.length) audit(sql, user.id, {
      targetUserId: user.id, action: 'Own reports deleted', reason: 'Author deleted their reports and points.',
    });
  });

  return {
    summary: user => ({ ...sql.getSummary.get({ userId: user.id }), dataPath: '' }),
    listReports: (user, { search = '', seniorOnly = false } = {}) =>
      sql.listReports.all({ userId: user.id, search: search.trim().toLowerCase(), seniorOnly: Number(seniorOnly) }).map(row => reportFromRow(row, user)),
    listModerationReports: ({ status, search }) => sql.listModerationReports.all({ status, search: search.trim().toLowerCase() }).map(row => reportFromRow(row)),
    getReport: (id, user) => reportFromRow(authorizedRow(id, user), user),
    getAnalysis(id, user) {
      authorizedRow(id, user);
      const row = sql.getAnalysis.get(id);
      return {
        riskLevel: row.risk_level, riskScore: row.risk_score, category: row.category,
        contentHash: row.content_hash, fingerprintKey: row.fingerprint_key,
        seniorProtectionRecommended: Boolean(row.senior_protection_recommended), signals: signalsFor(row.id),
      };
    },
    analyzeSubmission(user, content, category) {
      const analysis = analyze(content, category);
      const isReferenceExample = Boolean(sql.findExampleByHash.get(analysis.contentHash));
      const duplicate = sql.findDuplicate.get(analysis.contentHash);
      const ownDuplicate = duplicate?.owner_id === user.id;
      return {
        ...analysis, contentPreview: redact(content), isReferenceExample,
        duplicateNotice: isReferenceExample ? 'This message is a reference example. It cannot be submitted for points.' : duplicate
          ? (ownDuplicate ? `Exact duplicate found: report ${duplicate.id.replaceAll('-', '').slice(0, 8)}. Saving will link it and award 0 points.`
            : 'An exact duplicate already exists. Saving will award 0 points.')
          : 'No exact duplicate found.',
        seniorNotice: analysis.seniorProtectionRecommended
          ? 'Senior protection recommended for this report.' : 'No senior-specific pattern detected.',
      };
    },
    addReport: (user, input) => addReport.immediate(user, input),
    addDemoReports: (user, count) => addDemoReports.immediate(user, count),
    updateStatus: (user, id, input) => updateStatus.immediate(user, id, input),
    listFingerprints: user => sql.listFingerprints.all(user.id).map(row => ({
      key: row.key, category: row.category, highestRiskLevel: row.highest_risk_level,
      seenCount: row.seen_count, lastSeenAt: row.last_seen_at, traits: JSON.parse(row.traits),
    })),
    listPoints: user => sql.listPointsLedger.all(user.id).map(row => ({
      id: row.id, createdAt: row.created_at, reportId: row.report_id, reason: row.reason, points: row.points,
    })),
    protectionNote: (id, user) => ({ note: buildSeniorProtectionNote(reportFromRow(authorizedRow(id, user))) }),
    clearOwn: user => clearOwn.immediate(user),
  };
}
