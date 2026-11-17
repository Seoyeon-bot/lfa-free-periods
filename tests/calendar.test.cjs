// Safe offline tests: no credentials, network, or real Calendar writes.
// Run from the repository root: npm test
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../src/Code.gs'), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
let user = 'teacher.a@lfanet.org', active = user, seq = 0;
const sentMail=[];let mailQuota=100,mailFailure=false;
const props = new Map(), calendars = new Map(), audit = [], passes = [];
const schoolId = source.match(/schoolCalendarId: '([^']+)'/)[1];
const date = '2027-01-11'; // Monday: F has ASM; G has late start, six periods.
const next = '2027-01-12';
function storeFor(email) {
  if (!props.has(email)) props.set(email, {});
  const p = props.get(email);
  return { getProperty:k=>p[k] || null, setProperty(k,v){p[k]=v;return this;},
    deleteProperty(k){delete p[k];return this;}, getProperties:()=>({...p}) };
}
const marker = letter => ({id:'day-marker',summary:letter+'-Day',start:{date},end:{date:next}});
calendars.set(schoolId,[marker('F')]);
for (const name of ['a','b']) {
  calendars.set('teacher.'+name+'@lfanet.org', []);
  calendars.set('classes-'+name, []);
  calendars.set('hidden-'+name, []);
}
const context = vm.createContext({
  console, Date, Map, Set,
  MailApp:{getRemainingDailyQuota:()=>mailQuota,sendEmail(message){if(mailFailure)throw new Error('Temporary mail failure');sentMail.push(clone(message));}},
  Session:{getEffectiveUser:()=>({getEmail:()=>user}),getActiveUser:()=>({getEmail:()=>active})},
  PropertiesService:{getUserProperties:()=>storeFor(user),getScriptProperties:()=>({getProperties:()=>({})})},
  LockService:{getUserLock:()=>({tryLock:()=>true,releaseLock(){}})},
  Utilities:{formatDate(d,tz,format){
    if(format==='Z') {
      const offset=new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'longOffset'}).formatToParts(d).find(p=>p.type==='timeZoneName').value;
      return offset.replace('GMT','').replace(':','') || '+0000';
    }
    if(format==='yyyy-MM-dd') return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    return d.toISOString();
  }},
  Calendar:{
    CalendarList:{
      list(){const suffix=user.includes('.a@')?'a':'b'; return {items:[
        {id:user,summary:'Main',primary:true,selected:true,accessRole:'owner'},
        {id:schoolId,summary:'All LFA Events',selected:true,accessRole:'reader'},
        {id:'classes-'+suffix,summary:'Classes',selected:true,accessRole:'reader'},
        {id:'hidden-'+suffix,summary:'Hidden',selected:false,accessRole:'reader'},
        ...[...calendars.keys()].filter(k=>k.startsWith('output-') && k.includes(user)).map(id=>({id,summary:'LFA Free Periods',selected:true,accessRole:'owner'}))
      ]};},
      get(id){assert.ok(calendars.has(id));return {id,accessRole:'owner'};},
      patch(){},insert(x){return {...x,accessRole:'owner'};}
    },
    Calendars:{insert(){const id='output-'+user;calendars.set(id,[]);return {id};},get(id){return {id};}},
    Events:{
      list(id,options){assert.ok(calendars.has(id),'Unknown calendar '+id);return {items:clone(calendars.get(id)).filter(e=>new Date(e.start.dateTime || e.start.date)<new Date(options.timeMax) && new Date(e.end.dateTime || e.end.date)>new Date(options.timeMin))};},
      insert(event,id){assert.ok(id.startsWith('output-'+user),'Cross-user/source write');const e={...clone(event),id:'event-'+(++seq)};calendars.get(id).push(e);audit.push(['insert',id]);return e;},
      update(event,id,eventId){assert.ok(id.startsWith('output-'+user),'Cross-user/source write');const list=calendars.get(id),i=list.findIndex(e=>e.id===eventId);assert.ok(i>=0);list[i]={...clone(event),id:eventId};audit.push(['update',id]);},
      remove(id,eventId){assert.ok(id.startsWith('output-'+user),'Cross-user/source write');calendars.set(id,calendars.get(id).filter(e=>e.id!==eventId));audit.push(['remove',id]);}
    }
  }
});
vm.runInContext(source,context);
// Keep the real planner, identity, source discovery and reconciliation. Replace
// only infrastructure scheduling and the annual window for a one-day fixture.
vm.runInContext(`installTriggers_=function(){}; academicWindow_=function(){return {start:'${date}',end:'${next}'};}; SCHOOL.nearbyDays=0;`,context);
const call = code => vm.runInContext(code,context);
function as(email){user=email;active=email;}
function output(){return clone(calendars.get(storeFor(user).getProperty('OUTPUT_CALENDAR_ID')) || []);}
function summaries(){return output().map(e=>e.summary).sort();}
function event(title,start,end){return {id:'busy-'+(++seq),summary:title,start:{dateTime:date+'T'+start+':00-06:00'},end:{dateTime:date+'T'+end+':00-06:00'}};}
function test(label,fn){fn();passes.push(label);console.log('PASS '+label);}
test('Coworker A authorizes and gets a private output calendar',()=>{
  const r=call("activate('teacher.a@lfanet.org')");assert.equal(r.busy,false);
  assert.equal(output().length,8);assert.equal(summaries().every(s=>s.includes('F')),true);
});
const aId=storeFor(user).getProperty('OUTPUT_CALENDAR_ID');
test('Coworker B gets a separate output and different availability',()=>{
  as('teacher.b@lfanet.org');calendars.set('classes-b',[event('Class','10:00','10:45')]);
  call("activate('teacher.b@lfanet.org')");assert.notEqual(storeFor(user).getProperty('OUTPUT_CALENDAR_ID'),aId);
  assert.equal(output().length,7);assert.ok(!summaries().includes('Free Period F3'));
  assert.equal(calendars.get(aId).length,8);
});
test('Typing another teacher email cannot impersonate them',()=>{
  assert.throws(()=>call("activate('teacher.a@lfanet.org')"),/signed-in/);
});
test('Deployment running as owner for a different visitor is rejected',()=>{
  active='teacher.a@lfanet.org';assert.throws(()=>call('identity_()'),/Deployment/);active=user;
});
test('Admin F to G change updates labels/times and deletes F7/F8',()=>{
  calendars.set(schoolId,[marker('G')]);as('teacher.a@lfanet.org');
  const r=call('syncFreePeriods()');assert.equal(r.pending,0);
  assert.deepEqual(summaries(),Array.from({length:6},(_,i)=>'Free Period G'+(i+1)));
  assert.equal(output().find(e=>e.summary==='Free Period G1').start.dateTime,date+'T14:40:00.000Z');
  assert.ok(!output().some(e=>/F|[78]$/.test(e.summary.replace('Free Period ',''))));
});
test('G-day recalculation uses teacher B class overlap at the new times',()=>{
  as('teacher.b@lfanet.org');call('syncFreePeriods()');
  assert.ok(!summaries().includes('Free Period G2')); // 09:25-10:10 overlap
  assert.ok(!summaries().includes('Free Period G3')); // 10:30-11:15 overlap
  assert.equal(output().length,4);
});
test('New meeting removes G5 only for the booked teacher',()=>{
  as('teacher.a@lfanet.org');calendars.set(user,[event('Cycle meeting','12:00','12:45')]);
  call('syncFreePeriods()');assert.ok(!summaries().includes('Free Period G5'));
  as('teacher.b@lfanet.org');assert.ok(summaries().includes('Free Period G5'));
});
test('Deleting the meeting restores the free period',()=>{
  as('teacher.a@lfanet.org');calendars.set(user,[]);call('syncFreePeriods()');
  assert.ok(summaries().includes('Free Period G5'));
});
test('Repeated sync is idempotent: no duplicates or unnecessary writes',()=>{
  const n=audit.length;call('syncFreePeriods()');assert.equal(audit.length,n);assert.equal(output().length,6);
});
test('Conflicting F and G markers remove misleading free blocks',()=>{
  calendars.set(schoolId,[marker('F'),{...marker('G'),id:'other-marker'}]);
  const r=call('syncFreePeriods()');assert.equal(output().length,0);assert.equal(r.skipped.length,1);
});
test('Missing letter marker produces no guessed free blocks',()=>{
  calendars.set(schoolId,[]);call('syncFreePeriods()');assert.equal(output().length,0);
});
test('School source events are never modified by the app',()=>{
  assert.ok(audit.every(a=>a[1].startsWith('output-')));
});
test('Calendar link targets the signed-in LFA account without subscription prompt',()=>{
  const url=call("calendarUrl_('output-example')");
  assert.equal(url,'https://calendar.google.com/calendar/r?authuser=teacher.a%40lfanet.org');
  assert.ok(!url.includes('cid=') && !url.includes('/u/0/'));
});
test('August-May school year rolls over in June without assuming letter rotation',()=>{
  const c=vm.createContext({});vm.runInContext(source,c);
  const window=d=>JSON.parse(JSON.stringify(vm.runInContext(`academicWindow_('${d}')`,c)));
  assert.deepEqual(window('2027-01-01'),{start:'2026-08-01',end:'2027-06-01'});
  assert.deepEqual(window('2027-06-01'),{start:'2027-08-01',end:'2028-06-01'});
});
test('All A-G schedules, Tuesday exceptions and late starts match planner rules',()=>{
  for(const letter of 'ABCDEFG') {
    const slots=call(`bellSchedule_('${letter}',1,false)`);
    assert.equal(slots.length,letter==='G'?6:8);
    assert.equal(slots[0][0],['D','G'].includes(letter)?'08:40':'08:10');
    assert.equal(slots[0][1],['D','G'].includes(letter)?'09:25':'08:55');
  }
  assert.equal(call("bellSchedule_('B',2,false)[6][0]"),'13:00');
  assert.equal(call("bellSchedule_('F',2,false)[6][0]"),'13:00');
  assert.equal(call("bellSchedule_('F',2,true)[6][0]"),'13:45');
  assert.equal(call("bellSchedule_('D',2,false)[6][0]"),'13:30');
});
test('Any partial overlap blocks the whole period; adjacent event does not',()=>{
  calendars.set(schoolId,[marker('G')]);
  calendars.set(user,[event('Meeting','12:15','12:20')]);call('syncFreePeriods()');
  assert.ok(!summaries().includes('Free Period G5'));
  assert.ok(summaries().includes('Free Period G6'));
});
test('Hidden calendars are excluded and primary calendar always included',()=>{
  const ids=Array.from(call('sources_()'),s=>s.id);
  assert.ok(ids.includes(user) && ids.includes('classes-a'));
  assert.ok(!ids.includes('hidden-a') && !ids.some(id=>id.startsWith('output-')));
});
test('Run limit resumes without duplicating previously inserted blocks',()=>{
  calendars.set(user,[]);calendars.set(storeFor(user).getProperty('OUTPUT_CALENDAR_ID'),[]);
  call('SCHOOL.maxMutationsPerRun=2');
  assert.equal(call('syncFreePeriods()').pending,4);
  assert.equal(call('syncFreePeriods()').pending,2);
  assert.equal(call('syncFreePeriods()').pending,0);
  assert.equal(output().length,6);assert.equal(new Set(summaries()).size,6);
  call('SCHOOL.maxMutationsPerRun=100');
});
test('Completion email is delivered only to each authenticated user',()=>{
  assert.ok(sentMail.some(m=>m.to==='teacher.a@lfanet.org'));
  assert.ok(sentMail.some(m=>m.to==='teacher.b@lfanet.org'));
  assert.ok(sentMail.filter(m=>m.to!=='seoyeonchoi2001@gmail.com').every(m=>['teacher.a@lfanet.org','teacher.b@lfanet.org'].includes(m.to)));
});
test('Rechecking or activating again does not repeat the completion email',()=>{
  const before=sentMail.length;call("activate('teacher.a@lfanet.org')");
  assert.equal(sentMail.length,before);
});
test('No completion email during a partial batch; exactly one after final batch',()=>{
  storeFor(user).deleteProperty('NOTIFIED_SETUP');calendars.set(storeFor(user).getProperty('OUTPUT_CALENDAR_ID'),[]);
  call('SCHOOL.maxMutationsPerRun=2');const before=sentMail.length;
  assert.equal(call('syncFreePeriods()').pending,4);assert.equal(sentMail.length,before);
  assert.equal(call('syncFreePeriods()').pending,2);assert.equal(sentMail.length,before);
  assert.equal(call('syncFreePeriods()').pending,0);assert.equal(sentMail.length,before+1);
  call('SCHOOL.maxMutationsPerRun=100');
});
test('Mail failure does not undo calendar completion; next successful run retries',()=>{
  storeFor(user).deleteProperty('NOTIFIED_SETUP');mailFailure=true;const before=sentMail.length;
  const r=call('syncFreePeriods()');assert.equal(r.pending,0);assert.ok(r.message.includes('email is delayed'));
  assert.equal(output().length,6);assert.ok(storeFor(user).getProperty('NOTIFICATION_ERROR'));
  mailFailure=false;call('syncFreePeriods()');assert.equal(sentMail.length,before+1);
  assert.equal(storeFor(user).getProperty('NOTIFICATION_ERROR'),null);
});
test('Exhausted mail quota delays email without failing calendar sync',()=>{
  storeFor(user).deleteProperty('NOTIFIED_SETUP');mailQuota=0;const before=sentMail.length;
  assert.equal(call('syncFreePeriods()').pending,0);assert.equal(sentMail.length,before);
  assert.equal(storeFor(user).getProperty('NOTIFIED_SETUP'),null);
  mailQuota=100;call('syncFreePeriods()');assert.equal(sentMail.length,before+1);
});
test('Completion email discloses skipped dates instead of claiming full coverage',()=>{
  storeFor(user).deleteProperty('NOTIFIED_SETUP');calendars.set(schoolId,[marker('F'),{...marker('G'),id:'conflict'}]);
  call('syncFreePeriods()');const mail=sentMail.at(-1);
  assert.ok(mail.subject.includes('skipped'));assert.ok(mail.body.includes('Dates skipped: 1'));
  assert.ok(mail.body.includes('does not confirm coverage'));
});
test('Saved status survives reopening and notifications never cross users',()=>{
  const s=call('getSetup()');assert.ok(s.lastStatus.length>0);
  assert.equal(JSON.parse(s.diagnostics).pending,0);
  const aStatus=storeFor(user).getProperty('LAST_STATUS');
  as('teacher.b@lfanet.org');assert.notEqual(storeFor(user).getProperty('LAST_STATUS'),aStatus);
  assert.equal(call('getSetup()').email,'teacher.b@lfanet.org');
});
test('After initial full-year completion, nearby check covers today plus 35 days',()=>{
  const c=vm.createContext({});vm.runInContext(source,c);
  const result=vm.runInContext(`syncWindow_('2026-11-14',{getProperty:function(k){return ({OUTPUT_CALENDAR_ID:'out',FULL_SYNC_COMPLETE:'2026-08-01/2027-06-01/out',LAST_FULL_SYNC:new Date().toISOString()})[k] || null;}})`,c);
  assert.equal(result.nearby,true);assert.equal(result.window.start,'2026-11-14');assert.equal(result.window.end,'2026-12-20');
});
test('Incomplete initial setup and changed school year still use annual window',()=>{
  const c=vm.createContext({});vm.runInContext(source,c);
  for(const today of ['2026-11-14','2027-08-20']) {
    const r=vm.runInContext(`syncWindow_('${today}',{getProperty:function(){return null;}})`,c);
    assert.equal(r.nearby,false);assert.ok(r.fullState.ranges.some(x=>x.start.endsWith('-08-01')));
  }
});
test('Stale full-year pass runs again, so farther-out changes are not ignored',()=>{
  const c=vm.createContext({});vm.runInContext(source,c);
  const r=vm.runInContext(`syncWindow_('2026-11-14',{getProperty:function(k){return ({OUTPUT_CALENDAR_ID:'out',FULL_SYNC_COMPLETE:'2026-08-01/2027-06-01/out',LAST_FULL_SYNC:new Date(Date.now()-7*3600000).toISOString()})[k] || null;}})`,c);
  assert.equal(r.nearby,false);
});
test('Nearby reconciliation removes a booked block without touching farther-out blocks',()=>{
  as('teacher.a@lfanet.org');calendars.set(schoolId,[marker('G')]);
  calendars.set(user,[]);call('syncFreePeriods()');
  const id=storeFor(user).getProperty('OUTPUT_CALENDAR_ID');
  calendars.get(id).push({id:'far-away',summary:'Free Period A1',start:{dateTime:'2027-05-10T08:10:00-05:00'},end:{dateTime:'2027-05-10T08:55:00-05:00'},description:'LFA_FREE_PERIODS_V1\n2027-05-10/1'});
  call(`syncWindow_=function(){return {window:{start:'${date}',end:'${next}'},nearby:true};}`);
  calendars.set(user,[event('Cycle meeting','12:00','12:45')]);
  call('syncFreePeriods()');
  assert.ok(!summaries().includes('Free Period G5'));
  assert.ok(output().some(e=>e.id==='far-away'));
});
function withCalendarList(overrides,fn) {
  const api=context.Calendar.CalendarList,original={...api};Object.assign(api,overrides);
  try {fn();} finally {Object.assign(api,original);}
}
test('Missing shared school calendar is subscribed by exact ID and selected',()=>{
  let added;
  withCalendarList({get(){throw new Error('404 Not Found');},insert(body){added=body;return {...body,accessRole:'reader'};}},()=>{
    assert.equal(call('ensureSchoolSubscribed_()'),schoolId);
    assert.equal(added.id,schoolId);assert.equal(added.selected,true);assert.equal(added.hidden,false);
  });
});
test('Existing calendar with a personal name is reused without duplicates',()=>{
  withCalendarList({get:id=>({id,summary:'My LFA Letter Days',accessRole:'reader',selected:true}),insert(){throw new Error('Must not duplicate');},patch(){throw new Error('Must not rename');}},()=>{
    assert.equal(call('ensureSchoolSubscribed_()'),schoolId);
  });
});
test('Unchecked or hidden school calendar is made visible without changing name',()=>{
  let patch;
  withCalendarList({get:id=>({id,summary:'Renamed',accessRole:'reader',selected:false,hidden:true}),patch(body,id){patch={body,id};}},()=>{
    call('ensureSchoolSubscribed_()');assert.equal(patch.id,schoolId);
    assert.deepEqual(Object.keys(patch.body).sort(),['hidden','selected']);
    assert.equal(patch.body.selected,true);assert.equal(patch.body.hidden,false);
  });
});
test('A subscription race reuses the calendar after an Already Exists response',()=>{
  let reads=0;
  withCalendarList({get(id){if(!reads++)throw new Error('404');return {id,accessRole:'reader',selected:true};},insert(){throw new Error('409 Already Exists');}},()=>{
    assert.equal(call('ensureSchoolSubscribed_()'),schoolId);assert.equal(reads,2);
  });
});
test('Missing sharing permissions stop activation before free-period writes',()=>{
  const count=audit.length;
  withCalendarList({get(){throw new Error('404');},insert(){throw new Error('403 Forbidden');}},()=>{
    assert.throws(()=>call("activate('teacher.a@lfanet.org')"),/share it/);
    assert.equal(audit.length,count);
  });
});
test('Busy-only school access is rejected because letter-day titles are unavailable',()=>{
  withCalendarList({get:id=>({id,accessRole:'freeBusyReader',selected:true})},()=>{
    assert.throws(()=>call('ensureSchoolSubscribed_()'),/Busy-only/);
  });
});
test('Annotated B/G titles, including suffix typos, retain their letter',()=>{
  for(const [title,expected] of [
    ['B day','B'],['B-Day (Tuesday with Break)','B'],['B day with (Tuesday with break)','B'],
    ['G day','G'],['G day with (Tuesdsay with zreak)','G'],['G-Day (Tuesday with Break)','G'],
    ['Day B (Tuesday with Break)','B'],['  g\u2011Day (late start)  ','G']
  ]) assert.equal(call('letter_('+JSON.stringify(title)+')'),expected,title);
});
test('Annotated A-G markers produce the same actual free blocks as plain titles',()=>{
  for(const letter of 'ABCDEFG') {
    const plain=marker(letter),annotated={...plain,summary:letter+' day with (Tuesday with break)'};
    const run=e=>Array.from(context.plan_(date,next,[e],[]).events.values(),x=>({summary:x.summary,start:x.start.dateTime,end:x.end.dateTime}));
    assert.deepEqual(run(annotated),run(plain));assert.ok(run(annotated).length>0);
  }
});
test('Tuesday annotations preserve Tuesday timing and G-day late start',()=>{
  const d='2026-11-17',end='2026-11-18';
  for(const [letter,first,period7] of [['B','08:10','13:00'],['G','08:40',null]]) {
    const event={summary:letter+'-Day (Tuesday with Break)',start:{date:d},end:{date:end}};
    const plan=context.plan_(d,end,[event],[]).events;
    assert.equal(plan.size,letter==='G'?6:8);
    assert.equal(+new Date(plan.get(d+'/1').start.dateTime),+context.at_(d,first));
    if(period7)assert.equal(+new Date(plan.get(d+'/7').start.dateTime),+context.at_(d,period7));
  }
});
test('Unrelated titles and ambiguous mixed-letter titles are not guessed',()=>{
  for(const title of ['Birthday','Band Day','A daylight event','Meeting about B-Day','H-Day','B-Day / G-Day','Day B changed to Day G'])
    assert.equal(call('letter_('+JSON.stringify(title)+')'),null,title);
});
test('Renaming a marker to include a note does not delete valid free periods',()=>{
  calendars.set(user,[]);calendars.set(schoolId,[marker('G')]);call('syncFreePeriods()');
  const before=output().filter(e=>e.start.dateTime.startsWith(date));
  calendars.set(schoolId,[{...marker('G'),summary:'G day with (Tuesdsay with zreak)'}]);
  call('syncFreePeriods()');
  assert.deepEqual(output().filter(e=>e.start.dateTime.startsWith(date)),before);
});
test('Developer receives setup alerts at the exact configured address',()=>{
  const alerts=sentMail.filter(m=>m.to==='seoyeonchoi2001@gmail.com' && m.subject.includes('setup requested'));
  assert.ok(alerts.some(m=>m.body.includes('teacher.a@lfanet.org')));
  assert.ok(alerts.some(m=>m.body.includes('teacher.b@lfanet.org')));
});
test('Repeated setup clicks are throttled per user',()=>{
  const before=sentMail.length;
  call("developerAlert_('started','Setup requested')");
  call("developerAlert_('started','Setup requested')");
  assert.equal(sentMail.length,before);
});
test('Background failure emails include stage/cause without raw private error text',()=>{
  storeFor(user).deleteProperty('DEV_ALERT_failed');
  const list=context.Calendar.Events.list;
  try {
    context.Calendar.Events.list=function(id,options){if(id===schoolId)throw new Error('403 Forbidden PRIVATE_MEETING_DETAILS');return list(id,options);};
    assert.throws(()=>call('syncFreePeriods()'),/403/);
    const alert=sentMail.at(-1);assert.equal(alert.to,'seoyeonchoi2001@gmail.com');
    assert.ok(alert.body.includes('Reading letter-day calendar'));
    assert.ok(alert.body.includes('Access or authorization'));
    assert.ok(!alert.body.includes('PRIVATE_MEETING_DETAILS'));
    assert.ok(storeFor(user).getProperty('LAST_ERROR').includes('PRIVATE_MEETING_DETAILS'));
    const count=sentMail.length;assert.throws(()=>call('syncFreePeriods()'),/403/);assert.equal(sentMail.length,count);
  } finally {context.Calendar.Events.list=list;}
});
test('Developer mail failures do not stop synchronization',()=>{
  storeFor(user).deleteProperty('DEV_ALERT_failed');mailFailure=true;
  try {
    assert.doesNotThrow(()=>call("developerAlert_('failed','Writing changes',new Error('429 quota'))"));
    assert.ok(storeFor(user).getProperty('DEV_ALERT_ERROR'));
    assert.equal(call('syncFreePeriods()').pending,0);
  } finally {mailFailure=false;}
});
test('Alert categorizes range and quota failures rather than calling them success',()=>{
  for(const [message,expected] of [['The requested time range is too long','time range'],['429 too many requests','quota or rate limit']]) {
    storeFor(user).deleteProperty('DEV_ALERT_RETRY_AFTER');storeFor(user).deleteProperty('DEV_ALERT_failed');
    call("developerAlert_('failed','Reading calendars',new Error("+JSON.stringify(message)+"))");
    assert.ok(sentMail.at(-1).body.includes(expected));
  }
});
test('Developer success alert waits for all initial setup batches to finish',()=>{
  storeFor(user).deleteProperty('DEV_ALERT_success');storeFor(user).deleteProperty('DEV_ALERT_RETRY_AFTER');
  storeFor(user).deleteProperty('FULL_SYNC_COMPLETE');calendars.set(user,[]);calendars.set(schoolId,[marker('G')]);
  calendars.set(storeFor(user).getProperty('OUTPUT_CALENDAR_ID'),[]);
  call(`syncWindow_=function(){return {window:{start:'${date}',end:'${next}'},nearby:false};}; SCHOOL.maxMutationsPerRun=2;`);
  const notices=()=>sentMail.filter(m=>m.to==='seoyeonchoi2001@gmail.com' && m.subject.includes('setup completed'));
  const before=notices().length;
  assert.equal(call('syncFreePeriods()').pending,4);assert.equal(notices().length,before);
  assert.equal(call('syncFreePeriods()').pending,2);assert.equal(notices().length,before);
  assert.equal(call('syncFreePeriods()').pending,0);assert.equal(notices().length,before+1);
  assert.ok(notices().at(-1).body.includes('Free blocks calculated: 6'));
  call('SCHOOL.maxMutationsPerRun=100');
});
test('Developer success is not emailed again for routine successful checks',()=>{
  const count=sentMail.length;
  call('syncFreePeriods()');call('syncFreePeriods()');assert.equal(sentMail.length,count);
});
test('Developer completion alert explicitly identifies skipped dates',()=>{
  storeFor(user).deleteProperty('DEV_ALERT_success');
  calendars.set(schoolId,[marker('F'),{...marker('G'),id:'conflict'}]);call('syncFreePeriods()');
  const mail=sentMail.filter(m=>m.to==='seoyeonchoi2001@gmail.com' && m.subject.includes('setup completed')).at(-1);
  assert.ok(mail.subject.includes('dates skipped'));assert.ok(mail.body.includes('Dates skipped: 1'));
});
test('Full-year date ranges cover the year exactly once and prioritize upcoming dates',()=>{
  const c=vm.createContext({});vm.runInContext(source,c);
  const r=c.syncWindow_('2026-11-17',{getProperty:()=>null});
  assert.equal(r.window.start,'2026-11-17');
  const all=[];
  for(const span of r.fullState.ranges){assert.ok((new Date(span.end)-new Date(span.start))/86400000<=35);for(let d=span.start;d<span.end;d=c.addDays_(d,1))all.push(d);}
  assert.equal(new Set(all).size,all.length);assert.equal(all.length,304);
  assert.equal([...all].sort()[0],'2026-08-01');assert.equal([...all].sort().at(-1),'2027-05-31');
});
test('Completed chunks advance checkpoints; completion notification waits for last range',()=>{
  as('teacher.a@lfanet.org');const p=storeFor(user);
  for(const k of ['FULL_SCAN_STATE','FULL_SYNC_COMPLETE','NEXT_SYNC_AFTER','NOTIFIED_SETUP','DEV_ALERT_success','DEV_ALERT_RETRY_AFTER'])p.deleteProperty(k);
  calendars.set(user,[]);calendars.set('classes-a',[]);calendars.set(p.getProperty('OUTPUT_CALENDAR_ID'),[]);
  calendars.set(schoolId,[0,1,2].map(n=>({summary:'A-Day',start:{date:context.addDays_(date,n)},end:{date:context.addDays_(date,n+1)}})));
  const c=vm.createContext({...context});vm.runInContext(source,c);
  vm.runInContext(`installTriggers_=function(){};academicWindow_=function(){return {start:'${date}',end:'2027-01-14'};};SCHOOL.scanChunkDays=1;SCHOOL.nearbyDays=0;`,c);
  const before=sentMail.filter(m=>m.to===user).length;
  assert.equal(c.syncFreePeriods().setupPending,true);assert.equal(JSON.parse(p.getProperty('FULL_SCAN_STATE')).index,1);
  assert.equal(sentMail.filter(m=>m.to===user).length,before);
  assert.equal(c.syncFreePeriods().setupPending,true);assert.equal(JSON.parse(p.getProperty('FULL_SCAN_STATE')).index,2);
  assert.equal(c.syncFreePeriods().setupPending,false);assert.equal(p.getProperty('FULL_SCAN_STATE'),null);
  assert.equal(Number(p.getProperty('FULL_FREE_COUNT')),24);assert.equal(output().length,24);
  assert.equal(sentMail.filter(m=>m.to===user).length,before+1);
});
test('Quota failure preserves checkpoint and backs off without more API reads',()=>{
  const p=storeFor(user);p.deleteProperty('FULL_SCAN_STATE');p.deleteProperty('FULL_SYNC_COMPLETE');
  const c=vm.createContext({...context});vm.runInContext(source,c);
  vm.runInContext(`installTriggers_=function(){};academicWindow_=function(){return {start:'${date}',end:'2027-01-14'};};SCHOOL.scanChunkDays=1;`,c);
  const original=context.Calendar.Events.list;let reads=0;
  try {
    context.Calendar.Events.list=function(){reads++;throw new Error('429 Rate limit exceeded');};
    assert.throws(()=>c.syncFreePeriods(),/429/);
    assert.equal(JSON.parse(p.getProperty('FULL_SCAN_STATE')).index,0);
    const previous=reads;assert.ok(c.syncFreePeriods().message.includes('temporarily limited'));assert.equal(reads,previous);
  } finally {context.Calendar.Events.list=original;p.deleteProperty('NEXT_SYNC_AFTER');}
});
test('Temporary Google failure saves progress and prevents immediate API retries',()=>{
  const p=storeFor(user);p.deleteProperty('NEXT_SYNC_AFTER');
  const original=context.Calendar.Events.list;let reads=0;
  try {
    context.Calendar.Events.list=function(){reads++;throw new Error('503 Backend Error');};
    assert.throws(()=>call('syncFreePeriods()'),/503/);
    const issue=JSON.parse(p.getProperty('LAST_ISSUE'));
    assert.equal(issue.category,'temporary_service');assert.equal(issue.retryable,true);
    assert.ok(issue.retryAfter);const previous=reads;
    assert.ok(call('syncFreePeriods()').message.includes('temporarily unavailable'));
    assert.equal(reads,previous);
  } finally {context.Calendar.Events.list=original;p.deleteProperty('NEXT_SYNC_AFTER');}
});
test('Rate-limit 403 is retryable while sharing 403 requires attention',()=>{
  assert.equal(call("classifyFailure_(new Error('403 rateLimitExceeded')).category"),'rate_limit');
  assert.equal(call("classifyFailure_(new Error('403 Forbidden')).retryable"),false);
});
test('Manual refresh gives a clear permission message without raw API details',()=>{
  const p=storeFor(user);p.deleteProperty('NEXT_SYNC_AFTER');
  const original=context.Calendar.Events.list;
  try {
    context.Calendar.Events.list=function(){throw new Error('403 Forbidden PRIVATE_EVENT_TEXT');};
    const result=call('refreshNow()');assert.equal(result.needsAttention,true);
    assert.ok(result.message.includes('Calendar access'));assert.ok(!result.message.includes('PRIVATE_EVENT_TEXT'));
    assert.ok(p.getProperty('LAST_ERROR').includes('PRIVATE_EVENT_TEXT'));
  } finally {context.Calendar.Events.list=original;}
});
test('Successful retry clears stale issue status',()=>{
  call('syncFreePeriods()');assert.equal(storeFor(user).getProperty('LAST_ISSUE'),null);
});
console.log('\n'+passes.length+' tests passed. Mocks only; live triggers/deployment and email delivery were not tested.');
