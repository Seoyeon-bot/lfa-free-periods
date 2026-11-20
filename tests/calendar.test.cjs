// Safe offline tests: no credentials, network, or real Calendar writes.
// Run from the repository root: npm test
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(
  process.argv[2] || path.join(__dirname, '../src/Code.gs'),
  'utf8'
);
const clone = (x) => JSON.parse(JSON.stringify(x));
let user = 'teacher.a@lfanet.org',
  active = user,
  seq = 0;
const sentMail = [];
let mailQuota = 100,
  mailFailure = false;
const sharedProps = {};
const sharedStore = {
  getProperty: (k) => sharedProps[k] || null,
  setProperty(k, v) {
    sharedProps[k] = v;
    return this;
  },
  getProperties: () => ({ ...sharedProps })
};
const props = new Map(),
  calendars = new Map(),
  audit = [],
  passes = [];
const schoolId = source.match(/schoolCalendarId:\s*['"]([^'"]+)['"]/)[1];
const date = '2027-01-11'; // Monday: F has ASM; G has late start, six periods.
const next = '2027-01-12';
function storeFor(email) {
  if (!props.has(email)) props.set(email, {});
  const p = props.get(email);
  return {
    getProperty: (k) => p[k] || null,
    setProperty(k, v) {
      p[k] = v;
      return this;
    },
    deleteProperty(k) {
      delete p[k];
      return this;
    },
    getProperties: () => ({ ...p })
  };
}
const marker = (letter) => ({
  id: 'day-marker',
  summary: letter + '-Day',
  start: { date },
  end: { date: next }
});
calendars.set(schoolId, [marker('F')]);
for (const name of ['a', 'b']) {
  calendars.set('teacher.' + name + '@lfanet.org', []);
  calendars.set('classes-' + name, []);
  calendars.set('hidden-' + name, []);
}
const context = vm.createContext({
  console,
  Date,
  Map,
  Set,
  MailApp: {
    getRemainingDailyQuota: () => mailQuota,
    sendEmail(message) {
      if (mailFailure) throw new Error('Temporary mail failure');
      sentMail.push(clone(message));
    }
  },
  Session: {
    getEffectiveUser: () => ({ getEmail: () => user }),
    getActiveUser: () => ({ getEmail: () => active })
  },
  PropertiesService: {
    getUserProperties: () => storeFor(user),
    getScriptProperties: () => sharedStore
  },
  LockService: {
    getUserLock: () => ({ tryLock: () => true, releaseLock() {} })
  },
  Utilities: {
    formatDate(d, tz, format) {
      if (format === 'Z') {
        const offset = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'longOffset'
        })
          .formatToParts(d)
          .find((p) => p.type === 'timeZoneName').value;
        return offset.replace('GMT', '').replace(':', '') || '+0000';
      }
      if (format === 'yyyy-MM-dd')
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(d);
      return d.toISOString();
    }
  },
  Calendar: {
    CalendarList: {
      list() {
        const suffix = user.includes('.a@') ? 'a' : 'b';
        return {
          items: [
            {
              id: user,
              summary: 'Main',
              primary: true,
              selected: true,
              accessRole: 'owner'
            },
            {
              id: schoolId,
              summary: 'All LFA Events',
              selected: true,
              accessRole: 'reader'
            },
            {
              id: 'classes-' + suffix,
              summary: 'Classes',
              selected: true,
              accessRole: 'reader'
            },
            {
              id: 'hidden-' + suffix,
              summary: 'Hidden',
              selected: false,
              accessRole: 'reader'
            },
            ...[...calendars.keys()]
              .filter((k) => k.startsWith('output-') && k.includes(user))
              .map((id) => ({
                id,
                summary: 'LFA Free Periods',
                selected: true,
                accessRole: 'owner'
              }))
          ]
        };
      },
      get(id) {
        assert.ok(calendars.has(id));
        return { id, accessRole: 'owner' };
      },
      patch() {},
      insert(x) {
        return { ...x, accessRole: 'owner' };
      }
    },
    Calendars: {
      insert() {
        const id = 'output-' + user;
        calendars.set(id, []);
        return { id };
      },
      get(id) {
        return { id };
      }
    },
    Events: {
      list(id, options) {
        assert.ok(calendars.has(id), 'Unknown calendar ' + id);
        return {
          items: clone(calendars.get(id)).filter(
            (e) =>
              new Date(e.start.dateTime || e.start.date) <
                new Date(options.timeMax) &&
              new Date(e.end.dateTime || e.end.date) > new Date(options.timeMin)
          )
        };
      },
      insert(event, id) {
        assert.ok(id.startsWith('output-' + user), 'Cross-user/source write');
        const e = { ...clone(event), id: 'event-' + ++seq };
        calendars.get(id).push(e);
        audit.push(['insert', id]);
        return e;
      },
      update(event, id, eventId) {
        assert.ok(id.startsWith('output-' + user), 'Cross-user/source write');
        const list = calendars.get(id),
          i = list.findIndex((e) => e.id === eventId);
        assert.ok(i >= 0);
        list[i] = { ...clone(event), id: eventId };
        audit.push(['update', id]);
      },
      remove(id, eventId) {
        assert.ok(id.startsWith('output-' + user), 'Cross-user/source write');
        calendars.set(
          id,
          calendars.get(id).filter((e) => e.id !== eventId)
        );
        audit.push(['remove', id]);
      }
    }
  }
});
vm.runInContext(source, context);
// Keep the real planner, identity, source discovery and reconciliation. Replace
// only infrastructure scheduling and the annual window for a one-day fixture.
vm.runInContext(
  `installTriggers_=function(){}; academicWindow_=function(){return {start:'${date}',end:'${next}'};}; SCHOOL.nearbyDays=0;`,
  context
);
const call = (code) => vm.runInContext(code, context);
function as(email) {
  user = email;
  active = email;
}
function output() {
  return clone(
    calendars.get(storeFor(user).getProperty('OUTPUT_CALENDAR_ID')) || []
  );
}
function summaries() {
  return output()
    .map((e) => e.summary)
    .sort();
}
function event(title, start, end) {
  return {
    id: 'busy-' + ++seq,
    summary: title,
    start: { dateTime: date + 'T' + start + ':00-06:00' },
    end: { dateTime: date + 'T' + end + ':00-06:00' }
  };
}
function test(label, fn) {
  fn();
  passes.push(label);
  console.log('PASS ' + label);
}
// BEGIN REGRESSION TESTS
test('Coworker A authorizes and gets a private output calendar', () => {
  const r = call("activate('teacher.a@lfanet.org')");
  assert.equal(r.busy, false);
  assert.equal(output().length, 8);
  assert.equal(
    summaries().every((s) => s.includes('F')),
    true
  );
});
const aId = storeFor(user).getProperty('OUTPUT_CALENDAR_ID');
test('Coworker B gets a separate output and different availability', () => {
  as('teacher.b@lfanet.org');
  calendars.set('classes-b', [event('Class', '10:00', '10:45')]);
  call("activate('teacher.b@lfanet.org')");
  assert.notEqual(storeFor(user).getProperty('OUTPUT_CALENDAR_ID'), aId);
  assert.equal(output().length, 7);
  assert.ok(!summaries().includes('Free Period F3'));
  assert.equal(calendars.get(aId).length, 8);
});
test('Typing another teacher email cannot impersonate them', () => {
  assert.throws(() => call("activate('teacher.a@lfanet.org')"), /signed-in/);
});
test('Deployment running as owner for a different visitor is rejected', () => {
  active = 'teacher.a@lfanet.org';
  assert.throws(() => call('identity_()'), /Deployment/);
  active = user;
});
test('Admin F to G change updates labels/times and deletes F7/F8', () => {
  calendars.set(schoolId, [marker('G')]);
  as('teacher.a@lfanet.org');
  const r = call('syncFreePeriods()');
  assert.equal(r.pending, 0);
  assert.deepEqual(
    summaries(),
    Array.from({ length: 6 }, (_, i) => 'Free Period G' + (i + 1))
  );
  assert.equal(
    output().find((e) => e.summary === 'Free Period G1').start.dateTime,
    date + 'T14:40:00.000Z'
  );
  assert.ok(
    !output().some((e) => /F|[78]$/.test(e.summary.replace('Free Period ', '')))
  );
});
test('G-day recalculation uses teacher B class overlap at the new times', () => {
  as('teacher.b@lfanet.org');
  call('syncFreePeriods()');
  assert.ok(!summaries().includes('Free Period G2')); // 09:25-10:10 overlap
  assert.ok(!summaries().includes('Free Period G3')); // 10:30-11:15 overlap
  assert.equal(output().length, 4);
});
test('New meeting removes G5 only for the booked teacher', () => {
  as('teacher.a@lfanet.org');
  calendars.set(user, [event('Cycle meeting', '12:00', '12:45')]);
  call('syncFreePeriods()');
  assert.ok(!summaries().includes('Free Period G5'));
  as('teacher.b@lfanet.org');
  assert.ok(summaries().includes('Free Period G5'));
});
test('Deleting the meeting restores the free period', () => {
  as('teacher.a@lfanet.org');
  calendars.set(user, []);
  call('syncFreePeriods()');
  assert.ok(summaries().includes('Free Period G5'));
});
test('Repeated sync is idempotent: no duplicates or unnecessary writes', () => {
  const n = audit.length;
  call('syncFreePeriods()');
  assert.equal(audit.length, n);
  assert.equal(output().length, 6);
});
test('Conflicting F and G markers remove misleading free blocks', () => {
  calendars.set(schoolId, [
    marker('F'),
    { ...marker('G'), id: 'other-marker' }
  ]);
  const r = call('syncFreePeriods()');
  assert.equal(output().length, 0);
  assert.equal(r.skipped.length, 1);
});
test('Missing letter marker produces no guessed free blocks', () => {
  calendars.set(schoolId, []);
  call('syncFreePeriods()');
  assert.equal(output().length, 0);
});
test('School source events are never modified by the app', () => {
  assert.ok(audit.every((a) => a[1].startsWith('output-')));
});
test('Calendar link targets the signed-in LFA account without subscription prompt', () => {
  const url = call("calendarUrl_('output-example')");
  assert.equal(
    url,
    'https://calendar.google.com/calendar/r?authuser=teacher.a%40lfanet.org'
  );
  assert.ok(!url.includes('cid=') && !url.includes('/u/0/'));
});
test('August-May school year rolls over in June without assuming letter rotation', () => {
  const c = vm.createContext({});
  vm.runInContext(source, c);
  const window = (d) =>
    JSON.parse(JSON.stringify(vm.runInContext(`academicWindow_('${d}')`, c)));
  assert.deepEqual(window('2027-01-01'), {
    start: '2026-08-01',
    end: '2027-06-01'
  });
  assert.deepEqual(window('2027-06-01'), {
    start: '2027-08-01',
    end: '2028-06-01'
  });
});
test('All A-G schedules, Tuesday exceptions and late starts match planner rules', () => {
  for (const letter of 'ABCDEFG') {
    const slots = call(`bellSchedule_('${letter}',1,false)`);
    assert.equal(slots.length, letter === 'G' ? 6 : 8);
    assert.equal(slots[0][0], ['D', 'G'].includes(letter) ? '08:40' : '08:10');
    assert.equal(slots[0][1], ['D', 'G'].includes(letter) ? '09:25' : '08:55');
  }
  assert.equal(call("bellSchedule_('B',2,false)[6][0]"), '13:00');
  assert.equal(call("bellSchedule_('F',2,false)[6][0]"), '13:00');
  assert.equal(call("bellSchedule_('F',2,true)[6][0]"), '13:45');
  assert.equal(call("bellSchedule_('D',2,false)[6][0]"), '13:30');
});
test('Any partial overlap blocks the whole period; adjacent event does not', () => {
  calendars.set(schoolId, [marker('G')]);
  calendars.set(user, [event('Meeting', '12:15', '12:20')]);
  call('syncFreePeriods()');
  assert.ok(!summaries().includes('Free Period G5'));
  assert.ok(summaries().includes('Free Period G6'));
});
test('Hidden calendars are excluded and primary calendar always included', () => {
  const ids = Array.from(call('sources_()'), (s) => s.id);
  assert.ok(ids.includes(user) && ids.includes('classes-a'));
  assert.ok(
    !ids.includes('hidden-a') && !ids.some((id) => id.startsWith('output-'))
  );
});
test('Run limit resumes without duplicating previously inserted blocks', () => {
  calendars.set(user, []);
  calendars.set(storeFor(user).getProperty('OUTPUT_CALENDAR_ID'), []);
  call('SCHOOL.maxMutationsPerRun=2');
  assert.equal(call('syncFreePeriods()').pending, 4);
  assert.equal(call('syncFreePeriods()').pending, 2);
  assert.equal(call('syncFreePeriods()').pending, 0);
  assert.equal(output().length, 6);
  assert.equal(new Set(summaries()).size, 6);
  call('SCHOOL.maxMutationsPerRun=100');
});
test('Completion email is delivered only to each authenticated user', () => {
  assert.ok(sentMail.some((m) => m.to === 'teacher.a@lfanet.org'));
  assert.ok(sentMail.some((m) => m.to === 'teacher.b@lfanet.org'));
  assert.ok(
    sentMail
      .filter((m) => m.to !== 'seoyeonchoi2001@gmail.com')
      .every((m) =>
        ['teacher.a@lfanet.org', 'teacher.b@lfanet.org'].includes(m.to)
      )
  );
});
test('Rechecking or activating again does not repeat the completion email', () => {
  const before = sentMail.length;
  call("activate('teacher.a@lfanet.org')");
  assert.equal(sentMail.length, before);
});
test('No completion email during a partial batch; exactly one after final batch', () => {
  storeFor(user).deleteProperty('NOTIFIED_SETUP');
  calendars.set(storeFor(user).getProperty('OUTPUT_CALENDAR_ID'), []);
  call('SCHOOL.maxMutationsPerRun=2');
  const before = sentMail.length;
  assert.equal(call('syncFreePeriods()').pending, 4);
  assert.equal(sentMail.length, before);
  assert.equal(call('syncFreePeriods()').pending, 2);
  assert.equal(sentMail.length, before);
  assert.equal(call('syncFreePeriods()').pending, 0);
  assert.equal(sentMail.length, before + 1);
  call('SCHOOL.maxMutationsPerRun=100');
});
test('Mail failure does not undo calendar completion; next successful run retries', () => {
  storeFor(user).deleteProperty('NOTIFIED_SETUP');
  mailFailure = true;
  const before = sentMail.length;
  const r = call('syncFreePeriods()');
  assert.equal(r.pending, 0);
  assert.ok(r.message.includes('email is delayed'));
  assert.equal(output().length, 6);
  assert.ok(storeFor(user).getProperty('NOTIFICATION_ERROR'));
  mailFailure = false;
  call('syncFreePeriods()');
  assert.equal(sentMail.length, before + 1);
  assert.equal(storeFor(user).getProperty('NOTIFICATION_ERROR'), null);
});
test('Exhausted mail quota delays email without failing calendar sync', () => {
  storeFor(user).deleteProperty('NOTIFIED_SETUP');
  mailQuota = 0;
  const before = sentMail.length;
  assert.equal(call('syncFreePeriods()').pending, 0);
  assert.equal(sentMail.length, before);
  assert.equal(storeFor(user).getProperty('NOTIFIED_SETUP'), null);
  mailQuota = 100;
  call('syncFreePeriods()');
  assert.equal(sentMail.length, before + 1);
});
test('Completion email discloses skipped dates instead of claiming full coverage', () => {
  storeFor(user).deleteProperty('NOTIFIED_SETUP');
  calendars.set(schoolId, [marker('F'), { ...marker('G'), id: 'conflict' }]);
  call('syncFreePeriods()');
  const mail = sentMail.at(-1);
  assert.ok(mail.subject.includes('skipped'));
  assert.ok(mail.body.includes('Dates skipped: 1'));
  assert.ok(mail.body.includes('does not confirm coverage'));
});
test('Saved status survives reopening and notifications never cross users', () => {
  const s = call('getSetup()');
  assert.ok(s.lastStatus.length > 0);
  assert.equal(JSON.parse(s.diagnostics).pending, 0);
  const aStatus = storeFor(user).getProperty('LAST_STATUS');
  as('teacher.b@lfanet.org');
  assert.notEqual(storeFor(user).getProperty('LAST_STATUS'), aStatus);
  assert.equal(call('getSetup()').email, 'teacher.b@lfanet.org');
});
test('After initial full-year completion, nearby check covers today plus 35 days', () => {
  const c = vm.createContext({});
  vm.runInContext(source, c);
  const result = vm.runInContext(
    `syncWindow_('2026-11-14',{getProperty:function(k){return ({OUTPUT_CALENDAR_ID:'out',FULL_SYNC_COMPLETE:'2026-08-01/2027-06-01/out',LAST_FULL_SYNC:new Date().toISOString()})[k] || null;}})`,
    c
  );
  assert.equal(result.nearby, true);
  assert.equal(result.window.start, '2026-11-14');
  assert.equal(result.window.end, '2026-12-20');
});
test('Incomplete initial setup and changed school year still use annual window', () => {
  const c = vm.createContext({});
  vm.runInContext(source, c);
  for (const today of ['2026-11-14', '2027-08-20']) {
    const r = vm.runInContext(
      `syncWindow_('${today}',{getProperty:function(){return null;}})`,
      c
    );
    assert.equal(r.nearby, false);
    assert.ok(r.fullState.ranges.some((x) => x.start.endsWith('-08-01')));
  }
});
test('Stale full-year pass runs again, so farther-out changes are not ignored', () => {
  const c = vm.createContext({});
  vm.runInContext(source, c);
  const r = vm.runInContext(
    `syncWindow_('2026-11-14',{getProperty:function(k){return ({OUTPUT_CALENDAR_ID:'out',FULL_SYNC_COMPLETE:'2026-08-01/2027-06-01/out',LAST_FULL_SYNC:new Date(Date.now()-7*3600000).toISOString()})[k] || null;}})`,
    c
  );
  assert.equal(r.nearby, false);
});
test('Nearby reconciliation removes a booked block without touching farther-out blocks', () => {
  as('teacher.a@lfanet.org');
  calendars.set(schoolId, [marker('G')]);
  calendars.set(user, []);
  call('syncFreePeriods()');
  const id = storeFor(user).getProperty('OUTPUT_CALENDAR_ID');
  calendars.get(id).push({
    id: 'far-away',
    summary: 'Free Period A1',
    start: { dateTime: '2027-05-10T08:10:00-05:00' },
    end: { dateTime: '2027-05-10T08:55:00-05:00' },
    description: 'LFA_FREE_PERIODS_V1\n2027-05-10/1'
  });
  call(
    `syncWindow_=function(){return {window:{start:'${date}',end:'${next}'},nearby:true};}`
  );
  calendars.set(user, [event('Cycle meeting', '12:00', '12:45')]);
  call('syncFreePeriods()');
  assert.ok(!summaries().includes('Free Period G5'));
  assert.ok(output().some((e) => e.id === 'far-away'));
});
function withCalendarList(overrides, fn) {
  const api = context.Calendar.CalendarList,
    original = { ...api };
  Object.assign(api, overrides);
  try {
    fn();
  } finally {
    Object.assign(api, original);
  }
}
test('Missing shared school calendar is subscribed by exact ID and selected', () => {
  let added;
  withCalendarList(
    {
      get() {
        throw new Error('404 Not Found');
      },
      insert(body) {
        added = body;
        return { ...body, accessRole: 'reader' };
      }
    },
    () => {
      assert.equal(call('ensureSchoolSubscribed_()'), schoolId);
      assert.equal(added.id, schoolId);
      assert.equal(added.selected, true);
      assert.equal(added.hidden, false);
    }
  );
});
test('Existing calendar with a personal name is reused without duplicates', () => {
  withCalendarList(
    {
      get: (id) => ({
        id,
        summary: 'My LFA Letter Days',
        accessRole: 'reader',
        selected: true
      }),
      insert() {
        throw new Error('Must not duplicate');
      },
      patch() {
        throw new Error('Must not rename');
      }
    },
    () => {
      assert.equal(call('ensureSchoolSubscribed_()'), schoolId);
    }
  );
});
test('Unchecked or hidden school calendar is made visible without changing name', () => {
  let patch;
  withCalendarList(
    {
      get: (id) => ({
        id,
        summary: 'Renamed',
        accessRole: 'reader',
        selected: false,
        hidden: true
      }),
      patch(body, id) {
        patch = { body, id };
      }
    },
    () => {
      call('ensureSchoolSubscribed_()');
      assert.equal(patch.id, schoolId);
      assert.deepEqual(Object.keys(patch.body).sort(), ['hidden', 'selected']);
      assert.equal(patch.body.selected, true);
      assert.equal(patch.body.hidden, false);
    }
  );
});
test('A subscription race reuses the calendar after an Already Exists response', () => {
  let reads = 0;
  withCalendarList(
    {
      get(id) {
        if (!reads++) throw new Error('404');
        return { id, accessRole: 'reader', selected: true };
      },
      insert() {
        throw new Error('409 Already Exists');
      }
    },
    () => {
      assert.equal(call('ensureSchoolSubscribed_()'), schoolId);
      assert.equal(reads, 2);
    }
  );
});
test('Missing sharing permissions stop activation before free-period writes', () => {
  const count = audit.length;
  withCalendarList(
    {
      get() {
        throw new Error('404');
      },
      insert() {
        throw new Error('403 Forbidden');
      }
    },
    () => {
      assert.throws(() => call("activate('teacher.a@lfanet.org')"), /share it/);
      assert.equal(audit.length, count);
    }
  );
});
test('Busy-only school access is rejected because letter-day titles are unavailable', () => {
  withCalendarList(
    { get: (id) => ({ id, accessRole: 'freeBusyReader', selected: true }) },
    () => {
      assert.throws(() => call('ensureSchoolSubscribed_()'), /Busy-only/);
    }
  );
});
test('Annotated B/G titles, including suffix typos, retain their letter', () => {
  for (const [title, expected] of [
    ['B day', 'B'],
    ['B-Day (Tuesday with Break)', 'B'],
    ['B day with (Tuesday with break)', 'B'],
    ['G day', 'G'],
    ['G day with (Tuesdsay with zreak)', 'G'],
    ['G-Day (Tuesday with Break)', 'G'],
    ['Day B (Tuesday with Break)', 'B'],
    ['  g\u2011Day (late start)  ', 'G']
  ])
    assert.equal(
      call('letter_(' + JSON.stringify(title) + ')'),
      expected,
      title
    );
});
test('Annotated A-G markers produce the same actual free blocks as plain titles', () => {
  for (const letter of 'ABCDEFG') {
    const plain = marker(letter),
      annotated = {
        ...plain,
        summary: letter + ' day with (Tuesday with break)'
      };
    const run = (e) =>
      Array.from(context.plan_(date, next, [e], []).events.values(), (x) => ({
        summary: x.summary,
        start: x.start.dateTime,
        end: x.end.dateTime
      }));
    assert.deepEqual(run(annotated), run(plain));
    assert.ok(run(annotated).length > 0);
  }
});
test('Tuesday annotations preserve Tuesday timing and G-day late start', () => {
  const d = '2026-11-17',
    end = '2026-11-18';
  for (const [letter, first, period7] of [
    ['B', '08:10', '13:00'],
    ['G', '08:40', null]
  ]) {
    const event = {
      summary: letter + '-Day (Tuesday with Break)',
      start: { date: d },
      end: { date: end }
    };
    const plan = context.plan_(d, end, [event], []).events;
    assert.equal(plan.size, letter === 'G' ? 6 : 8);
    assert.equal(
      +new Date(plan.get(d + '/1').start.dateTime),
      +context.at_(d, first)
    );
    if (period7)
      assert.equal(
        +new Date(plan.get(d + '/7').start.dateTime),
        +context.at_(d, period7)
      );
  }
});
test('Unrelated titles and ambiguous mixed-letter titles are not guessed', () => {
  for (const title of [
    'Birthday',
    'Band Day',
    'A daylight event',
    'Meeting about B-Day',
    'H-Day',
    'B-Day / G-Day',
    'Day B changed to Day G'
  ])
    assert.equal(call('letter_(' + JSON.stringify(title) + ')'), null, title);
});
test('Renaming a marker to include a note does not delete valid free periods', () => {
  calendars.set(user, []);
  calendars.set(schoolId, [marker('G')]);
  call('syncFreePeriods()');
  const before = output().filter((e) => e.start.dateTime.startsWith(date));
  calendars.set(schoolId, [
    { ...marker('G'), summary: 'G day with (Tuesdsay with zreak)' }
  ]);
  call('syncFreePeriods()');
  assert.deepEqual(
    output().filter((e) => e.start.dateTime.startsWith(date)),
    before
  );
});
test('Setup does not send diagnostic emails to a developer', () => {
  assert.ok(!source.includes('developerEmail:'));
  assert.ok(!source.includes('developerAlert_('));
  assert.ok(sentMail.every((m) => m.to.endsWith('@lfanet.org')));
});
test('Background failures are logged in the dashboard without sending email', () => {
  const list = context.Calendar.Events.list,
    before = sentMail.length;
  try {
    context.Calendar.Events.list = () => {
      throw new Error('403 Forbidden PRIVATE_MEETING_DETAILS');
    };
    assert.throws(() => call('syncFreePeriods()'), /403/);
    const row = JSON.parse(sharedProps['MONITOR_V1_' + user]);
    assert.equal(row.state, 'error');
    assert.equal(row.lastIssue.category, 'access');
    assert.equal(sentMail.length, before);
    assert.ok(!JSON.stringify(row).includes('PRIVATE_MEETING_DETAILS'));
  } finally {
    context.Calendar.Events.list = list;
  }
});
test('Completion keeps teacher confirmation email and records completion time without developer mail', () => {
  const p = storeFor(user);
  p.deleteProperty('FULL_SYNC_COMPLETE');
  p.deleteProperty('NOTIFIED_SETUP');
  calendars.set(user, []);
  calendars.set(schoolId, [marker('G')]);
  calendars.set(p.getProperty('OUTPUT_CALENDAR_ID'), []);
  call(
    `syncWindow_=function(){return {window:{start:'${date}',end:'${next}'},nearby:false};}; SCHOOL.maxMutationsPerRun=2;`
  );
  const before = sentMail.length;
  assert.equal(call('syncFreePeriods()').pending, 4);
  assert.equal(sentMail.length, before);
  assert.equal(call('syncFreePeriods()').pending, 2);
  assert.equal(sentMail.length, before);
  assert.equal(call('syncFreePeriods()').pending, 0);
  assert.equal(sentMail.length, before + 1);
  assert.equal(sentMail.at(-1).to, user);
  const row = JSON.parse(sharedProps['MONITOR_V1_' + user]);
  assert.ok(row.initialCompletionAt);
  assert.equal(row.setupCompleted, true);
  call('SCHOOL.maxMutationsPerRun=100');
});
test('Skipped dates remain visible with completion and do not produce developer mail', () => {
  const before = sentMail.length;
  calendars.set(schoolId, [marker('F'), { ...marker('G'), id: 'conflict' }]);
  call('syncFreePeriods()');
  const row = JSON.parse(sharedProps['MONITOR_V1_' + user]);
  assert.equal(row.skippedFullYear, 1);
  assert.equal(row.skippedSample, undefined);
  assert.equal(sentMail.length, before);
});
test('Full-year date ranges cover the year exactly once and prioritize upcoming dates', () => {
  const c = vm.createContext({});
  vm.runInContext(source, c);
  const r = c.syncWindow_('2026-11-17', { getProperty: () => null });
  assert.equal(r.window.start, '2026-11-17');
  const all = [];
  for (const span of r.fullState.ranges) {
    assert.ok((new Date(span.end) - new Date(span.start)) / 86400000 <= 35);
    for (let d = span.start; d < span.end; d = c.addDays_(d, 1)) all.push(d);
  }
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, 304);
  assert.equal([...all].sort()[0], '2026-08-01');
  assert.equal([...all].sort().at(-1), '2027-05-31');
});
test('Completed chunks advance checkpoints; completion notification waits for last range', () => {
  as('teacher.a@lfanet.org');
  const p = storeFor(user);
  for (const k of [
    'FULL_SCAN_STATE',
    'FULL_SYNC_COMPLETE',
    'NEXT_SYNC_AFTER',
    'NOTIFIED_SETUP',
    'DEV_ALERT_success',
    'DEV_ALERT_RETRY_AFTER'
  ])
    p.deleteProperty(k);
  calendars.set(user, []);
  calendars.set('classes-a', []);
  calendars.set(p.getProperty('OUTPUT_CALENDAR_ID'), []);
  calendars.set(
    schoolId,
    [0, 1, 2].map((n) => ({
      summary: 'A-Day',
      start: { date: context.addDays_(date, n) },
      end: { date: context.addDays_(date, n + 1) }
    }))
  );
  const c = vm.createContext({ ...context });
  vm.runInContext(source, c);
  vm.runInContext(
    `installTriggers_=function(){};academicWindow_=function(){return {start:'${date}',end:'2027-01-14'};};SCHOOL.scanChunkDays=1;SCHOOL.nearbyDays=0;`,
    c
  );
  const before = sentMail.filter((m) => m.to === user).length;
  assert.equal(c.syncFreePeriods().setupPending, true);
  assert.equal(JSON.parse(p.getProperty('FULL_SCAN_STATE')).index, 1);
  assert.equal(sentMail.filter((m) => m.to === user).length, before);
  assert.equal(c.syncFreePeriods().setupPending, true);
  assert.equal(JSON.parse(p.getProperty('FULL_SCAN_STATE')).index, 2);
  assert.equal(c.syncFreePeriods().setupPending, false);
  assert.equal(p.getProperty('FULL_SCAN_STATE'), null);
  assert.equal(Number(p.getProperty('FULL_FREE_COUNT')), 24);
  assert.equal(output().length, 24);
  assert.equal(sentMail.filter((m) => m.to === user).length, before + 1);
});
test('Quota failure preserves checkpoint and backs off without more API reads', () => {
  const p = storeFor(user);
  p.deleteProperty('FULL_SCAN_STATE');
  p.deleteProperty('FULL_SYNC_COMPLETE');
  const c = vm.createContext({ ...context });
  vm.runInContext(source, c);
  vm.runInContext(
    `installTriggers_=function(){};academicWindow_=function(){return {start:'${date}',end:'2027-01-14'};};SCHOOL.scanChunkDays=1;`,
    c
  );
  const original = context.Calendar.Events.list;
  let reads = 0;
  try {
    context.Calendar.Events.list = function () {
      reads++;
      throw new Error('429 Rate limit exceeded');
    };
    assert.throws(() => c.syncFreePeriods(), /429/);
    assert.equal(JSON.parse(p.getProperty('FULL_SCAN_STATE')).index, 0);
    const previous = reads;
    assert.ok(c.syncFreePeriods().message.includes('temporarily limited'));
    assert.equal(reads, previous);
  } finally {
    context.Calendar.Events.list = original;
    p.deleteProperty('NEXT_SYNC_AFTER');
  }
});
test('Temporary Google failure saves progress and prevents immediate API retries', () => {
  const p = storeFor(user);
  p.deleteProperty('NEXT_SYNC_AFTER');
  const original = context.Calendar.Events.list;
  let reads = 0;
  try {
    context.Calendar.Events.list = function () {
      reads++;
      throw new Error('503 Backend Error');
    };
    assert.throws(() => call('syncFreePeriods()'), /503/);
    const issue = JSON.parse(p.getProperty('LAST_ISSUE'));
    assert.equal(issue.category, 'temporary_service');
    assert.equal(issue.retryable, true);
    assert.ok(issue.retryAfter);
    const previous = reads;
    assert.ok(
      call('syncFreePeriods()').message.includes('temporarily unavailable')
    );
    assert.equal(reads, previous);
  } finally {
    context.Calendar.Events.list = original;
    p.deleteProperty('NEXT_SYNC_AFTER');
  }
});
test('Rate-limit 403 is retryable while sharing 403 requires attention', () => {
  assert.equal(
    call("classifyFailure_(new Error('403 rateLimitExceeded')).category"),
    'rate_limit'
  );
  assert.equal(
    call("classifyFailure_(new Error('403 Forbidden')).retryable"),
    false
  );
});
test('Manual refresh gives a clear permission message without raw API details', () => {
  const p = storeFor(user);
  p.deleteProperty('NEXT_SYNC_AFTER');
  const original = context.Calendar.Events.list;
  try {
    context.Calendar.Events.list = function () {
      throw new Error('403 Forbidden PRIVATE_EVENT_TEXT');
    };
    const result = call('refreshNow()');
    assert.equal(result.needsAttention, true);
    assert.ok(result.message.includes('Calendar access'));
    assert.ok(!result.message.includes('PRIVATE_EVENT_TEXT'));
    assert.ok(p.getProperty('LAST_ERROR').includes('PRIVATE_EVENT_TEXT'));
  } finally {
    context.Calendar.Events.list = original;
  }
});
test('Successful retry clears stale issue status', () => {
  call('syncFreePeriods()');
  assert.equal(storeFor(user).getProperty('LAST_ISSUE'), null);
});
console.log(
  '\n' +
    passes.length +
    ' tests passed. Mocks only; live triggers/deployment and email delivery were not tested.'
);

// Admin monitoring uses the same production sync above and a shared mock store.
test('Teachers cannot read the dashboard or admin URL', () => {
  as('teacher.a@lfanet.org');
  assert.throws(() => call('getAdminStatus()'), /administrator/);
  assert.throws(() => call('getAdminUrl()'), /administrator/);
  assert.throws(() => call("doGet({parameter:{admin:'1'}})"), /administrator/);
});
test('Admin sees separate accounts populated by real synchronization', () => {
  as('teacher.a@lfanet.org');
  call('syncFreePeriods()');
  as('teacher.b@lfanet.org');
  call('syncFreePeriods()');
  as('seoyeon.choi@lfanet.org');
  const rows = call('getAdminStatus().users');
  assert.ok(rows.some((r) => r.email === 'teacher.a@lfanet.org'));
  assert.ok(rows.some((r) => r.email === 'teacher.b@lfanet.org'));
  assert.ok(
    rows.find((r) => r.email === 'teacher.a@lfanet.org').setupCompleted
  );
});
test('Failed sync records safe cause; successful retry retains last failure', () => {
  as('teacher.a@lfanet.org');
  const p = storeFor(user);
  p.deleteProperty('NEXT_SYNC_AFTER');
  const original = context.Calendar.Events.list;
  try {
    context.Calendar.Events.list = () => {
      throw new Error('403 Forbidden PRIVATE_EVENT_TITLE');
    };
    assert.throws(() => call('syncFreePeriods()'), /403/);
    const row = JSON.parse(sharedProps['MONITOR_V1_' + user]);
    assert.equal(row.state, 'error');
    assert.equal(row.lastIssue.category, 'access');
    assert.equal(row.lastIssue.code, '403');
    assert.ok(!JSON.stringify(row).includes('PRIVATE_EVENT_TITLE'));
  } finally {
    context.Calendar.Events.list = original;
  }
  call('syncFreePeriods()');
  const row = JSON.parse(sharedProps['MONITOR_V1_' + user]);
  assert.notEqual(row.state, 'error');
  assert.equal(row.lastIssue.category, 'access');
});
test('Old running heartbeat is flagged without inventing timeout cause', () => {
  const key = 'MONITOR_V1_teacher.a@lfanet.org',
    row = JSON.parse(sharedProps[key]);
  row.state = 'running';
  row.updatedAt = new Date(Date.now() - 11 * 60000).toISOString();
  sharedProps[key] = JSON.stringify(row);
  as('seoyeon.choi@lfanet.org');
  const result = call('getAdminStatus().users').find(
    (r) => r.email === 'teacher.a@lfanet.org'
  );
  assert.equal(result.attention, true);
  assert.equal(result.displayState, 'No recent heartbeat');
});
test('Dashboard storage failure never stops calendar synchronization', () => {
  as('teacher.a@lfanet.org');
  const original = sharedStore.setProperty;
  try {
    sharedStore.setProperty = () => {
      throw new Error('Storage unavailable');
    };
    call('syncFreePeriods()');
    assert.ok(storeFor(user).getProperty('MONITOR_ERROR'));
  } finally {
    sharedStore.setProperty = original;
  }
  call('syncFreePeriods()');
  assert.equal(storeFor(user).getProperty('MONITOR_ERROR'), null);
});
test('Requested, paused, work-budget and skipped-date diagnostics are distinct', () => {
  as('teacher.a@lfanet.org');
  call("monitor_('requested','Setup requested')");
  assert.ok(JSON.parse(sharedProps['MONITOR_V1_' + user]).requestedAt);
  call(
    "monitor_('stalled','Writing changes',null,['2027-01-12: no unique letter-day marker'])"
  );
  let row = JSON.parse(sharedProps['MONITOR_V1_' + user]);
  assert.equal(row.lastIssue.category, 'work_budget');
  assert.equal(row.skippedSample, undefined);
  call("monitor_('paused','Paused')");
  assert.equal(JSON.parse(sharedProps['MONITOR_V1_' + user]).state, 'paused');
});
test('Bounded Unicode diagnostics stay under one property value limit', () => {
  as('teacher.a@lfanet.org');
  const p = storeFor(user);
  p.setProperty(
    'LAST_DIAGNOSTICS',
    JSON.stringify({
      sources: Array.from({ length: 40 }, () => ({
        name: '한'.repeat(100),
        events: 2
      }))
    })
  );
  for (let i = 0; i < 15; i++)
    call("monitor_('error','Read',new Error('503 unavailable'))");
  const json = sharedProps['MONITOR_V1_' + user];
  assert.ok(Buffer.byteLength(json) < 9000);
  assert.ok(JSON.parse(json).history.length <= 6);
});
console.log(
  'PASS 7 admin monitoring checks (including server-side authorization and reporting failure isolation).'
);

test('Fifty account reports keep distinct shared keys and cannot choose another identity', () => {
  for (let i = 0; i < 50; i++) {
    as('faculty' + i + '@lfanet.org');
    call("monitor_('requested','Setup requested')");
  }
  as('seoyeon.choi@lfanet.org');
  const rows = call('getAdminStatus().users');
  assert.equal(rows.filter((r) => /^faculty\d+@/.test(r.email)).length, 50);
  assert.ok(
    Object.keys(sharedProps)
      .filter((k) => k.startsWith('MONITOR_V1_'))
      .every(
        (k) =>
          JSON.parse(sharedProps[k]).email === k.slice('MONITOR_V1_'.length)
      )
  );
});
console.log('PASS 8 admin monitoring checks total.');
