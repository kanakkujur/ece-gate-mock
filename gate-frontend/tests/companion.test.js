import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionResolver} from '../src/companion.js';
test('host pointer replaces an old tunnel without changing the saved key',async()=>{
  let calls=0;const settings={url:'https://old.trycloudflare.com',key:'private'};
  const resolve=createCompanionResolver({fetcher:async()=>{calls++;return {ok:true,json:async()=>({url:'https://current.trycloudflare.com'})};}});
  assert.equal(await resolve(settings,'kanakkujur.github.io'),'https://current.trycloudflare.com');
  assert.equal(await resolve(settings,'kanakkujur.github.io'),'https://current.trycloudflare.com');assert.equal(calls,1);assert.equal(settings.key,'private');
});
test('local and manually configured companions do not use the public pointer',async()=>{
  const resolve=createCompanionResolver({fetcher:async()=>{throw new Error('Unexpected request');}});
  assert.equal(await resolve({url:''},'127.0.0.1'),'');
  assert.equal(await resolve({auto:false,url:'https://manual.example'},'kanakkujur.github.io'),'https://manual.example');
});
test('an unavailable or invalid pointer preserves the last known address',async()=>{
  const resolve=createCompanionResolver({fetcher:async()=>({ok:true,json:async()=>({url:'http://untrusted.example'})})});
  assert.equal(await resolve({url:'https://saved.trycloudflare.com'},'kanakkujur.github.io'),'https://saved.trycloudflare.com');
});
