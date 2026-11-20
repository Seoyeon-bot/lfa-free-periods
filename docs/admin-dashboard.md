# Admin diagnostics update

This update adds a read-only dashboard for seoyeon.choi@lfanet.org. Authorization is checked server-side on both the page and the data endpoint. Other teachers retain the normal free-period page. Existing calendar processing, saved progress and triggers remain in place. Developer diagnostic emails are removed. Teachers still receive their own setup-completion email. Setup requests, issues and completion are reported in the dashboard only for the administrator.

## Install through your existing GitHub workflow

1. Copy this package's src, tests and docs folders into your existing lfa-free-periods repository, replacing the matching files. Keep all other repository files.
2. In Terminal, from the repository folder, run:

   npm test
   git add src/Code.gs src/Admin.html tests package.json docs/admin-dashboard.md
   git commit -m "Add admin progress and diagnostics dashboard"
   git push origin main

3. With ENABLE_APPS_SCRIPT_DEPLOY=true and the existing deployment secrets configured, your workflow tests and updates the existing web app deployment. Confirm that both deployment write steps succeeded.
4. Open your normal web app while signed in as seoyeon.choi@lfanet.org and click Admin diagnostics. You can also append ?admin=1 to the existing /exec URL.

No new OAuth scope, Google Sheet, shared calendar, or email permission is required. Do not replace appsscript.json for this update. Source uploads affect subsequent background executions; this update keeps the existing progress-property schema.

## What you can see

- Signed-in LFA account; first seen and most recent setup request.
- Running, in progress, retrying, idle, stalled, error or paused state.
- Current stage, including the calendar being read; last reporting time.
- Last successful check; latest full-year scan completion.
- Current full scan's completed/total date ranges and current date range.
- Pending changes and calculated blocks from the last completed batch.
- Total blocks calculated and skipped dates from the latest completed full scan.
- Last error category, safe explanation, HTTP code if present, stage and time. A successful retry retains this last issue for investigation.
- Confirmation email send status; a successful send API call does not prove inbox delivery.
- Source-calendar names and event counts from the last completed batch (first 16), a recent sample of skipped dates and reasons (up to 10), and six recent state transitions.
- Search by email and filters for attention, unfinished initial setup, or full-year pass completed.

The page refreshes once a minute. Each signed-in account writes its own bounded shared status record; there is no global lock that serializes teachers' calendar updates. Records contain no event titles, descriptions, attendee lists or raw API error text. Calendar names are included to help identify the source being processed. Large records discard optional sample details to stay within the per-value limit. This storage design targets the requested approximately 50 accounts, not an unlimited historical audit database.

## Interpret status carefully

- Full-year pass completed means the app processed its planned ranges, including dates it skipped. It does not independently verify that all expected school days or free periods are correct. Review skipped dates and source selections.
- In progress can describe a new recurring full pass even when initial setup previously completed.
- Pending and source counts describe the last finished batch; the current stage can already belong to the next batch.
- No recent heartbeat means a running record has not updated for over 10 minutes. No recent check means an enabled account has not reported for over 30 minutes. These are investigation flags, not proof of a particular failure.
- A hard timeout can leave a running record without a final error. A trigger that fails before any user code starts cannot report its own error. Correlate the last report time with Apps Script Executions.
- Existing accounts appear when they next reach a reporting call after deployment. No teacher needs to restart completed setup just to register. Accounts whose triggers cannot start may remain absent; their earlier history cannot be reconstructed.
- Notification status and calculated totals are reported by the existing synchronization process. They do not prove mail delivery or verify the calendar independently.
- Monitoring is best effort: storage/reporting failures do not interrupt calendar writes. A missing or stale report can also indicate a reporting failure.

## Validation

The revised calendar/email checks and six deployment checks pass, plus eight admin checks. The existing 50-worker simulation passes. New checks cover server-side access denial, real sync reporting for multiple accounts, safe error capture and retention after recovery, stale heartbeat flags, storage failure isolation, distinct requested/paused/stalled states, Unicode size limits, and separate shared keys for 50 accounts.

All tests use simulated Google services. Live permissions, UI rendering in Google's iframe, API throughput and actual email delivery still need a deployed smoke test: open the admin page as Stella, confirm another account cannot open it, and check that an existing teacher appears after their next run.

The table has separate columns for teacher account, setup start time, initial completion time, current status, progress and latest issue. Times display in Central time. The account email identifies the teacher; display names are not requested. Initial completion time may be recovered from the last saved full scan for accounts that completed before this dashboard was installed. No diagnostic emails are sent to the developer.

## Compatibility comparison added

`npm test` now also runs tests/dashboard-compatibility.test.cjs. It compares the new code against the pre-dashboard source from GitHub commit 425563412aee27f1d4fd4f45b7a4370ee95ef7e6 (stored as a test-only fixture outside src). It checks unchanged helper functions/configuration, actual reconciliation and checkpoint code, results for 50 simulated teacher accounts with varying conflicts, removal/restoration after meeting changes, letter-day changes, dashboard-storage failures, December-to-January backfill over a marker gap, and upgrading during an unfinished setup. It also verifies teacher confirmation emails remain and developer emails are absent.

Copy package.json and the entire tests folder from this update, including tests/fixtures, so GitHub Actions runs these checks automatically. The historical fixture is not deployed to Apps Script because the deployment root remains src. No appsscript.json or workflow edit is required.

The calculation and write rules match the earlier version. Reporting adds PropertiesService calls and can affect run duration; the comparison is not a guarantee of Google's live timing, quotas, or permissions.

## Readability cleanup

The teacher page now lives in src/Index.html. Code.gs loads it with HtmlService.createHtmlOutputFromFile('Index'); the admin route still loads Admin.html. The previous WEB_HTML constant has been removed. Formatting and comments were added throughout the first-party code without changing population or trigger behavior. Extra tests compare all non-page backend code and the extracted browser code to the version before cleanup.
