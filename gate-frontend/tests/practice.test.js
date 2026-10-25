import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSet,scoreSet,STARTER} from '../src/practice.js';
test('scores MCQ penalties, all-or-nothing MSQ, NAT tolerance and skipped questions',()=>{
  const result=scoreSet(STARTER,{0:'A',1:['B','A'],2:'-5.009',3:'B',4:'8.1'});
  assert.equal(result.correct,3);assert.equal(result.wrong,2);assert.equal(result.skipped,1);
  assert.ok(Math.abs(result.score-(5-1/3))<1e-9);
  assert.equal(result.items[4].score,0);
});
test('incorrect MSQ has no partial or negative marks; numeric zero is attempted',()=>{
  const set=normalizeSet({questions:[{type:'MSQ',marks:2,question:'Universal gates?',options:{A:'NAND',B:'NOR',C:'AND',D:'OR'},answer:['A','B']},{type:'NAT',marks:1,question:'Enter the value zero as a number.',answer:0}]});
  const r=scoreSet(set,{0:['A'],1:'0'});assert.equal(r.score,1);assert.equal(r.attempted,2);
});
test('rejects broken model or imported papers and normalizes option arrays',()=>{
  assert.throws(()=>normalizeSet({questions:[]}));
  assert.throws(()=>normalizeSet({questions:[{type:'NAT',question:'Find the specified numerical quantity.',answer:null}]}));
  assert.throws(()=>normalizeSet({questions:[{type:'MCQ',question:'Find the specified numerical quantity.',answer:'E',options:{A:'a',B:'b',C:'c',D:'d'}}]}));
  const set=normalizeSet({questions:[{type:'MCQ',question:'Find the specified numerical quantity.',marks:2,options:['A) a','B) b','C) c','D) d'],answer:'b',neg_marks:0}]});
  assert.equal(set.questions[0].options.A,'a');assert.equal(set.questions[0].neg_marks,2/3);
});
