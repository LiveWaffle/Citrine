-- Shared account workspace. No seeded accounts, credentials, or reports.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_parameters TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('member', 'moderator', 'admin')),
    status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key_hash TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scam_analysis_results (
    id TEXT PRIMARY KEY,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
    risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    category TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    fingerprint_key TEXT NOT NULL,
    senior_protection_recommended INTEGER NOT NULL CHECK (senior_protection_recommended IN (0, 1))
);

CREATE TABLE IF NOT EXISTS scam_signals (
    analysis_id TEXT NOT NULL REFERENCES scam_analysis_results(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    detail TEXT NOT NULL,
    weight INTEGER NOT NULL,
    PRIMARY KEY (analysis_id, position)
);

CREATE TABLE IF NOT EXISTS scam_fingerprints (
    key TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    highest_risk_level TEXT NOT NULL CHECK (highest_risk_level IN ('Low', 'Medium', 'High', 'Critical')),
    seen_count INTEGER NOT NULL,
    last_seen_at TEXT NOT NULL,
    traits TEXT NOT NULL CHECK (json_valid(traits))
);

CREATE TABLE IF NOT EXISTS scam_reports (
    id TEXT PRIMARY KEY,
    owner_id TEXT REFERENCES users(id),
    source_example_id TEXT REFERENCES scam_examples(id),
    base_points INTEGER NOT NULL DEFAULT 0,
    analysis_id TEXT NOT NULL UNIQUE REFERENCES scam_analysis_results(id),
    submitted_at TEXT NOT NULL,
    content_preview TEXT NOT NULL,
    contains_personal_info INTEGER NOT NULL CHECK (contains_personal_info IN (0, 1)),
    confidence_level TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    fingerprint_key TEXT NOT NULL REFERENCES scam_fingerprints(key),
    category TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
    risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    status TEXT NOT NULL CHECK (status IN ('Draft', 'PendingReview', 'Verified', 'Rejected', 'Duplicate')),
    senior_protection_enabled INTEGER NOT NULL CHECK (senior_protection_enabled IN (0, 1)),
    points_awarded INTEGER NOT NULL,
    duplicate_of TEXT REFERENCES scam_reports(id)
);

CREATE INDEX IF NOT EXISTS reports_content_hash ON scam_reports(content_hash);
CREATE INDEX IF NOT EXISTS reports_submitted_at ON scam_reports(submitted_at DESC);
CREATE INDEX IF NOT EXISTS reports_senior ON scam_reports(senior_protection_enabled);

CREATE TABLE IF NOT EXISTS points_ledger_entries (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    report_id TEXT NOT NULL REFERENCES scam_reports(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    points INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_actions (
    id TEXT PRIMARY KEY,
    actor_id TEXT REFERENCES users(id),
    report_id TEXT REFERENCES scam_reports(id) ON DELETE SET NULL,
    target_user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    points_delta INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS moderation_report ON moderation_actions(report_id, created_at DESC);

-- Reference material can be copied into labeled demo drafts, never point awards.
CREATE TABLE IF NOT EXISTS example_datasets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    upstream_url TEXT NOT NULL,
    attribution TEXT NOT NULL,
    license_note TEXT NOT NULL,
    version TEXT NOT NULL,
    source_sha256 TEXT NOT NULL,
    imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scam_examples (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES example_datasets(id),
    source_row INTEGER NOT NULL,
    label TEXT NOT NULL CHECK (label IN ('spam', 'ham')),
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    UNIQUE (dataset_id, source_row)
);
CREATE INDEX IF NOT EXISTS examples_label ON scam_examples(dataset_id, label, source_row);
CREATE INDEX IF NOT EXISTS examples_hash ON scam_examples(content_hash);
