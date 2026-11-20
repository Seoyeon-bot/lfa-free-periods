# Run the calendar tests on GitHub

## One-time setup

1. Sign in to GitHub and create a repository named `lfa-free-periods`. Choose the visibility you prefer and initialize it with a README.
2. Extract this ZIP. Upload the **contents** of `lfa-free-periods` into the repository root, not the ZIP or an extra parent folder.
3. Include `src`, `tests`, `scripts`, `docs`, `package.json`, `README.md`, `.gitignore`, and `.github/workflows/tests.yml`. On Mac, Command-Shift-period shows hidden folders in Finder.
4. If `.github` is missing after uploading, use **Add file > Create new file**, name it `.github/workflows/tests.yml`, and paste the supplied workflow. Commit to `main`.
5. Open **Actions > Test and deploy > Run workflow > main > Run workflow**. If Actions asks to enable workflows, enable them first.

Every push and pull request runs the same tests automatically. The manual button appears once the workflow is on the default branch.

## What you will see

- Two test jobs: Node 22 and Node 24.
- Green means tests passed. Red means a test or workflow step failed; open that step to read the error.
- Each run saves a downloadable log artifact and a short results summary.
- The deployment job is **skipped by default**. This is expected and does not mean testing failed.

The suite currently contains 62 checks: 55 calendar/account/recovery tests, 6 deployment configuration tests, and a 50-account concurrent simulation. Tests use fake Google services. No teacher account, calendar permissions, email, Google login, or repository secret is needed. They do not measure real Google API capacity or prove live email delivery.

## Run locally

Install Node 22 or later. In the extracted project directory run:

```sh
npm test
```

No `npm install` is needed because tests use Node built-ins.

## Optional deployment later

Follow [GITHUB-CICD.md](GITHUB-CICD.md). Add the three Google deployment secrets and explicitly set the Actions repository variable `ENABLE_APPS_SCRIPT_DEPLOY=true`. Deployment then runs only after passing tests on main. Test runs never require these secrets. Leave the variable unset to keep this repository test-only.

GitHub Actions runs tests; Google Apps Script continues to host the web app and perform scheduled calendar updates.
