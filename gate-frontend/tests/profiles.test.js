import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileRegistry,readProfile,writeProfile,makeSnapshot,restoreSnapshots} from '../src/profiles.js';
import {sharedDriveData} from '../src/drive-data.js';
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};};
const paper={id:'paper',title:'Practice paper',subject:'Networks',difficulty:'easy',questions:[{type:'MCQ',marks:1,question:'What is the correct numerical result of the calculation?',options:{A:'1',B:'2',C:'3',D:'4'},answer:'A'}]};
const result=id=>({id,set:paper,answers:{0:'A'},submittedAt:'2026-10-25T12:00:00Z'});
test('profiles isolate attempts, history and selected Drive files but share papers',()=>{
  const storage=memory();writeProfile(storage,'local-default','history',[result('old')]);writeProfile(storage,'local-brother','history',[result('new')]);
  assert.equal(readProfile(storage,'local-default','history',[])[0].id,'old');assert.equal(readProfile(storage,'local-brother','history',[])[0].id,'new');
  writeProfile(storage,'local-brother','attempt',{id:'in-progress'});assert.equal(readProfile(storage,'local-default','attempt',null),null);
  writeProfile(storage,'google-1','drive-files',[{id:'private-file'}]);assert.deepEqual(readProfile(storage,'google-2','drive-files',[]),[]);
  writeProfile(storage,'local-default','sets',[paper]);assert.equal(readProfile(storage,'local-brother','sets',[])[0].id,'paper');
});
test('legacy local progress remains in the default profile',()=>{
  const storage=memory();storage.setItem('gate-studio:history',JSON.stringify([result('legacy')]));
  const registry=profileRegistry(storage);assert.equal(registry.activeId,'local-default');assert.equal(readProfile(storage,registry.activeId,'history',[])[0].id,'legacy');
});
test('backups exclude family credentials and reject another profile’s progress',()=>{
  const storage=memory();const profile={id:'google-1',name:'First learner',email:'first@example.test'};
  writeProfile(storage,profile.id,'history',[result('own')]);writeProfile(storage,profile.id,'connection',{key:'PRIVATE_FAMILY_SECRET_NOT_FOR_BACKUP'});
  const snapshot=makeSnapshot(storage,profile);assert.equal(JSON.stringify(snapshot).includes('PRIVATE_FAMILY_SECRET_NOT_FOR_BACKUP'),false);
  assert.equal(restoreSnapshots(storage,{id:'google-2'},[snapshot]),0);assert.deepEqual(readProfile(storage,'google-2','history',[]),[]);
});
test('restoring devices merges completed results and preserves the local unfinished test',()=>{
  const storage=memory();const profile={id:'google-1',name:'Learner'};
  writeProfile(storage,profile.id,'history',[result('local')]);writeProfile(storage,profile.id,'attempt',{id:'keep-local'});
  const snapshot={kind:'gate-profile-backup',version:1,profile,updatedAt:'2026-10-25T12:00:00Z',history:[result('remote')],attempt:{id:'remote',set:paper,answers:{},remaining:300,deadline:2000,timerMode:'practice'},driveFiles:[{id:'shared-file',name:'shared-paper-library.json'}]};
  restoreSnapshots(storage,profile,[snapshot,snapshot]);assert.equal(readProfile(storage,profile.id,'history',[]).length,2);assert.equal(readProfile(storage,profile.id,'attempt',null).id,'keep-local');assert.equal(readProfile(storage,profile.id,'drive-files',[]).length,1);
});
test('shared connection data cannot override the API host and paper imports are validated',()=>{
  const setup=sharedDriveData({kind:'gate-family-connection',version:1,key:'family-fixture-key',url:'https://untrusted.example'});assert.equal(setup.key,'family-fixture-key');assert.equal(setup.url,undefined);
  assert.equal(sharedDriveData({kind:'gate-paper-library',papers:[paper]}).papers.length,1);
  assert.throws(()=>sharedDriveData({kind:'gate-paper-library',papers:[{questions:[]}]}));
});
