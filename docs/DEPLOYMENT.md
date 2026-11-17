# Deploy and use

## Google Apps Script

1. Open your existing Apps Script project. Keep a copy of its current code before replacing it.
2. Replace all of Code.gs with `src/Code.gs`. The website is embedded; do not add a second copy of these functions.
3. Enable Google Calendar API under Services (Calendar v3). For a standard Google Cloud project, enable Calendar API in that project too.
4. Under Project Settings, show the appsscript.json manifest. Compare/merge `src/appsscript.json` with your project's settings. Review the school calendar ID, allowed domain, admin email list, bell times and overrides.
5. Deploy > Manage deployments > choose the web app used by coworkers > pencil > New version. Execute as **User accessing the web app**; restrict access to the LFA organization. Deploy.
6. Keep the existing `/exec` URL. Updating an existing deployment avoids changing the shared link. Saving code alone does not update the deployed version.
7. Open the `/exec` link with your LFA account. Authorize requested Google permissions and click Add/Update my free periods once.

This version adds `https://www.googleapis.com/auth/script.send_mail`. Existing users must revisit the deployed web app, approve the new send-email permission when Google requests it, and click Update once. Include this scope if you maintain an explicit manifest. Background execution cannot approve new permissions on the user's behalf. No Gmail inbox-read scope is needed.

Once activation has enabled background updates, users can close the page. Their initial school-year setup sends a completion email only after a successful run reports zero pending changes. The email identifies skipped dates as incomplete coverage. A later calendar change does not send another setup email for the same year/output. If triggers fail, setup will not finish and no completion email is promised; inspect Executions.

GitHub stores/tests the source. Apps Script hosts this app; GitHub Pages cannot run this server code. This package now includes automatic deployment from passing `main` commits, after the one-time setup in GITHUB-CICD.md. The manual steps above remain useful for initial setup and recovery. Once CI is enabled, edit source in GitHub; the next deployment overwrites remote source with `src`.

## Coworkers

Share the web-app `/exec` URL, not your personal generated-calendar link. Each coworker:

1. Signs in with their own LFA Google account and authorizes the application.
2. Keeps their class and other relevant calendars checked in Google Calendar. Activation automatically adds/selects the configured letter-day calendar; their account must already have permission to see its event details.
3. Confirms their own email and clicks Add my free periods.
4. Sees their own LFA Free Periods calendar. They do not need Apps Script editor access or a copy of the script.

Domain permission and Google authorization are still required; an email address alone grants no access. Each person must complete activation themselves. Each user's successful activation installs their own update triggers.

## Calendar link popup

The previous link used `cid=<generated-calendar-id>` and forced Google account slot `/u/0/`. Google can interpret that as an Add calendar request, particularly when a personal Google account is in that slot. The screenshot's identifier matches the generated calendar, not a new school source.

The repository version opens normal Google Calendar with the authenticated account as an account hint, without `cid`. This change is tested as URL construction but still needs a browser check after deployment. If Google chooses a different account, switch to LFA manually. Do not subscribe other people to your personal output calendar.

## Live acceptance

After the initial annual pass completes, verify that routine status messages say **Nearby check** and cover today plus the next 35 days. A full-year check recurs every six hours to cover farther-out changes. Nearby runs preserve generated blocks outside the read range. Newly booked periods in the nearby range should be removed after the next successful maintenance check. Before initial setup completes, runs still process annual batches; no immediate-removal promise is made.

Use the checklist in TESTING.md. Review Apps Script Executions for failed clock/calendarChanged runs. Fix authorization or quotas based on the actual error. The reported February cutoff has not been diagnosed as fixed by these offline tests.

## Rollback

In Manage deployments, select the prior version and redeploy. Keep the same deployment URL. Generated entries remain until a successful reconciliation removes/adjusts them. Do not delete source school or class calendars.

Subscription update: replace Code.gs and redeploy a new version, then have users click Add/Update. No manifest scope change is needed because the app already requests calendar access. The Calendar ID is authoritative even if a user has renamed the calendar.

Developer alerts use the existing MailApp send-mail scope; no additional scope is introduced. Redeploy Code.gs. Users who have not previously approved send-mail access must authorize it. Reporting goes from the authorized user account to the configured developer address; external-mail organization policy may affect delivery. This version discloses that technical status/account information is emailed. It does not send event lists or raw error messages. Google Executions remains the source for hard runtime termination and exact error diagnosis.
