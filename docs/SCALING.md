# Workload and rollout limits

The original implementation reread the entire August-May school year before every mutation batch. Small batches alone did not bound read work. At 50 users this amplified read traffic and runtime. The code now saves a per-user scan checkpoint and reads at most 35 calendar days for each initial/full-year range. It fills upcoming dates first and backfills earlier dates afterward. Routine maintenance uses today plus 35 days after setup completes; full-year rescans begin every six hours and run as a sequence of short ranges.

The one-minute fallback is a requested trigger schedule, not a latency guarantee. Calendar-change watches may also trigger checks where Google permits them. Work for one account is protected by a user lock. Other accounts can execute concurrently and each has separate settings, checkpoint, notifications and output calendar. Source calendars remain read only. Google can still apply per-project as well as per-user limits.

Quota errors leave the checkpoint intact and set a per-user delayed retry using exponential backoff plus jitter. Invalid credentials/sharing need intervention; retrying cannot grant access. If no writes finish despite pending work, the app records the condition and sends a throttled developer alert. Hard termination still needs Apps Script Executions inspection.

## What was tested

Fifty real Node workers entered production sync simultaneously using fake Google services. Each produced its own seven expected free blocks for a one-day fixture, with different busy periods for alternating teachers, and no writes to another account or source calendar. This validates the modeled concurrency and isolation logic. It does not measure actual Google throughput, provide a completion-time guarantee or prove Apps Script has enough runtime/API quota for 50 staff.

For scale context only: with 12 source calendars per teacher, one 50-user wave implies roughly 600 source-list operations before pagination or busy-only requests. With a 100-mutation cap, the same wave can attempt up to 5,000 output changes. These are arithmetic workload examples, not measured Google capacity. Removing the handful of notification emails does not remove that Calendar API work.

## Before inviting 50 teachers

1. Deploy to a test Apps Script project or controlled pilot first. Verify Execute as User accessing the web app, not the owner.
2. Run five consenting teachers and record API calls, execution duration, errors, number of calendars, mutations and total setup time. Inspect quota utilization for the actual Cloud project and trigger runtime per user.
3. Test a new meeting and its cancellation inside the nearby window after setup. Verify the removal/restoration delay and source-calendar correctness.
4. Expand to 10, then 25, then 50 only if quota headroom and observed latency are acceptable. Spread initial activations rather than onboarding all 50 at once.
5. Use explicit acceptance targets, e.g. the pilot's measured completion time and measured meeting-update delay. Do not promise a one-minute update or full-year completion time based on an offline test.

If sustained workload exceeds Apps Script limits, migrate scheduling/execution to a durable backend queue with per-user authorization, project-level rate control, incremental Calendar sync and monitoring. That backend is not implemented by this package.

## Missing blocks are not always a capacity problem

The diagnostics panel lists source-calendar names and event counts, the current range, pending writes and skipped dates. A busy shared calendar can legitimately block almost every period under the current all-checked-calendar rule. The app cannot infer personal participation from a shared calendar booking without a different explicit source/filter policy. Likewise, missing markers or unconfirmed special schedules skip dates. A setup-request email alone proves neither failure nor success.

Primary sources:
- https://developers.google.com/apps-script/reference/lock/lock-service
- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/workspace/calendar/api/guides/quota

## Additional error handling

Temporary Google server/network failures (500, 502, 503, 504 and timeout messages), as well as rate limits, save progress and use delayed retries with jitter. Permission failures show an action message instead of pretending setup completed. A 403 rate-limit error is classified before a 403 permission error. Manual refresh presents a concise message; raw technical details remain in per-user diagnostics. Successful checks clear old issue status. This does not increase Google project quotas or constitute a live 50-person capacity test.
