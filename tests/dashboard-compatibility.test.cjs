// Offline comparison against the exact pre-dashboard source from commit
// 425563412aee27f1d4fd4f45b7a4370ee95ef7e6. Never contacts Google.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const original = fs.readFileSync(
  path.join(__dirname, 'fixtures/pre-dashboard-Code.gs.txt'),
  'utf8'
);
const current = fs.readFileSync(path.join(root, 'src/Code.gs'), 'utf8');
const load = (code) => {
  const ctx = vm.createContext({});
  vm.runInContext(code, ctx);
  return ctx;
};
const before = load(original),
  after = load(current);
const acorn = require('./vendor/acorn.cjs');
// Compare parsed code so whitespace and comments do not count as logic changes.
const parse = (code) => acorn.parse(code, { ecmaVersion: 2022 });
const clean = (node) =>
  JSON.parse(
    JSON.stringify(node, (key, value) =>
      ['start', 'end', 'raw'].includes(key) ? undefined : value
    )
  );
const logic = (code) => clean(parse(code));
const unchanged = [
  'identity_',
  'calendarList_',
  'schoolId_',
  'ensureSchoolSubscribed_',
  'sources_',
  'activate_',
  'refreshNow',
  'classifyFailure_',
  'syncWindow_',
  'notifySetupComplete_',
  'managedKey_',
  'events_',
  'color_',
  'calendarUrl_',
  'range_',
  'overlaps_',
  'letter_',
  'plan_',
  'bellSchedule_',
  'addDays_',
  'at_',
  'admin_',
  'dateKey_',
  'getDateSchedule',
  'saveDateSchedule',
  'resetDateSchedule',
  'storedOverrides_',
  'ensureOutputListed_',
  'sourceEvents_',
  'calendarChanged',
  'installTriggers_',
  'notFound_',
  'readCalendar_',
  'outputCalendar_',
  'academicWindow_',
  'busyResponse_'
];
for (const name of unchanged)
  assert.deepEqual(
    logic(after[name].toString()),
    logic(before[name].toString()),
    name + ' population/helper function changed'
  );
const config = (ctx) =>
  JSON.parse(vm.runInContext('JSON.stringify(SCHOOL)', ctx));
const a = config(before),
  b = config(after);
delete a.developerEmail;
assert.deepEqual(b, a, 'Only developer email config may change');
// Compare the actual write/reconciliation and checkpoint code, not just helpers.
function writes(code) {
  const body = parse(code).body.find(
    (n) => n.type === 'FunctionDeclaration' && n.id.name === 'syncFreePeriods'
  ).body.body;
  const statements = body.find((n) => n.type === 'TryStatement').block.body;
  const declares = (n, name) =>
    n.type === 'VariableDeclaration' &&
    n.declarations.some((d) => d.id.name === name);
  const start = statements.findIndex((n) => declares(n, 'existing'));
  const end = statements.findIndex((n) => declares(n, 'stalled'));
  assert.ok(
    start >= 0 && end > start,
    'Calendar write/checkpoint section must be found'
  );
  return clean(
    statements
      .slice(start, end)
      .filter(
        (n) =>
          !(
            n.type === 'ExpressionStatement' &&
            n.expression.type === 'CallExpression' &&
            n.expression.callee.name === 'monitor_'
          )
      )
  );
}
assert.deepEqual(
  writes(current),
  writes(original),
  'Calendar write ordering, reconciliation, limits or checkpoints changed'
);
console.log(
  'PASS 36 production helpers, population configuration, calendar writes and checkpoint logic match the pre-dashboard version.'
);
// Reuse the fake Calendar infrastructure, not the tests, to run both complete
// implementations through identical real activate/sync calls.
let harness = fs.readFileSync(
  path.join(__dirname, 'calendar.test.cjs'),
  'utf8'
);
harness = harness.slice(0, harness.indexOf('// BEGIN REGRESSION TESTS'));
function instance(code, broken = false) {
  const sandbox = {
    require,
    __dirname,
    process: { argv: ['node', 'test', 'fixture'] },
    console: { log() {} },
    Date,
    Map,
    Set
  };
  // Override only the harness's source-file read, retaining its production mocks.
  sandbox.require = (name) =>
    name === 'node:fs' ? { readFileSync: () => code } : require(name);
  vm.runInNewContext(
    harness +
      `\nglobalThis.api={call,as,props,calendars,storeFor,output,event,marker,sentMail,context,sharedStore,getSeq:()=>seq,setSeq:n=>{seq=n;}};`,
    sandbox
  );
  const h = sandbox.api;
  if (broken)
    h.sharedStore.setProperty = () => {
      throw new Error('Dashboard storage quota exhausted');
    };
  return h;
}
const plain = (x) => JSON.parse(JSON.stringify(x));
function snapshot(h) {
  return {
    events: h
      .output()
      .sort((a, b) => a.start.dateTime.localeCompare(b.start.dateTime)),
    state: Object.fromEntries(
      [
        'OUTPUT_CALENDAR_ID',
        'FULL_SCAN_STATE',
        'FULL_SYNC_COMPLETE',
        'FULL_FREE_COUNT',
        'FULL_SKIPPED_COUNT',
        'NOTIFIED_SETUP'
      ].map((k) => [k, h.storeFor(h.email).getProperty(k)])
    ),
    confirmations: h.sentMail.filter((m) => m.to === h.email)
  };
}
function drain(h) {
  let r;
  for (let i = 0; i < 30; i++) {
    r = h.call('syncFreePeriods()');
    if (!r.pending && !r.setupPending) return;
  }
  throw new Error('Population did not finish');
}
function profile(h, i) {
  h.email = 'faculty' + i + '@lfanet.org';
  h.as(h.email);
  h.calendars.set(h.email, []);
  const school = codeSchool(h);
  h.calendars.set(school, [
    {
      ...h.marker(i % 2 ? 'G' : 'B'),
      summary: i % 2 ? 'G day with (Tuesday with break)' : 'B-Day'
    }
  ]);
  const booked = [];
  for (let k = 0; k < i % 5; k++)
    booked.push(
      h.event(
        'Class ' + k,
        ['08:10', '08:55', '10:00', '10:45'][k],
        ['08:55', '09:40', '10:45', '11:30'][k]
      )
    );
  h.calendars.set('classes-b', booked);
  h.calendars.set('hidden-b', [h.event('Hidden booking', '08:00', '15:00')]);
  h.call('SCHOOL.maxMutationsPerRun=2');
  h.call('activate(' + JSON.stringify(h.email) + ')');
  drain(h);
  const initial = snapshot(h);
  h.calendars.set(h.email, [h.event('New meeting', '12:00', '12:45')]);
  drain(h);
  const meeting = snapshot(h);
  h.calendars.set(h.email, []);
  drain(h);
  const restored = snapshot(h);
  h.calendars.set(school, [h.marker('D')]);
  drain(h);
  const changedLetter = snapshot(h);
  return { initial, meeting, restored, changedLetter };
}
function codeSchool(h) {
  return h.call('SCHOOL.schoolCalendarId');
}
for (const broken of [false, true]) {
  const old = instance(original),
    next = instance(current, broken);
  for (let i = 0; i < 50; i++)
    assert.deepEqual(
      plain(profile(next, i)),
      plain(profile(old, i)),
      'Teacher ' + i + ' differs; dashboard unavailable=' + broken
    );
  assert.ok(
    next.sentMail.every((m) => m.to.endsWith('@lfanet.org')),
    'Developer diagnostic mail was sent'
  );
  console.log(
    'PASS 50 teacher schedules match old population, batch completion, meeting removal/restoration, day changes and confirmation emails; dashboard unavailable=' +
      broken +
      '.'
  );
}
// Holiday gap: missing markers must not stop progress before January.
for (const code of [original, current]) {
  const h = instance(code);
  h.email = 'faculty.holiday@lfanet.org';
  h.as(h.email);
  h.calendars.set(h.email, []);
  h.calendars.set('classes-b', []);
  h.calendars.set(codeSchool(h), [
    {
      summary: 'E-Day',
      start: { date: '2026-12-10' },
      end: { date: '2026-12-11' }
    },
    {
      summary: 'A-Day',
      start: { date: '2027-01-05' },
      end: { date: '2027-01-06' }
    }
  ]);
  h.call(
    "academicWindow_=()=>({start:'2026-12-10',end:'2027-01-06'}); SCHOOL.scanChunkDays=10; SCHOOL.maxMutationsPerRun=2;"
  );
  h.call('activate(' + JSON.stringify(h.email) + ')');
  drain(h);
  assert.ok(
    h.output().some((e) => e.start.dateTime.startsWith('2027-01-05')),
    'January population missing after holiday gap'
  );
  assert.ok(
    h.storeFor(h.email).getProperty('FULL_SYNC_COMPLETE'),
    'Full scan never completed'
  );
}
console.log(
  'PASS Both versions finish December–January backfill across the no-letter-day holiday gap.'
);

// Simulate uploading the dashboard while an older setup has saved partial work.
{
  const old = instance(original),
    next = instance(current);
  old.email = 'faculty.upgrade@lfanet.org';
  old.as(old.email);
  old.calendars.set(old.email, []);
  old.calendars.set('classes-b', []);
  old.calendars.set(codeSchool(old), [old.marker('G')]);
  old.call('SCHOOL.maxMutationsPerRun=2');
  old.call('activate(' + JSON.stringify(old.email) + ')');
  assert.equal(
    old.output().length,
    2,
    'Fixture must stop partway through population'
  );
  assert.equal(old.storeFor(old.email).getProperty('FULL_SYNC_COMPLETE'), null);
  next.email = old.email;
  next.as(next.email);
  next.props.clear();
  next.calendars.clear();
  for (const [key, value] of old.props) next.props.set(key, plain(value));
  for (const [key, value] of old.calendars)
    next.calendars.set(key, plain(value));
  next.setSeq(old.getSeq());
  next.call('SCHOOL.maxMutationsPerRun=2');
  drain(old);
  drain(next);
  assert.deepEqual(
    plain(snapshot(next)),
    plain(snapshot(old)),
    'Upgrade changed resumed output or completion state'
  );
  assert.equal(next.output().length, 6);
  assert.equal(new Set(next.output().map((e) => e.id)).size, 6);
  assert.equal(next.sentMail.filter((m) => m.to === next.email).length, 1);
  console.log(
    'PASS Switching versions during partial setup resumes existing progress without duplicate blocks and sends one teacher completion email.'
  );
}
