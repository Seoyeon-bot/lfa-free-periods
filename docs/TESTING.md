# Test evidence and acceptance

## Automated tests

`npm test` loads the real Apps Script file into a Node VM. Google services are simulated in memory. The real identity checks, source selection, planner, bell schedules, output creation and event reconciliation execute. Only trigger installation and the annual window are replaced for the one-day integration fixture. A separate test loads the original annual-window function unchanged.

Fixture: Monday January 11, 2027 changes from F day to G day. Teacher A has no class; Teacher B has a class at 10:00-10:45. On G day, that class overlaps G2 (09:25-10:10) and G3 (10:30-11:15); both are blocked for B. A later meeting at 12:00-12:45 removes A's G5 without changing B's availability.

| # | Test |
| --- | --- |
| 1 | Teacher A gets their own output calendar |
| 2 | Teacher B gets separate output and class-dependent availability |
| 3 | Another teacher's typed email cannot impersonate them |
| 4 | Owner-executed deployment is rejected for a different visitor |
| 5 | F to G changes labels/times and removes obsolete periods 7/8 |
| 6 | B's actual class times block newly overlapping G periods |
| 7 | New meeting removes only the booked teacher's block |
| 8 | Deleted meeting restores that block |
| 9 | Repeated successful sync creates no duplicates or needless writes |
| 10 | Conflicting F/G markers remove misleading generated blocks |
| 11 | Missing markers produce no guessed blocks |
| 12 | All event writes target generated output calendars |
| 13 | Calendar link uses signed-in email and avoids subscription cid |
| 14 | Academic window rolls over correctly in June |
| 15 | All A-G schedules, Tuesday/ASM exceptions and late starts |
| 16 | Partial overlap blocks full period; adjacent boundary does not |
| 17 | Hidden calendar exclusion, primary inclusion, output exclusion |
| 18 | Mutation cap resumes across runs without duplicates |
| 19 | Completion notices target only each authenticated account |
| 20 | Repeat activation/check does not repeat the email |
| 21 | No completion notice until final batch finishes |
| 22 | Failed email preserves calendar completion and retries |
| 23 | Mail quota exhaustion delays notification without failing sync |
| 24 | Email identifies skipped dates without claiming complete coverage |
| 25 | Saved status survives reopening and remains user-specific |
| 26 | Completed initial setup selects today plus the next 35 days |
| 27 | Initial setup and changed year select full academic window |
| 28 | Full-year pass is due again after the configured interval |
| 29 | Nearby booking removes its block while farther-out blocks remain untouched |

These tests do not use the real school calendar or require administrator privileges. To reproduce an F-to-G change, edit only the mocked marker in the test fixture. Do not change real All LFA Events for a test.

## Live acceptance checklist (not executed by this package)

- [ ] Deploy an identified version under User accessing the web app.
- [ ] Activate with two consenting LFA accounts; verify distinct output ownership.
- [ ] Verify a real class blocks the appropriate period for each user.
- [ ] Add a temporary meeting to your own main calendar during a currently free future period. After a successful run, verify its free block disappears.
- [ ] Delete that temporary meeting and verify restoration after a successful run.
- [ ] Verify the Open my calendar link reaches the correct LFA account without an Add calendar dialog.
- [ ] Check Apps Script Executions: clock and event-trigger runs succeed after closing the webpage.
- [ ] Verify generated entries through May wherever markers and confirmed bell schedules exist, including dates after February 18.
- [ ] Review any skipped schedule warnings and confirm special-date overrides.
- [ ] Approve the new send-email permission, close the website after activation, and verify one completion email after all pending changes finish. Check Spam if necessary.
- [ ] Verify repeat updates do not generate repeated setup confirmations; confirm skipped dates are disclosed.

Local execution on November 14, 2026: **35 tests passed** (29 calendar tests plus 6 deployment-configuration tests), Node v23.3.0. GitHub CI is configured for Node 22/24 but has not been run here. Email is mocked; no real notification was sent by this suite. The original integration cases force an annual pass to isolate reconciliation; additional cases exercise the 35-day selector and nearby reconciliation. The event-list mock enforces read-window boundaries. Deployment tests cover required secrets, malformed JSON and IDs, temporary-file permissions/cleanup, no writes on failed validation, and workflow dependency/branch configuration. They do not execute authenticated clasp commands or prove live deployment.

Record deployment version, test dates, expected/actual outcomes and sanitized evidence. Do not publish teacher/student event details.

Subscription update: 41 local tests passed (35 calendar + 6 deployment configuration). Six new cases cover missing-calendar insertion/selection, personal-name reuse, hidden/unchecked selection, duplicate-insertion races, denied sharing, and busy-only access rejection. Tests use mocks; a real coworker subscription still needs live acceptance.

November 17, 2026 parser update: **46 local tests passed** (40 calendar and 6 deployment tests). New cases cover annotated/typo-containing B and G titles, all A-G annotated schedule equivalence, real Tuesday timing and G late start, unrelated/ambiguous titles, and reconciliation after a marker gains a note. This fixes title recognition only; unrelated source-event overblocking remains a separate diagnostic issue.

Developer notification update: **51 local tests passed** (45 calendar/notification + 6 deployment). New cases cover exact recipient, per-user throttling, failure stage/category with raw private error excluded, background-error alerts, and mail failure isolation. Mail delivery remains mocked.

Success-alert update: **54 local tests passed** (48 calendar/notification and 6 deployment). New tests verify success waits for the final batch, repeat checks do not repeat it, and skipped dates are disclosed. Email delivery is simulated.

Scaling/checkpoint update: **58 local checks passed**: 51 calendar/notification/checkpoint tests, six deployment configuration tests and one test executing 50 concurrent simulated teachers in real Node worker threads. New cases verify exact year coverage, upcoming-date priority, checkpoint advance with final-only completion email, quota backoff without extra reads, correct isolated 50-user outputs, and no cross-user writes. Google services are mocks; this is not a live 50-account load/latency/quota test. Website JavaScript was syntax-checked; the diagnostics panel still needs browser/live validation.
