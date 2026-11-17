// Fifty real Node workers execute the production sync concurrently against
// simulated Google services. This tests isolation, not Google's capacity.
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
if(isMainThread) {
  const total=50,shared=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT*(total+2));
  const started=Date.now();
  Promise.all(Array.from({length:total},(_,i)=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{i,total,shared}});let result;
    worker.on('message',x=>{result=x;});worker.on('error',reject);
    worker.on('exit',code=>{if(code || !result)reject(new Error('Worker '+i+' failed'));else resolve(result);});
  }))).then(results=>{
    assert.equal(new Set(results.map(r=>r.output)).size,total);
    for(const r of results){assert.equal(r.count,7);assert.equal(r.pending,0);assert.ok(r.ownWrites);}
    const barrier=new Int32Array(shared);assert.equal(barrier[0],total);
    console.log('PASS 50 concurrent simulated teachers: isolated output, correct busy periods, no cross-account writes.');
    console.log('Simulation completed in '+((Date.now()-started)/1000).toFixed(1)+'s. This is NOT a Google API latency, quota, email, or deployment benchmark.');
  }).catch(error=>{console.error(error);process.exitCode=1;});
} else {
  const {i,total}=workerData,shared=new Int32Array(workerData.shared);
  const email='teacher'+i+'@lfanet.org',output='output-'+i,date='2026-11-18',end='2026-11-19';
  const source=fs.readFileSync(path.join(__dirname,'../src/Code.gs'),'utf8');
  const school=source.match(/schoolCalendarId: '([^']+)'/)[1];
  const props={ENABLED:'yes',ACCOUNT_EMAIL:email,OUTPUT_CALENDAR_ID:output};
  const entries=[],writes=[];
  const property={getProperty:k=>props[k] || null,setProperty(k,v){props[k]=v;return this;},deleteProperty(k){delete props[k];return this;},getProperties:()=>({...props})};
  let entered=false;
  const ctx=vm.createContext({Date,Map,Set,Math,Number,JSON,
    Session:{getEffectiveUser:()=>({getEmail:()=>email}),getActiveUser:()=>({getEmail:()=>email})},
    PropertiesService:{getUserProperties:()=>property,getScriptProperties:()=>({getProperties:()=>({})})},
    LockService:{getUserLock:()=>({tryLock:()=>Atomics.compareExchange(shared,i+1,0,1)===0,releaseLock:()=>Atomics.store(shared,i+1,0)}),
      getScriptLock:()=>({tryLock:()=>Atomics.compareExchange(shared,total+1,0,1)===0,releaseLock:()=>Atomics.store(shared,total+1,0)})},
    Utilities:{formatDate(d,tz,f){if(f==='Z')return '-0600';if(f==='yyyy-MM-dd')return d.toISOString().slice(0,10);return d.toISOString();}},
    MailApp:{getRemainingDailyQuota:()=>100,sendEmail(){}},
    Calendar:{CalendarList:{list:()=>({items:[{id:email,primary:true,selected:true,accessRole:'owner'},{id:school,summary:'All LFA Events',selected:true,accessRole:'reader'},{id:output,summary:'LFA Free Periods',selected:true,accessRole:'owner'}]}),get:id=>({id,accessRole:'owner',selected:true}),patch(){}},
      Events:{list(id){
        if(id===school)return {items:[{summary:'C-Day',start:{date},end:{date:end}}]};
        if(id===output)return {items:entries.map(e=>({...e}))};
        assert.equal(id,email);
        if(!entered){
          entered=true;Atomics.add(shared,0,1);Atomics.notify(shared,0);
          const deadline=Date.now()+45000;
          while(Atomics.load(shared,0)<total){const current=Atomics.load(shared,0);assert.ok(Date.now()<deadline,'Other accounts could not enter sync concurrently');Atomics.wait(shared,0,current,500);}
        }
        const start=i%2===0?'08:10':'10:45',finish=i%2===0?'08:55':'11:30';
        return {items:[{summary:'Class',start:{dateTime:date+'T'+start+':00-06:00'},end:{dateTime:date+'T'+finish+':00-06:00'}}]};
      },insert(event,id){assert.equal(id,output);writes.push(id);entries.push({...event,id:'generated-'+entries.length});},
      update(){throw new Error('Unexpected update');},remove(){throw new Error('Unexpected removal');}}
    }
  });
  vm.runInContext(source,ctx);
  vm.runInContext(`installTriggers_=function(){};academicWindow_=function(){return {start:'${date}',end:'${end}'};};SCHOOL.nearbyDays=0;`,ctx);
  const result=vm.runInContext('syncFreePeriods()',ctx);
  const blocked=i%2===0?'Free Period C1':'Free Period C4';assert.ok(!entries.some(e=>e.summary===blocked));
  assert.equal(props.OUTPUT_CALENDAR_ID,output);
  parentPort.postMessage({output,count:entries.length,pending:result.pending,ownWrites:writes.every(id=>id===output)});
}
