# LFA Free Periods — private admin reporting

Only the Google account seoyeon.choi@lfanet.org is allowed to see the admin link or use the admin page and data endpoint. The server checks the signed-in account before rendering the link. An email typed into the form is not used for admin authorization.

## Install

Copy src, tests, scripts, docs, package.json and README.md into your existing repository, replacing matching files. Keep your existing GitHub workflow and secrets. Update Code.gs, Index.html and Admin.html together.

From the repository folder:

```bash
npm test
git add src tests scripts docs package.json README.md
git commit -m "Restrict admin rendering and remove private calendar diagnostics"
git push origin main
```

Wait for the GitHub test and deployment jobs to succeed, then close/reopen the app page. The new server-rendered Index.html must be deployed with the matching Code.gs. Other accounts do not receive the admin link markup, and direct requests to admin endpoints are rejected. Existing browser tabs can show their previously loaded page until reopened.

## Admin reports

The table keeps the LFA account email, setup request time, completion time, current stage, progress counts, last successful check, general error category/code/time, and short technical activity history. It does not include source calendar names or IDs, source event counts, event titles, meeting descriptions, attendees, or skipped-date details. Stages containing calendar names are replaced with a general availability-check stage. The last error message is chosen from a fixed list rather than copied from a Google error.

A later successful check is shown after an earlier issue, when recorded. A missing heartbeat is an investigation flag, not proof of an exact stop time or reason.

Older shared monitoring records are filtered before being returned and rewritten without the removed details when possible. This happens on admin dashboard reads and on each account's next reporting write. It does not delete historical emails or Google execution logs. User-specific diagnostic data remains available to that user in their own page.

## Emails

The application source under src has no developer email recipient and no Gmail or misspelled Gmial address. Its only MailApp.sendEmail call sends the authenticated LFA teacher their setup-completion email. There is no CC or BCC. Historical source fixtures under tests contain the earlier version only for offline comparison; these are not deployed and their tests use fake MailApp services.

## Verification

Run npm test for the existing calendar, dashboard, HTML-routing and compatibility checks, plus admin-privacy.test.cjs. Tests verify server-rendered link omission for other teachers, endpoint access denial, removal of private fields from older/new reports, preservation of useful times and technical causes, and the remaining email recipient. Existing population comparisons cover 50 simulated teachers and a 50-worker simulation.

Calendar calculation, event writes, batch limits, saved progress, teacher completion emails and trigger management are unchanged. Admin reporting, privacy filtering and page rendering are the intended changes. Live Google permissions, timing, quotas, and the previously reported trigger-service error are not guaranteed by offline tests.
