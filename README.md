<img src="Citrine.png" alt="Citrine Logo" width="900">
<h1 align="center">
  Track scams, Get Points!
</h1>

# Citrine

Track scams. Earn points.

The Avalonia desktop app (`citrine`) and React web app (`client`) now share the
same Express API and SQLite database (`server`). JavaScript, Vite, plain CSS,
and better-sqlite3; no UI framework, TypeScript, or automatically seeded accounts/reports.
See [PORT_MAP.md](PORT_MAP.md) for the original port inventory and parity updates.

## Requirements

- Node.js 22.12+ and npm; Node.js 24 recommended.
- .NET 10 SDK to build/run the desktop app.
- No standalone SQLite installation is needed. If better-sqlite3 needs to compile
  locally, install Python 3 and C/C++ build tools.

On this machine the default Node is too old. Select the bundled runtime in each
terminal before running npm:

```bash
export PATH="/home/andrewgilliam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
node --version
```

## Run

Terminal 1, API:

```bash
cd /home/andrewgilliam/RiderProjects/Citrine/server
npm ci
npm run dev
```

Terminal 2, website:

```bash
cd /home/andrewgilliam/RiderProjects/Citrine/client
npm ci
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), or Vite's printed URL if that
port is occupied. `/api` is proxied to `http://127.0.0.1:3001`. Keep both processes
running; Ctrl+C stops them. `npm start` runs the API without a file watcher.

Optional terminal 3, desktop:

```bash
cd /home/andrewgilliam/RiderProjects/Citrine
dotnet run --project citrine/citrine/citrine.csproj
```

Keep the API running for desktop use, too. Sign in with the same account in both
clients. Desktop sessions are memory-only; sign in again after closing the app.
Navigation, Refresh, and refocusing the window reload server state. Updates are
not pushed live between clients.

To use another API port, set `PORT=3002` for the server and
`CITRINE_API_URL=http://127.0.0.1:3002` for both the web dev server and desktop
process. The desktop client requires HTTPS for non-loopback API addresses.

## Accounts and moderation

1. Create your account in either client. Usernames are case-insensitive, 3-32
   letters, numbers, dots, underscores, or hyphens. Passwords are 12-128 characters.
2. All registrations are members. No default password or first-signup admin exists.
3. To authorize an existing account as an administrator, run this locally in the
   server folder, substituting its registered username:

```bash
npm run account:admin -- YOUR_REGISTERED_USERNAME
```

Sign in again after promotion. Use the same `SQLITE_PATH` as the API if customized.
Administrators can use Users to assign member/moderator/admin roles and suspend
or restore accounts. Changes require a reason, revoke that user's sessions, and
are audited. The last active administrator cannot be demoted or suspended.

Members see only their own reports, fingerprints, points, and senior-protection
notes. They can withdraw their reports. Moderators and admins additionally have a
separate all-account moderation queue, status/search filters, evidence/signals,
and audit history. They can mark a report Verified or Mistaken (Rejected), or
reopen it for review, with a reason. Staff cannot review their own reports.
Concurrent changes are rejected until the reviewer refreshes.

## Scam examples

Scam examples in both clients browses the real [Kaggle SMS Spam Collection](https://www.kaggle.com/datasets/uciml/sms-spam-collection-dataset),
version 1: 5,572 messages (747 spam and 4,825 ham). Spam is the source dataset label,
not a confirmed scam verdict. The original ham label means not spam. Search, label
filters, 25-message pagination, source attribution, and rule-based signal analysis
are available. Message text is inert text, not clickable links or rendered HTML.

Examples are stored separately in `example_datasets` and `scam_examples`. They
never automatically become reports, points, or moderation work. Deleting your
reports does not delete the library. Exact normalized matches to the library are
blocked from submission, preventing point awards for copying reference material.
This is not model training or a claim of improved detection accuracy.

The requested dataset has been imported into this workspace. For a new database,
download and unzip the CSV, then explicitly import it:

```bash
curl --fail --location --output /tmp/citrine-sms.zip \
  https://www.kaggle.com/api/v1/datasets/download/uciml/sms-spam-collection-dataset
unzip /tmp/citrine-sms.zip -d /tmp/citrine-sms
cd /home/andrewgilliam/RiderProjects/Citrine/server
npm run examples:import -- /tmp/citrine-sms/spam.csv
```

Imports are transactional and repeatable without duplicate rows. The importer
verifies the v1 file's SHA-256 before writing; an unrelated/changed file is rejected.
The CSV is decoded as Latin-1. Empty trailing cells are discarded; text overflowing
into unnamed CSV columns in 50 rows is joined back with commas, not lost. Original
source row numbers and repeated messages are retained. No CSV or test credentials
are bundled in the source tree. API routes: authenticated `GET /api/examples` with
`label=spam|ham|all`, `search`, and `page`; `GET /api/examples/:id` for message/signals.

Attribution: Almeida, T. and Hidalgo, J. (2011), SMS Spam Collection,
[UCI Machine Learning Repository](https://doi.org/10.24432/C5CC84). Kaggle's metadata
lists its license as Unknown; the [upstream UCI page](https://archive.ics.uci.edu/dataset/228/sms+spam+collection)
lists [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Both sources and
that distinction are included in the library. The corpus contains historical,
sometimes offensive text and potentially unsafe contacts. Do not follow its links
or contact its phone numbers.

### Optional demo reports

To populate an existing account's Reports view with labeled reference copies:

```bash
cd /home/andrewgilliam/RiderProjects/Citrine/server
npm run reports:demo -- <registered-username> 6
```

Import the example dataset first. This explicitly copies the first six spam rows
in source order, retaining the originals. The optional count is 1-1000 (default 6),
limited by the available spam rows. This workspace now contains 700 demo copies.
Repeating the command skips copies already present for that account. Nothing runs
automatically at startup, and no user or credentials are created.

Both clients mark each copy **Demo report** with its source ID in the detail view.
Copies remain read-only Drafts with redacted previews and rule-based analysis,
not verified scam claims. They appear in the account's reports/dashboard totals,
but cannot be submitted or moderated and never award points or contribute to
active fingerprint sightings. The fingerprint foreign-key record is retained with
zero sightings when needed. Delete My Reports removes these copies along with
the account's other reports, without deleting the example library.

## Reporting and points

### Dashboard charts

The web and desktop dashboards show **Most common types** and **Rule-based risk**
from authenticated `GET /api/analytics`. Both support All reports, Demo examples,
and User reports filters. Charts refresh every 15 seconds while the dashboard is
open (the desktop window must also be active), on returning to the dashboard, and
through Refresh. New submissions are reflected on the next refresh.

Analytics includes every distinct demo source row once, even if copied to several
accounts, plus all PendingReview/Verified user reports. Draft, Rejected, and
Duplicate user reports are excluded. Only category/risk counts cross account
boundaries, never message text, usernames, or report IDs. Existing legacy reports
with eligible statuses also count. Demo copies remain zero-point drafts.

Types use ordered keyword rules in `server/services/analytics.js`, with explicit
scam categories taking precedence over message patterns. Each message belongs to
one type, with an Other / unclassified fallback. SMS is a channel, not a scam type.
Source spam labels and these classifications are not verified scam verdicts or
representative real-world prevalence estimates. Counts are calculated from the
current database, not hardcoded.

Submit content, choose Category and Confidence, then Analyze. Unknown uses the
existing automatic classification; other categories override it. Review the
redacted preview and check the privacy-review checkbox to enable Save Report.
Editing content or category invalidates the preview and privacy confirmation.

The server recomputes analysis, redaction, fingerprints, and points. It never
trusts client-provided scores, ownership, roles, or verdicts. Initial points keep
the original scoring rules; exact normalized duplicates earn zero across accounts.
Rejection or withdrawal reverses earned points. Valid reopening/verification
restores the original amount, with an adjustment ledger, not a second award.
Duplicate reports cannot be reopened or verified for points. Rejected, withdrawn,
and duplicate reports are excluded from active fingerprint totals.

## Data and security

First startup creates empty tables in `server/data/citrine.sqlite`. All runtime
SQL and migration SQL are in `server/queries.js`; table definitions are in
`server/schema.sql`. Inputs are bound to prepared statements. Report creation,
moderation, account access changes, and deletion are transactional.

```bash
# In server/; use the same setting for the API and admin command.
SQLITE_PATH=/absolute/path/to/citrine.sqlite npm start
```

Existing SQLite reports survive the account migration as **unassigned legacy
reports**, visible to staff in Moderation. They are never silently assigned to a
new registrant. Legacy desktop JSON files are left untouched and are not imported.
Back up your database before upgrading. A backup of the existing database for
this update is in `server/data/backups/` (ignored by Git).

Delete My Reports requires confirmation and removes only the signed-in account's
reports and ledger. The account, other users' reports, and moderation audit records
are retained. This does not securely erase disk blocks, SQLite WAL files, or backups.

Passwords use native scrypt (`N=131072`, `r=8`, `p=1`, 64-byte output), with a fresh
random 16-byte salt per password. Only the hash, salt, and algorithm parameters
are stored. These settings follow [OWASP's password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Comparisons are timing-safe. Login, registration, and password changes are rate
limited; memory-heavy hashing concurrency is bounded.

Sessions use random 32-byte tokens; SQLite stores only their SHA-256 hashes.
Cookies are HttpOnly, SameSite=Strict, scoped to `/api`, and expire after 12 hours.
Authenticated writes require a session-bound CSRF token; all writes require the
custom client header. No cross-origin grants are enabled. Password changes revoke
all prior sessions and issue a fresh one. Account APIs never return password hashes
or salts. Passwords/session tokens are not stored in browser localStorage.

For deployment, serve the site and API from the **same HTTPS origin**, proxy `/api`
to Express, and set `NODE_ENV=production` so cookies are Secure. Keep the database
and backups private to the service account. The server does not trust forwarded
IP headers; behind a proxy, rate limits are conservatively shared by its address.
The default loopback dev servers are not a public deployment configuration.

## API

| Method | Route | Access/action |
| --- | --- | --- |
| GET | `/api/auth/session` | Current user and CSRF token, or null |
| POST | `/api/auth/register`, `/api/auth/login` | `{username,password}` |
| POST | `/api/auth/logout` | End current session |
| POST | `/api/auth/password` | `{currentPassword,newPassword}` |
| GET | `/api/workspace` | Own counts and points |
| GET | `/api/reports?search=&seniorProtection=true` | Own reports; both filters optional |
| GET | `/api/reports/:id` | Owner or staff: report and signals |
| GET | `/api/reports/:id/analysis`, `/signals`, `/protection-note` | Owner or staff: derived report data |
| POST | `/api/analysis` | `{content,category}`; does not save |
| POST | `/api/reports` | `{content,category,confidenceLevel,containsPersonalInfo,privacyReviewed}` |
| PATCH | `/api/reports/:id/status` | `{status,expectedStatus,reason}`; reason required for staff review |
| GET | `/api/fingerprints`, `/api/points` | Own active patterns and ledger |
| DELETE | `/api/workspace` | Delete own reports and points |
| GET | `/api/moderation/reports?status=PendingReview&search=` | Staff queue; `all` includes every status |
| GET | `/api/moderation/actions?reportId=` | Staff audit history; omit ID for all history |
| GET | `/api/admin/users` | Admin: public account details |
| PATCH | `/api/admin/users/:id` | Admin: `{role,status,expectedRole,expectedStatus,reason}` |

Errors return `{error,message}`. Mutating requests send `X-Citrine-Client: 1`.
Authenticated writes also send `X-CSRF-Token` from the session response and the
session cookie. Both shipped clients handle these headers.

## Build and scope

```bash
cd /home/andrewgilliam/RiderProjects/Citrine/client
npm run build
npm run preview
```

Preview normally uses port 4173 and still needs the API. Desktop build:
`dotnet build citrine/citrine/citrine.csproj` from the repository root.

Implemented: all seven original workflows, functional categories, shared storage,
accounts/password changes, private workspaces, the real SMS example library, staff moderation/auditing, admin
access management, and points adjustments. Desktop layout/palette are retained;
the web layout also stacks on small screens. Fresh accounts have empty workspaces.

Not implemented: email verification/recovery, MFA, federated login, live push sync,
automated moderation, advanced anti-abuse detection, public deployment, or a
permanent automated test suite. No mock API or placeholder data is used.
Temporary API/migration checks and a C#-to-HTTP integration check exercise the new
boundaries without touching user accounts or reports.

Analysis remains the source rules engine, not a verified scam verdict. Redaction
is heuristic and incomplete; manually remove private details before submission.
Review notes are retained in audit history, so do not include private information.
