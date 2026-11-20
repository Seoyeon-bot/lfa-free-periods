// These checks use fake identities and properties. No Google requests are made.
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const acorn = require('./vendor/acorn.cjs');
const src = path.join(__dirname, '../src');
const source = fs.readFileSync(path.join(src, 'Code.gs'), 'utf8');
let email = 'teacher@lfanet.org',
  active = email;
const shared = {};
const personal = {};
const store = (value) => ({
  getProperty: (k) => value[k] || null,
  setProperty(k, v) {
    value[k] = v;
    return this;
  },
  deleteProperty(k) {
    delete value[k];
    return this;
  },
  getProperties: () => ({ ...value })
});
const ctx = vm.createContext({
  Date,
  Utilities: { formatDate: () => '2026-11-19' },
  Session: {
    getEffectiveUser: () => ({ getEmail: () => email }),
    getActiveUser: () => ({ getEmail: () => active })
  },
  PropertiesService: {
    getScriptProperties: () => store(shared),
    getUserProperties: () => store(personal)
  },
  ScriptApp: {
    getService: () => ({ getUrl: () => 'https://example.test/exec' })
  }
});
vm.runInContext(source, ctx);
const call = (code) => vm.runInContext(code, ctx);
assert.deepEqual(JSON.parse(call('JSON.stringify(SCHOOL.adminEmails)')), [
  'seoyeon.choi@lfanet.org'
]);
for (const user of [
  'teacher@lfanet.org',
  'noha.mahmoud@lfanet.org',
  'pmakovec@lfanet.org'
]) {
  email = active = user;
  assert.throws(() => ctx.getAdminStatus(), /administrator/);
  assert.throws(() => ctx.getAdminUrl(), /administrator/);
  assert.equal(ctx.getSetup().isAdmin, false);
}
email = 'seoyeon.choi@lfanet.org';
active = 'teacher@lfanet.org';
assert.throws(() => ctx.getAdminStatus(), /Deployment/);
console.log(
  'PASS Only the authenticated admin account can access dashboard endpoints; typing an email or mismatched identity does not grant access.'
);

const secret = 'PRIVATE_CALENDAR_NAME';
const raw = {
  email: 'teacher@lfanet.org',
  state: 'error',
  stage: 'Reading calendar: ' + secret,
  updatedAt: '2026-11-20T03:00:00.000Z',
  requestedAt: '2026-11-20T02:00:00.000Z',
  initialCompletionAt: '2026-11-20T02:30:00.000Z',
  sources: [{ name: secret, id: 'PRIVATE_CALENDAR_ID', events: 432 }],
  setupKey: '2026-08-01/2027-06-01/PRIVATE_OUTPUT_ID',
  skippedSample: ['2026-11-19: ' + secret],
  eventTitle: 'PRIVATE_MEETING',
  history: [
    {
      at: '2026-11-20T03:00:00.000Z',
      state: 'error',
      stage: 'Reading calendar: ' + secret
    }
  ],
  lastIssue: {
    at: '2026-11-20T03:00:00.000Z',
    stage: 'Reading calendar: ' + secret,
    category: 'access',
    message: secret,
    code: '403'
  }
};
shared.MONITOR_V1_teacher = JSON.stringify(raw);
email = active = 'seoyeon.choi@lfanet.org';
const result = ctx.getAdminStatus(),
  serialized = JSON.stringify(result);
for (const forbidden of [
  secret,
  'PRIVATE_CALENDAR_ID',
  'PRIVATE_OUTPUT_ID',
  'PRIVATE_MEETING',
  'sources',
  'skippedSample'
]) {
  assert.ok(
    !serialized.includes(forbidden),
    'Private detail in endpoint response: ' + forbidden
  );
  assert.ok(
    !shared.MONITOR_V1_teacher.includes(forbidden),
    'Legacy shared record not cleaned: ' + forbidden
  );
}
const row = result.users[0];
assert.equal(row.email, raw.email);
assert.equal(row.requestedAt, raw.requestedAt);
assert.equal(row.initialCompletionAt, raw.initialCompletionAt);
assert.equal(row.lastIssue.category, 'access');
assert.equal(row.lastIssue.code, '403');
assert.equal(row.stage, 'Checking availability');
console.log(
  'PASS Legacy shared reports are cleaned; private source names, IDs, counts, skipped details and raw messages never reach the dashboard.'
);

email = active = 'teacher@lfanet.org';
ctx.monitor_(
  'error',
  'Reading calendar: ' + secret,
  new Error('Unable to talk to trigger service PRIVATE_MEETING')
);
const newRow = JSON.parse(shared['MONITOR_V1_' + email]);
assert.equal(newRow.lastIssue.category, 'trigger_service');
assert.ok(!JSON.stringify(newRow).includes('PRIVATE_'));
assert.equal(newRow.sources, undefined);
assert.equal(newRow.setupKey, undefined);
console.log(
  'PASS New reports store safe technical causes and timestamps without source-calendar details.'
);

// Inspect the actual application's email calls, not a test fixture.
const calls = [];
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.name === 'sendEmail'
  )
    calls.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(acorn.parse(source, { ecmaVersion: 2022 }));
assert.equal(calls.length, 1);
assert.equal(calls[0].callee.object.name, 'MailApp');
const fields = calls[0].arguments[0].properties;
assert.equal(fields.find((p) => p.key.name === 'to').value.name, 'email');
assert.ok(!fields.some((p) => ['cc', 'bcc'].includes(p.key.name)));
assert.ok(!/@(?:gmail|gmial)\.com/i.test(source));
assert.ok(!source.includes('developerAlert_'));
assert.ok(
  !fs.readFileSync(path.join(src, 'Admin.html'), 'utf8').includes('u.sources')
);
console.log(
  'PASS The application has one email call: the authenticated teacher completion email, with no personal-address recipient, CC, BCC, or developer alert.'
);
