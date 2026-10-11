# Citrine Avalonia to React Port Map

This inventory was written after reading the complete authored Avalonia project,
before creating the React client or Node server. The original inventory below is
a historical snapshot of that port. The parity/account update in the next section
supersedes the original limitations and API semantics later in this document.
Generated `bin`/`obj` output is not application source.

## Shared API, accounts, and moderation update

Both clients now use the same server implementation for data and domain decisions.
`MainWindow.axaml.cs` no longer instantiates the local `CitrineWorkspace` or
`ScamAnalysisService`. Those original files remain as reference; their JSON data
is neither read nor modified by the connected desktop UI.

| New/updated desktop source | React/server counterpart |
| --- | --- |
| `Services/CitrineApiClient.cs` | `client/src/api.js`: cookie session, CSRF header, typed error handling, shared routes |
| `Models/ApiModels.cs`: `AccountUser`, `AuthSession` | Plain `{id,username,role,status,createdAt}` and `{user,csrfToken}` objects; `useAuth` |
| `AccountPage`, sign-in/register/password/logout handlers | `AuthPage`, `AccountPage`, `useAuth`; `server/services/auth.js` |
| `ModerationPage`, queue, evidence, reason, decision buttons, history | `ModerationPage`, `useResource`; `workspace.updateStatus` and `moderation.actions` |
| `UsersPage`, account selection, role/status/reason | `UsersPage`, `useResource`; `server/services/moderation.js` |
| `WorkspaceSummary` | `{totalReports,pendingReviewCount,seniorProtectionCount,fingerprintCount,totalPoints}` from owner-scoped SQL |
| `SubmissionAnalysis` | Original analysis plus `{contentPreview,duplicateNotice,seniorNotice}` |
| `ProtectionNote` | `{note}` from shared safety-note generation |
| `ModerationAction` | `{id,actorUsername,actorId,reportId,targetUserId,action,reason,previousStatus,newStatus,createdAt,pointsDelta}` |
| `ScamReport` ownership | Adds `ownerId` (nullable for legacy data) and `submittedBy` |
| `PointsLedgerEntry` identity | Adds numeric `id`; C# `long`; multiple adjustment entries per report |

Additional tables: `users`, `sessions`, `auth_rate_limits`, `moderation_actions`.
DTOs and aggregate results are not duplicated as tables. Users contain password
hashes/salts/parameters; sessions store token hashes. Public account objects never
include those fields. Existing reports receive nullable ownership, not fabricated
accounts. The ledger migration preserves existing rows and allows adjustments.

Auth routes: GET `auth/session`; POST `auth/register`, `auth/login`, `auth/logout`,
`auth/password`. Staff routes: GET `moderation/reports`, `moderation/actions`.
Admin routes: GET `admin/users`, PATCH `admin/users/:id`. All are under `/api`;
runtime SQL remains centralized in `server/queries.js`. See README for payloads.

Current semantics replacing the initial fidelity notes:

- All original screens are account-scoped in both clients. Staff work across
  accounts only through moderation. No client-supplied ownership or roles trusted.
- Category is functional; Unknown auto-classifies. Content/category changes
  invalidate the analysis and privacy confirmation in both clients.
- Members withdraw their own reports. Staff review others with reasons and
  expected-status conflict checks. Rejections/withdrawals reverse points; valid
  reopening restores original points without duplicate awards. Active fingerprint
  counts exclude Rejected, Draft, and Duplicate reports.
- Delete My Reports deletes only the signed-in account's reports and points;
  accounts, other users' data, and audit history remain. It requires confirmation.
- Desktop cookies stay in memory; web cookies survive reload until expiry. Both
  clients clear account state on sign-out. Refresh/navigation/window focus reload
  data. No real-time push channel or automatic legacy JSON import is implemented.
- Account and moderation errors/empty states have functional copy. The original
  palette and desktop panels remain; web panels stack at small widths.
- The initial auth omission is superseded by the user's account/moderation request.
  No seeds, default admin credentials, TypeScript, or UI libraries were introduced.

## Original port inventory

### Requested reference dataset extension

`ExamplesPage` in `MainWindow.axaml` maps to React `ExamplesPage`; both use the
same authenticated, paginated examples API. `ExamplesAsync`/`ExampleAsync` map to
`api.examples`/`api.example`, using `useResource` in React. Neither UI submits
examples for points. Separate `ExampleDataset` and `ScamExample` models map to
`example_datasets` and `scam_examples`; `ExamplePageResult` is a pagination DTO.

```text
ExampleDataset = { id, title, sourceUrl, upstreamUrl, attribution, licenseNote,
  version, sourceSha256, importedAt, total, spamCount, hamCount }
ScamExample = { id: string, sourceRow: number, label: 'spam' | 'ham', content: string }
ExampleDetail = ScamExample + { datasetId, analysis: ScamAnalysisResult }
ExamplePageResult = { items: ScamExample[], total, page, pageSize, dataset }
```

`server/import-examples.js` explicitly imports the requested Kaggle v1 CSV using
`csv-parse`, a pinned source checksum, Latin-1 decoding, original row identities,
and upserts in a transaction. All SQL remains in `queries.js`. No automatic seeds,
synthetic messages, or classifier training were added. This user-requested real
reference library supersedes the prior restriction on filled-in reference data,
but user accounts/reports are still not seeded. Reference matches add
`isReferenceExample` to submission analysis and cannot earn points.

An explicit local `reports:demo` command can copy imported spam rows into an
existing account's Reports as zero-point Drafts. `ScamReport` now adds
`isDemo: boolean` and `sourceExampleId: string|null` in React/JSON, matching
`IsDemo` and `SourceExampleId` in C#. SQLite stores the nullable source FK on
`scam_reports`; a unique owner/source index makes copying repeatable. Both clients
label demo rows and display provenance in the report detail. Status changes are
blocked in the service and constrained to zero-point drafts by SQLite triggers.
Copies do not enter moderation, duplicate detection, or active fingerprint totals.
No new UI creation command or HTTP write route is exposed for these demo copies.

GET `/api/examples?label=spam&search=&page=1` maps to `listExamples`, `countExamples`,
`getExampleDataset`; GET `/api/examples/:id` maps to `getExample` plus transient
analysis. The source labels are not treated as confirmed scams. Provenance/license
details and the 50 overflow-column transformations are documented in README.

## Source inventory

| Source | Contents | Web destination |
| --- | --- | --- |
| `citrine/citrine.sln` | One desktop project | Independent `client` and `server` packages |
| `citrine/citrine/citrine.csproj` | .NET 10, Avalonia 12.1.4, Fluent theme, Inter font, diagnostics | React/Vite and Express/better-sqlite3 package manifests |
| `citrine/citrine/Program.cs` | `Program.Main`, desktop bootstrap | `client/src/main.jsx`, `server/index.js` |
| `citrine/citrine/app.manifest` | Windows compatibility metadata | Not applicable to a browser |
| `citrine/citrine/App.axaml` | `App`, Fluent theme, system theme selection | `client/src/styles.css`, explicit light source palette |
| `citrine/citrine/App.axaml.cs` | Creates `MainWindow` | `client/src/App.jsx` |
| `citrine/citrine/MainWindow.axaml` | Only window, seven embedded page views, styles and item templates | Components listed below |
| `citrine/citrine/MainWindow.axaml.cs` | Navigation, form state, event handlers, selection, search, collection refresh, senior notes | `useNavigation`, `useSubmission`, `useWorkspace`, `useReportSelection` hooks |
| `citrine/citrine/Models/CitrineModels.cs` | Two enums and five domain model types | Plain objects documented below; `server/models.js` |
| `citrine/citrine/Services/ScamAnalysisService.cs` | Analysis, redaction, safety note, traits, normalization, SHA-256 hashes | `server/services/scamAnalysis.js` |
| `citrine/citrine/Services/CitrineWorkspace.cs` | Local JSON persistence, collections, aggregates, duplicate detection, points, fingerprint upsert | `server/services/workspace.js`, `server/schema.sql`, `server/queries.js` |

There are **no separate ViewModel classes**, view-model files, ICommand objects,
or other windows/views. State and commands live in `MainWindow` code-behind.
There are no image assets in the authored desktop project.

## Views, bindings, and controls

All components are JavaScript function components. CSS preserves the 236px sidebar,
64px header, 24px content inset, source column proportions, panel order, labels,
source colors, and control types. Below the desktop window's 1040px minimum width,
the browser scrolls horizontally rather than rearranging the reference layout.

| XAML view/control | React component | State / binding translation |
| --- | --- | --- |
| `App.axaml`, `MainWindow` | `App` | Hook state replaces fields and visibility flags |
| Sidebar and seven navigation buttons | `Sidebar` | `useNavigation`: page, title, active button, browser hash/back navigation |
| Header: `PageTitle`, `SearchBox`, Submit Report | `Header` | Current page title, controlled search input, navigation handler |
| `DashboardPage` | `DashboardPage` | SQLite counts, first eight filtered reports, existing empty-workspace text |
| `SubmitPage` | `SubmitPage` | `useSubmission`: content, category, confidence, checkboxes, analysis, preview, notices |
| `ReportsPage` | `ReportsPage` | Search results, selected report, signals, status handlers |
| `FingerprintsPage` | `FingerprintsPage` | Fingerprint objects from API |
| `PointsPage` | `PointsPage` | Total from ledger SQL, ledger objects from API |
| `SeniorPage` | `SeniorProtectionPage` | Flagged reports from SQL, selected report's protection note |
| `PrivacyPage` | `PrivacyPage` | Actual SQLite path, clear-workspace handler |
| Report DataTemplates | `ReportList` | Category, preview, risk, status and points, as appropriate for each source list |
| `ScamSignal` DataTemplates | `SignalList` | Signal name and detail |
| `ListBox` | `ListBox` | Selectable listbox/options with mouse and keyboard selection |
| `TextBox`, multiline `TextBox` | Native `input`, `textarea` | Controlled values and change handlers |
| `ComboBox`, `CheckBox`, `ProgressBar` | Native `select`, checkbox, `progress` | Controlled values, booleans, calculated risk |
| `Border`, `Grid`, `StackPanel`, `ScrollViewer` | Semantic HTML, CSS grid/flex, overflow | Same nesting and order as the source |

Existing empty-state text is reused. Lists without source empty/loading/error copy
stay blank with TODO comments. Counts are read from SQLite, not seeded constants.
The source's fixed options, scoring rules, labels, and initial form selections are
configuration, not invented report data.

## Code-behind to hooks / event handlers

| C# state or handler | JavaScript destination |
| --- | --- |
| `ShowPage`, `ShowDashboard/Submit/Reports/Fingerprints/Points/SeniorProtection/Privacy`, `GetPages`, `GetNavButtons` | `useNavigation`, shared navigation descriptors |
| `_currentAnalysis`, `_currentSubmission`, `OnAnalyzeSubmission`, `OnSaveReport`, `OnClearSubmission`, `ClearSubmission`, `UpdateSaveButton`, `OnPrivacyReviewChanged`, `GetComboBoxText` | `useSubmission` |
| `_workspace`, `BindCollections`, `RefreshEverything`, `RefreshReportLists`, `FilterReports`, `UpdateDashboard`, `OnSearchChanged`, `OnClearWorkspace` | `useWorkspace`, parameterized API queries, `App` clear handler |
| `_selectedReport`, `SelectReport`, `ClearSelectedReport`, `OnReportSelected`, `OnDashboardReportSelected`, `OnSeniorReportSelected` | `useReportSelection` and list event handlers |
| `OnMarkVerified`, `OnMarkRejected`, `OnWithdrawReport`, `UpdateSelectedReportStatus` | `useReportSelection.updateStatus` calling PATCH |
| `BuildSeniorProtectionNote` | Server `buildSeniorProtectionNote`, consumed by selection hook |

## Plain JavaScript object shapes

Dates are ISO strings, GUIDs are strings, booleans remain booleans in API JSON,
and enum values are their source names. These are shape descriptions, not data rows.

```text
ScamRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical'
ReportStatus = 'Draft' | 'PendingReview' | 'Verified' | 'Rejected' | 'Duplicate'

ScamSignal = { name: string, detail: string, weight: number }

ScamAnalysisResult = {
  riskLevel: ScamRiskLevel, riskScore: number, category: string,
  contentHash: string, fingerprintKey: string, signals: ScamSignal[],
  seniorProtectionRecommended: boolean
}

ScamReport = {
  id: string, submittedAt: string, contentPreview: string,
  containsPersonalInfo: boolean, confidenceLevel: string,
  contentHash: string, fingerprintKey: string, category: string,
  riskLevel: ScamRiskLevel, riskScore: number, status: ReportStatus,
  seniorProtectionEnabled: boolean, pointsAwarded: number,
  signals: ScamSignal[], duplicateOf: string | null, shortId: string
}

ScamFingerprint = {
  key: string, category: string, highestRiskLevel: ScamRiskLevel,
  seenCount: number, lastSeenAt: string, traits: string[]
}

PointsLedgerEntry = {
  createdAt: string, reportId: string, reason: string, points: number
}

WorkspaceState = {
  reports: ScamReport[], fingerprints: ScamFingerprint[],
  pointsLedger: PointsLedgerEntry[]
}
ReportState = ScamReport without computed shortId
FingerprintState = ScamFingerprint
PointsState = PointsLedgerEntry
```

`WorkspaceState`, `ReportState`, `FingerprintState`, and `PointsState` are private
JSON serialization DTOs inside `CitrineWorkspace`, not independent domain models.
Their fields are represented by the corresponding tables, not duplicate copies.
Observable collections become arrays returned by fetch. `ShortId` and `ToString`
representations are derived, not separately stored. Primitive traits use JSON in
the fingerprint table; there is no separate C# trait model.

## SQLite schema

One table for each of the five domain models:

| Model | Table | Storage |
| --- | --- | --- |
| `ScamReport` | `scam_reports` | Report fields; foreign keys to analysis and duplicate report |
| `ScamAnalysisResult` | `scam_analysis_results` | Immutable analysis snapshot, persisted only when a report is saved |
| `ScamSignal` | `scam_signals` | Ordered signals linked to analysis; composite analysis/position key |
| `ScamFingerprint` | `scam_fingerprints` | Pattern key, category, highest risk, count, last seen, JSON traits |
| `PointsLedgerEntry` | `points_ledger_entries` | Report reference, timestamp, reason, points; generated storage ID |

No seed statements or automatic JSON imports. Analyze alone does not persist
content. Save recalculates analysis on the server and only stores redacted preview,
hashes, signals, and derived metadata. Report, analysis, signals, fingerprint update,
and ledger entry are saved in one transaction. Clear deletes all five tables in
one transaction. SQL DDL lives in `schema.sql`; all runtime SQL lives in `queries.js`.

## Queries and API routes

Internal write queries are exposed through the existing domain action, in a single
transaction. There are no independent point-awarding or signal-editing actions in
the desktop app, so the API does not invent them.

| C# action | Query / operation | API |
| --- | --- | --- |
| `Load`, `FilterReports`, `RefreshReportLists` | `listReports` with search, optional senior filter | `GET /api/reports?search=&seniorProtection=true` |
| `SelectReport` | `getReport`, `listSignals` | `GET /api/reports/:id` |
| Saved analysis / signals | `getAnalysis`, `listSignals` | `GET /api/reports/:id/analysis`, `GET /api/reports/:id/signals` |
| `OnAnalyzeSubmission`, duplicate lookup | `findDuplicate`, transient `analyze` / `redact` | `POST /api/analysis` |
| `AddReport`, `Save` | `findDuplicate`, `insertAnalysis`, `insertSignal`, `insertReport`, `getFingerprint`, `insertFingerprint` or `updateFingerprint`, `insertPointsEntry` | `POST /api/reports` |
| `UpdateStatus`, `Save` | `updateReportStatus` | `PATCH /api/reports/:id/status` |
| `Load`, `ShowFingerprints` | `listFingerprints` | `GET /api/fingerprints` |
| `Load`, `ShowPoints` | `listPointsLedger` | `GET /api/points` |
| `TotalPoints`, `PendingReviewCount`, `SeniorProtectionCount`, dashboard counts | `getSummary` aggregate query | `GET /api/workspace` |
| `DataPath` | Actual opened database path | `GET /api/workspace` |
| `BuildSeniorProtectionNote` | `getReport`, `listSignals`, note generation | `GET /api/reports/:id/protection-note` |
| `ClearAll` | `deletePointsLedger`, `deleteReports`, `deleteSignals`, `deleteAnalyses`, `deleteFingerprints` | `DELETE /api/workspace` |

## Fidelity notes and scope

- The source Category dropdown is never read by `OnSaveReport`; classification
  comes from analysis. Keep the dropdown state and add a TODO without inventing
  manual classification behavior.
- Status changes do not adjust points or fingerprints in C#. Preserve that
  behavior, including Withdraw mapping to Draft and Mark Mistaken to Rejected.
- Existing heuristics, signal weights, risk thresholds, duplicate normalization,
  points calculations, and protection note text are ported, not replaced with AI.
- Invalidate analysis when content changes so the web form cannot save a stale
  preview. The server remains authoritative for analysis and points.
- Existing JSON files are not migrated; the requested SQLite database starts empty.
- No authentication, new product features, animations, polished validation, seed
  content, mock users, automated test suite, UI framework, or TypeScript.
- Basic malformed-request handling and the existing privacy-review requirement
  remain necessary to keep API writes consistent.
