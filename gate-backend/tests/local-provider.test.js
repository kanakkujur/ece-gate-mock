import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyLocalQuestion} from '../aiProviders/local.js';
test('rejects missing worked solutions before invoking the model',async()=>{
  const result=await verifyLocalQuestion({solution:''});assert.equal(result.valid,false);
});
test('rejects a solution that admits its options do not match',async()=>{
  const result=await verifyLocalQuestion({solution:'The correct value is three. Wait a minute, that does not match any option provided.'});
  assert.equal(result.valid,false);
});
