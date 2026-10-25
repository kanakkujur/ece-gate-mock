import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateSetupLink,applyPrivateSetup} from '../src/family-setup.js';
function memory(initial){const values=new Map(Object.entries(initial||{}));return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};}
test('a private link saves the key once and removes the credential from the address',()=>{
  const link=new URL(privateSetupLink('private-family-fixture-key'));
  assert.equal(link.search,'');assert.ok(link.hash.startsWith('#setup='));
  const storage=memory({'gate-studio:connection':JSON.stringify({name:'Brother',url:'https://old.trycloudflare.com'})});let clean;
  const result=applyPrivateSetup({hash:link.hash,pathname:'/ece-gate-mock/',search:'?view=welcome'},storage,url=>clean=url);
  const settings=JSON.parse(storage.getItem('gate-studio:connection'));
  assert.equal(result.error,'');assert.equal(settings.key,'private-family-fixture-key');assert.equal(settings.name,'Brother');assert.equal(settings.auto,true);assert.equal(settings.url,'');assert.equal(clean,'/ece-gate-mock/?view=welcome');
  applyPrivateSetup({hash:'',pathname:'/ece-gate-mock/'},storage,()=>{throw new Error('Should not replace normal URL');});
  assert.equal(JSON.parse(storage.getItem('gate-studio:connection')).key,'private-family-fixture-key');
});
test('a broken link leaves the existing connection unchanged and still clears the fragment',()=>{
  const storage=memory({'gate-studio:connection':'{"key":"keep"}'});let clean;
  const result=applyPrivateSetup({hash:'#setup=not-valid-json',pathname:'/'},storage,url=>clean=url);
  assert.ok(result.error);assert.equal(storage.getItem('gate-studio:connection'),'{"key":"keep"}');assert.equal(clean,'/');
});
test('blocked storage reports failure without exposing a key in the URL',()=>{
  let clean;const link=new URL(privateSetupLink('another-private-fixture-key'));
  const result=applyPrivateSetup({hash:link.hash,pathname:'/'},{getItem(){return null;},setItem(){throw new Error('blocked');}},url=>clean=url);
  assert.match(result.error,/Could not save/);assert.equal(clean,'/');
});
