# LFA Free Periods

The HTML is now separate from the calendar code. This version keeps the dashboard-only reporting and the teacher's completion email.

## Where the code is

- src/Code.gs: reads calendars, calculates free periods, saves progress, sends the teacher's confirmation, and reports status for the admin table.
- src/Index.html: the teacher's page, including its styles and browser JavaScript.
- src/Admin.html: the admin table, including its styles and browser JavaScript.
- src/appsscript.json: the existing Apps Script configuration and permissions.
- tests: offline tests. These do not contact Google or change a teacher's real calendar.
- scripts: the existing deployment helper, formatted for readability.

The code uses indentation, separate statements, and short comments. The page layout, text, calendar rules, batch limits, saved progress, trigger behavior, and email behavior match the previous dashboard version. The only backend UI change is loading Index.html with createHtmlOutputFromFile instead of keeping the page inside WEB_HTML.

## Update your existing repository

Copy src, tests, scripts, docs, package.json and README.md into your existing lfa-free-periods repository. Replace the matching files and keep your existing GitHub workflow and deployment secrets.

Run these commands from your repository folder:

```bash
npm test
git add src tests scripts docs package.json README.md
git commit -m "Separate HTML and format calendar code"
git push origin main
```

With your existing deployment variable enabled, the GitHub workflow tests and deploys the update. Wait for deployment success before opening the web app. Index.html and Admin.html both need to be present in src.

## Checks included

- Compare the calendar helpers and reconciliation/checkpoints with the earlier GitHub source.
- Compare all non-page backend logic with the dashboard version before formatting, ignoring comments and formatting.
- Compare the browser JavaScript before and after moving the page into Index.html.
- Check normal and admin page loading, and deny admin-page access to other accounts.
- Run the existing calendar, email, retry, permissions, batching, holiday-gap and saved-progress upgrade tests.
- Compare output for 50 simulated teacher accounts, including when dashboard storage fails.
- Run the existing 50-worker concurrency simulation.

The small Acorn parser under tests/vendor supports code comparisons and is included with its license. It and the historical fixtures stay outside src and are not uploaded to Apps Script. No additional npm install step is needed to run these tests.

Tests use fake Google services. They do not verify live Google API timing, quotas, permissions or email delivery. This readability cleanup does not fix the separately reported "Unable to talk to trigger service" error; trigger handling has been kept unchanged.