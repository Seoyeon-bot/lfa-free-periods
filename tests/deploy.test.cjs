const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {config,prepare,clean}=require('../scripts/prepare-deploy.cjs');
const valid={CLASPRC_JSON:JSON.stringify({tokens:{default:{refresh_token:'FAKE_TEST_TOKEN'}}}),APPS_SCRIPT_ID:'test-script-id',APPS_SCRIPT_DEPLOYMENT_ID:'AKfy_test_deployment'};
test('deployment requires all three configuration secrets',()=>{
  for(const key of Object.keys(valid)) assert.throws(()=>config({...valid,[key]:''}),/Missing/);
});
test('bad credentials fail with a generic message without exposing their value',()=>{
  const secret='DO_NOT_LOG_TOKEN';
  assert.throws(()=>config({...valid,CLASPRC_JSON:secret}),e=>!e.message.includes(secret) && /JSON/.test(e.message));
  for(const value of ['[]','null','{}','"string"'])assert.throws(()=>config({...valid,CLASPRC_JSON:value}),/object/);
});
test('URL pasted instead of Script ID or deployment ID is rejected',()=>{
  assert.throws(()=>config({...valid,APPS_SCRIPT_ID:'https://script.google.com/id'}),/Script ID/);
  assert.throws(()=>config({...valid,APPS_SCRIPT_DEPLOYMENT_ID:'https://script.google.com/s/AKfy123/exec'}),/deployment ID/);
});
test('deployment includes only src and credentials are private temporary files',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lfa-deploy-test-'));
  try {
    prepare(valid,dir);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'.clasp.json'),'utf8')),{scriptId:'test-script-id',rootDir:'src'});
    assert.equal(fs.statSync(path.join(dir,'.clasprc.json')).mode & 0o777,0o600);
    assert.throws(()=>prepare(valid,dir),/EEXIST/);
    clean(dir);assert.deepEqual(fs.readdirSync(dir),[]);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed validation writes no credential files',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lfa-deploy-invalid-'));
  try {assert.throws(()=>prepare({},dir));assert.deepEqual(fs.readdirSync(dir),[]);}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('workflow deployment depends on passing tests and is restricted to main',()=>{
  const yaml=fs.readFileSync(path.join(__dirname,'../.github/workflows/tests.yml'),'utf8');
  assert.match(yaml,/needs: test/);assert.match(yaml,/github.ref == 'refs\/heads\/main'/);
  assert.match(yaml,/clasp --auth \.clasprc\.json create-deployment --deploymentId/);
  assert.match(yaml,/if: always\(\)/);
  assert.ok(!yaml.includes('pull_request_target'));
});
