# LFA Free Periods

A Google Apps Script web app that creates a separate free-period calendar for each authorized LFA user. Created with AI assistance, with automated regression tests and a documented deployment process.

## What it does

1. Authenticates the visitor's LFA Google account and subscribes it to the configured shared letter-day calendar if missing.
2. Reads letter-day markers from All LFA Events, the user's main calendar, and their checked, non-hidden calendars.
3. Uses the configured A-G bell schedule for each date.
4. Creates a light-gray free-period event only when no timed source event overlaps that entire period. Any partial overlap blocks the whole period.
5. Reconciles generated events on subsequent successful updates, removing newly booked blocks and adjusting changed letter days.

User properties keep each person's output calendar ID separate. An email field cannot grant access or impersonate another user. Shared source calendars block time for all their timed bookings. Output events are excluded from input and marked available, without reminders. Source calendars are read only.

## Close the page and receive a completion email

After authorization and activation enable background updates, the page can be closed. The page explains that a large initial fill may take about 30 minutes to several hours, sometimes longer; this is an estimate, not a service guarantee.

After a successful run finishes with zero pending changes, the app sends one confirmation to that authenticated user's LFA email per school-year/output calendar. It does not send an email for every meeting or every refresh. The email reports calculated free blocks and skipped dates; skipped dates are not advertised as fully covered. No user calendar titles or appointment details are included.

If mail delivery throws or quota is unavailable, calendar completion remains successful, the page reports a delayed notification, and the next successful check retries. Delivery acceptance is not an inbox-delivery guarantee. The app uses MailApp with send-only permission; it does not read email. This runs under the user's authorized account and sends the confirmation to that same account, rather than a central LFA sender.

Reopening the page shows the last saved run status and any delayed-email notice. Live OAuth, background update timing and mail delivery still require acceptance testing.

## Run the tests

Install Node.js 22 or newer, then run:

```sh
npm test
```

No npm dependencies, Google credentials, or real Calendar changes are needed. The tests evaluate the actual `src/Code.gs` with in-memory Google service substitutes. See [test coverage](docs/TESTING.md) for scope and limits.

GitHub Actions runs the same command on pushes, pull requests, and manual dispatches with Node 22 and 24. After both test jobs pass, a trusted `main` push (or manual run on `main`) updates the configured existing Apps Script deployment. Pull requests and other branches do not deploy. Setup is in [GITHUB-CICD.md](docs/GITHUB-CICD.md). The tests never access real school calendars.

## Add this project to GitHub

1. Create a GitHub repository named `lfa-free-periods` (choose its visibility).
2. Extract the project ZIP. Upload the contents of the `lfa-free-periods` folder to the repository root, preserving `src`, `tests`, `scripts`, `docs`, and `.github/workflows/tests.yml`. Avoid an extra enclosing folder.
3. If your file picker hides `.github`, create `.github/workflows/tests.yml` using GitHub's Add file > Create new file, and paste the included YAML.
4. Follow [GITHUB-CICD.md](docs/GITHUB-CICD.md) to add deployment secrets. Without them the tests can pass but the deployment job fails with a missing-secret message.
5. Open Actions > Test and deploy. Both test jobs must pass before deployment can start. Retain the Actions run URL and deployed version for your project record. Local test results do not prove that GitHub CI or live deployment passed.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/Code.gs` | Complete Apps Script server and embedded website; copy into Code.gs |
| `src/appsscript.json` | Calendar service, scopes and per-user web-app manifest |
| `tests/calendar.test.cjs` | Offline multi-user and schedule-change tests |
| `.github/workflows/tests.yml` | Test-gated automatic deployment workflow |
| `scripts/prepare-deploy.cjs` | Validates deployment configuration and writes private temporary files |
| `docs/DEPLOYMENT.md` | Deployment and coworker instructions |
| `docs/TESTING.md` | Test cases, evidence and live verification checklist |
| `docs/GITHUB-CICD.md` | Portfolio publishing and one-time auto-deployment setup |

## Annual reuse and limitations

After one full-year reconciliation finishes, routine runs read only today plus the next **35 days**, rather than the full academic year. They remove newly busy blocks before adjusting or adding blocks, and restore availability after cancellations. A full-year pass runs again every **six hours**; if it has pending changes, subsequent runs continue that annual pass until complete. New school years and replacement output calendars require a fresh full pass. Initial and recurring full-year scans now process at most 35 calendar days per range, save a per-user checkpoint, and prioritize upcoming dates before backfilling past dates. A range advances only after its writes finish. Email completion waits for every range. `nearbyDays` and `fullCheckMinutes` configure these windows. Trigger timing and live performance are not guaranteed.

- Reads actual dated A-G markers rather than extrapolating a rotation from school start. Covers August through May; in June/July it prepares the upcoming year.
- Review the bell-time configuration against each year's planner. PDF parsing is not implemented. Special-day times require explicit date overrides.
- Changing F to G changes the planned slots and labels at the next successful reconciliation. The app does not move source classes; school and class calendars must publish their correct times.
- Missing/conflicting letter markers or unconfirmed special schedules skip affected dates. No guessed availability is created.
- Initial fills are capped at 100 event mutations and a 180-second soft budget per run. Repeated successful runs are required. Large removal/update batches can temporarily leave stale generated events until subsequent runs finish.
- Source event watches (where permitted) and a one-minute polling trigger request updates; Google delivery, quotas, authorization, and failed runs can delay them. Closing the page does not stop an installed trigger.
- This repository does not resolve the reported live cutoff at February 18. Check Apps Script Executions for actual background failures before treating full-year coverage as verified.
- Tests do not verify real OAuth, Workspace policy, source-calendar publication, browser account routing, or actual trigger timing.

## AI-assisted development

AI assisted with implementation, debugging, test design and documentation. The project owner defines requirements, reviews generated changes, verifies live behavior and controls deployment. Simulated test success is recorded separately from live acceptance and GitHub CI. No student records, OAuth tokens or real event exports belong in the repository.

No open-source license is selected in this package; choose one deliberately before inviting external reuse.

Automatic school-calendar subscription: activation uses the configured Calendar ID, adds the existing shared calendar if missing, and selects/unhides it. Existing personal display names are preserved. No source events or sharing permissions are changed. Users still need reader-level event-detail access; the app cannot grant access from an ID.

Letter-day parsing accepts a leading A-G day marker with descriptive text, e.g. `B-Day (Tuesday with Break)` or `G day with (Tuesdsay with zreak)`. The note does not change the identified letter; the actual date still controls Tuesday bell rules. G keeps its late-start six-period schedule. Unrelated or mixed-letter titles are rejected. Special bell changes still require explicit overrides.

Developer alerts: each authenticated setup request sends a technical usage notice to `seoyeonchoi2001@gmail.com` (per-user ten-minute throttle). Caught activation/update failures send the account, stage, error category/code and suggested check, without event details or raw error text. Identical failure categories/codes are throttled per user for six hours. Exact caught sync errors remain in user LAST_ERROR/Executions. The technical reporting notice is omitted from the website at the project owner's request. This is not an alert for each background poll. Mail permission/quota is required; alert failure never stops calendar processing. Hard execution termination and non-error skipped dates cannot be guaranteed to generate an alert.

Developer success notifications now send to the corrected address `seoyeonchoi2001@gmail.com`. They are sent once per user/school-year/output after zero pending changes and a completed full-year pass, including skipped-date counts. Routine maintenance does not repeat them. A failed developer mail attempt is retried by later successful checks after the reporting cooldown; sending still depends on Google permissions and quotas.

Scaling update: the app saves per-user progress/source event counts and exposes them under Setup progress and diagnostics. Google quota errors trigger delayed retries with exponential backoff and jitter instead of immediate repeated work. Zero-write runs with pending changes generate an attention alert. Separate user locks protect same-user edits while permitting other users to run. A 50-worker offline concurrency test verifies isolated output, expected availability, and no cross-user writes. It does not simulate Google latency, enforce real quotas, or establish a completion-time service level. See docs/SCALING.md before a wider rollout.
