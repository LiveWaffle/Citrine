// All runtime SQL is here; schema.sql contains only schema definitions.
export const databaseSettings = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`;

export const migrationQueries = {
  reportColumns: 'PRAGMA table_info(scam_reports)',
  accounts: `
    ALTER TABLE scam_reports ADD COLUMN owner_id TEXT REFERENCES users(id);
    ALTER TABLE scam_reports ADD COLUMN base_points INTEGER NOT NULL DEFAULT 0;
    UPDATE scam_reports SET base_points = points_awarded;
    ALTER TABLE points_ledger_entries RENAME TO legacy_points_ledger_entries;
    CREATE TABLE points_ledger_entries (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      report_id TEXT NOT NULL REFERENCES scam_reports(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      points INTEGER NOT NULL
    );
    INSERT INTO points_ledger_entries SELECT * FROM legacy_points_ledger_entries;
    DROP TABLE legacy_points_ledger_entries;
  `,
  demoReports: 'ALTER TABLE scam_reports ADD COLUMN source_example_id TEXT REFERENCES scam_examples(id)',
  finish: `
    CREATE INDEX IF NOT EXISTS reports_owner ON scam_reports(owner_id, submitted_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS reports_demo_source ON scam_reports(owner_id, source_example_id)
      WHERE source_example_id IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS demo_report_insert BEFORE INSERT ON scam_reports
      WHEN NEW.source_example_id IS NOT NULL AND
        (NEW.owner_id IS NULL OR NEW.status != 'Draft' OR NEW.base_points != 0 OR NEW.points_awarded != 0 OR NEW.duplicate_of IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Demo reports must remain zero-point drafts'); END;
    CREATE TRIGGER IF NOT EXISTS demo_report_update BEFORE UPDATE ON scam_reports
      WHEN NEW.source_example_id IS NOT NULL AND
        (NEW.owner_id IS NULL OR NEW.status != 'Draft' OR NEW.base_points != 0 OR NEW.points_awarded != 0 OR NEW.duplicate_of IS NOT NULL)
      BEGIN SELECT RAISE(ABORT, 'Demo reports must remain zero-point drafts'); END;
    PRAGMA user_version = 2;
  `,
};

export const queries = {
  upsertExampleDataset: `INSERT INTO example_datasets
    (id, title, source_url, upstream_url, attribution, license_note, version, source_sha256, imported_at)
    VALUES (@id, @title, @sourceUrl, @upstreamUrl, @attribution, @licenseNote, @version, @sourceSha256, @importedAt)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, source_url=excluded.source_url,
      upstream_url=excluded.upstream_url, attribution=excluded.attribution, license_note=excluded.license_note,
      version=excluded.version, source_sha256=excluded.source_sha256, imported_at=excluded.imported_at`,
  insertExample: `INSERT INTO scam_examples (id, dataset_id, source_row, label, content, content_hash)
    VALUES (@id, @datasetId, @sourceRow, @label, @content, @contentHash)
    ON CONFLICT(dataset_id, source_row) DO UPDATE SET label=excluded.label,
      content=excluded.content, content_hash=excluded.content_hash`,
  getExampleDataset: `SELECT d.*, count(e.id) AS total,
      coalesce(sum(e.label = 'spam'), 0) AS spam_count, coalesce(sum(e.label = 'ham'), 0) AS ham_count
    FROM example_datasets d LEFT JOIN scam_examples e ON e.dataset_id=d.id WHERE d.id=? GROUP BY d.id`,
  listExamples: `SELECT id, source_row AS sourceRow, label, content FROM scam_examples
    WHERE dataset_id=@datasetId AND (@label='all' OR label=@label)
      AND (@search='' OR instr(lower(content), @search)>0)
    ORDER BY source_row LIMIT @limit OFFSET @offset`,
  countExamples: `SELECT count(*) AS total FROM scam_examples
    WHERE dataset_id=@datasetId AND (@label='all' OR label=@label)
      AND (@search='' OR instr(lower(content), @search)>0)`,
  getExample: `SELECT id, dataset_id AS datasetId, source_row AS sourceRow, label, content FROM scam_examples WHERE id=?`,
  findExampleByHash: 'SELECT id FROM scam_examples WHERE content_hash=? LIMIT 1',
  findDemoReport: 'SELECT id FROM scam_reports WHERE owner_id=@userId AND source_example_id=@exampleId',
  listReports: `
    SELECT r.*, u.username AS submitted_by FROM scam_reports r
    LEFT JOIN users u ON u.id = r.owner_id
    WHERE r.owner_id = @userId AND (@seniorOnly = 0 OR r.senior_protection_enabled = 1)
      AND (@search = '' OR instr(lower(r.category), @search) > 0
        OR instr(lower(r.content_preview), @search) > 0
        OR instr(lower(r.status), @search) > 0
        OR instr(lower(r.risk_level), @search) > 0
        OR instr(lower(coalesce(u.username, '')), @search) > 0)
    ORDER BY r.submitted_at DESC, r.rowid DESC
  `,
  getReport: `SELECT r.*, u.username AS submitted_by FROM scam_reports r
    LEFT JOIN users u ON u.id = r.owner_id WHERE r.id = ?`,
  findDuplicate: `
    SELECT * FROM scam_reports WHERE content_hash = ? AND source_example_id IS NULL
    ORDER BY submitted_at DESC, rowid DESC LIMIT 1
  `,
  getAnalysis: `
    SELECT a.* FROM scam_analysis_results a
    JOIN scam_reports r ON r.analysis_id = a.id WHERE r.id = ?
  `,
  listSignals: `
    SELECT name, detail, weight FROM scam_signals
    WHERE analysis_id = ? ORDER BY position
  `,
  insertAnalysis: `
    INSERT INTO scam_analysis_results
      (id, risk_level, risk_score, category, content_hash, fingerprint_key, senior_protection_recommended)
    VALUES (@id, @riskLevel, @riskScore, @category, @contentHash, @fingerprintKey, @seniorProtectionRecommended)
  `,
  insertSignal: `
    INSERT INTO scam_signals (analysis_id, position, name, detail, weight)
    VALUES (@analysisId, @position, @name, @detail, @weight)
  `,
  insertReport: `
    INSERT INTO scam_reports
      (id, owner_id, source_example_id, base_points, analysis_id, submitted_at, content_preview, contains_personal_info,
       confidence_level, content_hash, fingerprint_key, category, risk_level,
       risk_score, status, senior_protection_enabled, points_awarded, duplicate_of)
    VALUES
      (@id, @ownerId, @sourceExampleId, @basePoints, @analysisId, @submittedAt, @contentPreview, @containsPersonalInfo,
       @confidenceLevel, @contentHash, @fingerprintKey, @category, @riskLevel,
       @riskScore, @status, @seniorProtectionEnabled, @pointsAwarded, @duplicateOf)
  `,
  updateReportStatus: 'UPDATE scam_reports SET status = @status, points_awarded = @points WHERE id = @id',
  listFingerprints: `
    SELECT f.key, f.category, f.traits, count(*) AS seen_count,
      max(r.submitted_at) AS last_seen_at,
      CASE max(CASE r.risk_level WHEN 'Critical' THEN 3 WHEN 'High' THEN 2 WHEN 'Medium' THEN 1 ELSE 0 END)
        WHEN 3 THEN 'Critical' WHEN 2 THEN 'High' WHEN 1 THEN 'Medium' ELSE 'Low' END AS highest_risk_level
    FROM scam_fingerprints f JOIN scam_reports r ON r.fingerprint_key = f.key
    WHERE r.owner_id = ? AND r.status NOT IN ('Rejected', 'Draft', 'Duplicate')
    GROUP BY f.key ORDER BY last_seen_at DESC
  `,
  getFingerprint: 'SELECT * FROM scam_fingerprints WHERE key = ?',
  insertFingerprint: `
    INSERT INTO scam_fingerprints
      (key, category, highest_risk_level, seen_count, last_seen_at, traits)
    VALUES (@key, @category, @highestRiskLevel, @seenCount, @lastSeenAt, @traits)
  `,
  updateFingerprint: `
    UPDATE scam_fingerprints SET highest_risk_level = @highestRiskLevel,
      seen_count = seen_count + 1, last_seen_at = @lastSeenAt WHERE key = @key
  `,
  listPointsLedger: `SELECT p.* FROM points_ledger_entries p JOIN scam_reports r ON r.id = p.report_id
    WHERE r.owner_id = ? ORDER BY p.created_at DESC, p.id DESC`,
  insertPointsEntry: `
    INSERT INTO points_ledger_entries (created_at, report_id, reason, points)
    VALUES (@createdAt, @reportId, @reason, @points)
  `,
  getSummary: `
    SELECT
      (SELECT count(*) FROM scam_reports WHERE owner_id = @userId) AS totalReports,
      (SELECT count(*) FROM scam_reports WHERE owner_id = @userId AND status = 'PendingReview') AS pendingReviewCount,
      (SELECT count(*) FROM scam_reports WHERE owner_id = @userId AND senior_protection_enabled = 1) AS seniorProtectionCount,
      (SELECT count(DISTINCT fingerprint_key) FROM scam_reports
        WHERE owner_id = @userId AND status NOT IN ('Rejected', 'Draft', 'Duplicate')) AS fingerprintCount,
      (SELECT coalesce(sum(p.points), 0) FROM points_ledger_entries p
        JOIN scam_reports r ON r.id = p.report_id WHERE r.owner_id = @userId) AS totalPoints
  `,
  reportsForOwner: 'SELECT * FROM scam_reports WHERE owner_id = ?',
  detachDuplicateLinks: `UPDATE scam_reports SET duplicate_of = NULL
    WHERE duplicate_of IN (SELECT id FROM scam_reports WHERE owner_id = ?)`,
  deleteOwnReports: 'DELETE FROM scam_reports WHERE owner_id = ?',
  deleteAnalysis: 'DELETE FROM scam_analysis_results WHERE id = ?',
  deleteUnusedFingerprints: `DELETE FROM scam_fingerprints
    WHERE key NOT IN (SELECT fingerprint_key FROM scam_reports)`,
  recalculateFingerprint: `
    UPDATE scam_fingerprints SET
      seen_count = (SELECT count(*) FROM scam_reports WHERE fingerprint_key = @key AND status NOT IN ('Rejected', 'Draft', 'Duplicate')),
      highest_risk_level = coalesce((SELECT risk_level FROM scam_reports
        WHERE fingerprint_key = @key AND status NOT IN ('Rejected', 'Draft', 'Duplicate')
        ORDER BY CASE risk_level WHEN 'Critical' THEN 3 WHEN 'High' THEN 2 WHEN 'Medium' THEN 1 ELSE 0 END DESC LIMIT 1), highest_risk_level),
      last_seen_at = coalesce((SELECT max(submitted_at) FROM scam_reports
        WHERE fingerprint_key = @key AND status NOT IN ('Rejected', 'Draft', 'Duplicate')), last_seen_at)
    WHERE key = @key
  `,
  listModerationReports: `
    SELECT r.*, u.username AS submitted_by FROM scam_reports r LEFT JOIN users u ON u.id = r.owner_id
    WHERE r.source_example_id IS NULL AND (@status = 'all' OR r.status = @status)
      AND (@search = '' OR instr(lower(r.category), @search) > 0
        OR instr(lower(r.content_preview), @search) > 0 OR instr(lower(coalesce(u.username, '')), @search) > 0
        OR instr(lower(r.risk_level), @search) > 0 OR instr(lower(r.status), @search) > 0)
    ORDER BY r.submitted_at DESC, r.rowid DESC
  `,
  insertModerationAction: `INSERT INTO moderation_actions
    (id, actor_id, report_id, target_user_id, action, reason, previous_status, new_status, points_delta, created_at)
    VALUES (@id, @actorId, @reportId, @targetUserId, @action, @reason, @previousStatus, @newStatus, @pointsDelta, @createdAt)`,
  listModerationActions: `SELECT a.*, u.username AS actor_username
    FROM moderation_actions a LEFT JOIN users u ON u.id = a.actor_id
    WHERE (@reportId = '' OR a.report_id = @reportId) ORDER BY a.created_at DESC, a.rowid DESC`,
  getUserByName: 'SELECT * FROM users WHERE username_key = ?',
  getUser: 'SELECT * FROM users WHERE id = ?',
  listUsers: 'SELECT id, username, role, status, created_at FROM users ORDER BY created_at DESC, rowid DESC',
  insertUser: `INSERT INTO users (id, username, username_key, password_hash, password_salt, password_parameters, role, status, created_at)
    VALUES (@id, @username, @usernameKey, @passwordHash, @passwordSalt, @passwordParameters, 'member', 'active', @createdAt)`,
  updatePassword: `UPDATE users SET password_hash = @passwordHash, password_salt = @passwordSalt,
    password_parameters = @passwordParameters WHERE id = @id`,
  updateUserAccess: 'UPDATE users SET role = @role, status = @status WHERE id = @id',
  countActiveAdmins: "SELECT count(*) AS count FROM users WHERE role = 'admin' AND status = 'active'",
  insertSession: `INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at)
    VALUES (@tokenHash, @userId, @csrfToken, @createdAt, @expiresAt)`,
  getSession: `SELECT u.*, s.csrf_token, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = @tokenHash AND s.expires_at > @now AND u.status = 'active'`,
  deleteSession: 'DELETE FROM sessions WHERE token_hash = ?',
  deleteUserSessions: 'DELETE FROM sessions WHERE user_id = ?',
  deleteExpiredSessions: 'DELETE FROM sessions WHERE expires_at <= ?',
  getRateLimit: 'SELECT * FROM auth_rate_limits WHERE key_hash = ?',
  incrementRateLimit: `INSERT INTO auth_rate_limits (key_hash, attempts, expires_at) VALUES (@keyHash, 1, @expiresAt)
    ON CONFLICT(key_hash) DO UPDATE SET attempts = attempts + 1`,
  deleteExpiredRateLimits: 'DELETE FROM auth_rate_limits WHERE expires_at <= ?',
  deleteRateLimit: 'DELETE FROM auth_rate_limits WHERE key_hash = ?',
};
