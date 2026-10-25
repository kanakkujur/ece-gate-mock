import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mathematicsQuestion} from '../src/math-questions.js';
import {normalizeSet,scoreSet} from '../src/practice.js';
test('mathematics formulas produce known independently calculated numeric results',()=>{
  const expected=[3,38,27,8,61,7.5,0.0667,14,7,0.0909,16,0.3846,928];
  expected.forEach((answer,index)=>assert.equal(mathematicsQuestion({subject:'Engineering Mathematics',type:'NAT',marks:1,index}).answer,answer));
});
test('a 65-question mathematics paper has valid answer shapes and totals 100',()=>{
  const questions=Array.from({length:65},(_,index)=>mathematicsQuestion({subject:'Engineering Mathematics',type:['MCQ','MSQ','NAT'][index%3],marks:index<30?1:2,index}));
  const set=normalizeSet({questions});
  assert.equal(new Set(questions.map(q=>q.question)).size,65);
  const answers=Object.fromEntries(questions.map((q,i)=>[i,q.answer]));
  const result=scoreSet(set,answers);assert.equal(result.score,100);assert.equal(result.correct,65);
  questions.filter(q=>q.type==='MSQ').forEach(q=>{assert.equal(q.answer.length,2);assert.equal(new Set(Object.values(q.options)).size,4);});
});
test('unsupported specific topics still use AI rather than unrelated formulas',()=>{
  assert.equal(mathematicsQuestion({subject:'Engineering Mathematics',topic:'residue theorem',type:'MCQ',marks:1,index:0}),null);
});
