# Portfolio project: test, then optionally deploy

Testing needs no Google credentials. Deployment is skipped unless the repository Actions variable `ENABLE_APPS_SCRIPT_DEPLOY` is set to `true`.

The optional deployment pipeline is: commit or PR > Node 22 and 24 tests > passing main commit > push source > create a version and update the existing Apps Script deployment. Failed tests stop the deploy job. Pull requests never receive deployment secrets or deploy. GitHub Pages is not used.

## 1. Publish the source

Create a GitHub repository named `lfa-free-periods`. Choose Public if you want the code visible in your portfolio. Do not include real calendar exports, teacher/student event details or Google authorization files.

Extract the ZIP and upload the contents of `lfa-free-periods` at the repository root. Include `.github/workflows/tests.yml`, `src`, `tests`, `scripts`, `docs`, `package.json`, README and `.gitignore`. Uploading the ZIP alone does not enable Actions. On Mac, Command-Shift-period reveals dotfiles in Finder. Alternatively create `.github/workflows/tests.yml` through GitHub's Add file > Create new file and paste the supplied workflow.

Use `main` as the default branch. If your branch is named `master`, rename it to `main` or deliberately update the workflow's branch condition and latest-commit check together.

For testing only, stop here: open **Actions > Test and deploy > Run workflow**. See [GITHUB-TESTING.md](GITHUB-TESTING.md). The remaining steps enable optional deployment.

## 2. Enable Google's Apps Script API

While signed in as the LFA account that owns the existing script and deployment, open:

https://script.google.com/home/usersettings

Enable **Google Apps Script API**. This is separate from the Calendar API used by the app. Keep Calendar v3 enabled too. Workspace policy may require an administrator to permit clasp authorization.

## 3. Authorize clasp once on your own computer

Install Node.js 22 or later. In Terminal run:

```sh
npm install --global @google/clasp@3.4.1
clasp login
```

Sign in to the LFA account that owns the Apps Script deployment and authorize it. This creates `~/.clasprc.json`. Clasp's management credentials are separate from the Calendar/Mail permissions each coworker grants to the web app.

Do not paste this credential file into a chat, source file, issue, README or screenshot. On Mac, the following copies its contents directly to your clipboard for the GitHub secret form without printing it:

```sh
pbcopy < ~/.clasprc.json
```

If you deliberately used a named credential profile or custom OAuth client, ensure the file contains the profile used by clasp's default account before configuring this workflow. This guide and workflow use the default `clasp login` profile. If Google blocks the default client, use an organization-approved OAuth client and adapt authentication with your administrator.

## 4. Add three GitHub Actions secrets

In the repository go to **Settings > Secrets and variables > Actions > New repository secret**.

| Secret name | Value |
| --- | --- |
| `CLASPRC_JSON` | Complete contents of `~/.clasprc.json` created by clasp login |
| `APPS_SCRIPT_ID` | Apps Script > Project Settings > IDs > Script ID |
| `APPS_SCRIPT_DEPLOYMENT_ID` | Apps Script > Deploy > Manage deployments > select the existing web app > Deployment ID |

The Script ID and deployment ID are different. Enter IDs only, without URLs. The deployment ID is the `AKfy...` portion between `/s/` and `/exec` in the existing shared link. Updating that ID preserves coworkers' website URL. It must belong to the same script and be editable by the authenticated account.

The workflow creates a `production` GitHub environment. You may create it first under Settings > Environments. To deploy automatically without another click, do not add a required-reviewer gate; if you choose a gate, deployment waits for that approval.

Keep Google credential files out of git; the provided `.gitignore` excludes them. A public repository can run the workflow while keeping Actions secrets private. Only trusted changes should enter main, because main deploys with your authorization.

After adding the three secrets, go to **Settings > Secrets and variables > Actions > Variables**, and add `ENABLE_APPS_SCRIPT_DEPLOY` with value `true`. Only then can deployment run.

## 5. Run the pipeline

Go to **Actions > Test and deploy > Run workflow**, select `main`, then Run. Both Node test jobs must pass before the deploy job starts. After setup, pushing/merging to main triggers the same pipeline automatically.

The deployment job installs the pinned clasp CLI, validates secrets without printing them, writes temporary private credentials, checks that its commit is still the current main head, pushes only the `src` folder, and updates the existing deployment. Credentials are cleaned up even after failure. An older run skips deploying if it sees a newer main commit before the push. Deployment jobs are serialized.

Do not edit the same Apps Script source manually while this pipeline is deploying. `clasp push --force` replaces remote source with the tested repository version. Take an initial backup of any additional server files you want to retain.

## What the results mean

| Result | Meaning |
| --- | --- |
| Test job red | A test failed; deployment is skipped |
| Tests green, deploy red | Tests passed but credentials, API access, deployment ID, policy or deployment failed; open that step's error |
| Tests and deploy green | GitHub successfully ran the checks and deployment commands; verify the live app separately |
| Deploy skipped on a PR | Expected: PRs test but do not deploy |

Automated deployment cannot silently authorize new Calendar/Mail scopes for coworkers. If a change adds permissions, users still need to revisit the site and approve Google's authorization screen. Live triggers, mail delivery and full-year output remain acceptance checks, not claims established by the mock suite.

## Demonstrate CI in your portfolio

1. Create a branch such as `demo/ci-failure`.
2. Temporarily add a deliberately failing assertion to a test and open a PR. The test job turns red; this branch cannot deploy.
3. Fix/remove the deliberate failure, push again, and capture the green PR checks.
4. Merge the working PR. Main runs tests again, then deploys if they pass.
5. Record the actual run URL, commit and resulting deployment version. Explain the failing test and fix; do not claim a green deployment before it happens.

Suggested portfolio wording after actual verification: "Built an AI-assisted Google Apps Script scheduling app with per-user calendars, 62 automated checks, and a GitHub Actions pipeline that tests changes before updating an existing web-app deployment."

## Troubleshooting and rollback

- Missing secret: add all three exact names above.
- Unauthorized/expired credentials: run clasp login again locally and replace `CLASPRC_JSON`.
- Script API disabled: enable the user's Apps Script API and any required Cloud project policy/API setting.
- Wrong project or deployment: recopy both IDs from the intended existing project.
- Tests pass but website still looks old: inspect whether the deploy job failed or skipped; confirm it targets the same deployment URL.
- New scopes: approve permissions by reopening the web app; CI deployment does not grant user consent.
- Rollback: use Apps Script Manage deployments to point the same deployment to the prior version, and revert the bad GitHub commit so a subsequent automatic deployment does not restore it.

## Primary references

- https://developers.google.com/apps-script/guides/clasp
- https://github.com/google/clasp (commands and authentication)
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs (job dependencies)

The current 62 checks passed locally on November 17, 2026. A real GitHub Actions deployment has not been executed by this package's authoring session; it requires your repository and Google authorization.
