import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyLocalQuestion,generateQuestions} from '../aiProviders/local.js';
test('rejects missing worked solutions before invoking the model',async()=>{
  const result=await verifyLocalQuestion({solution:''});assert.equal(result.valid,false);
});
test('rejects a solution that admits its options do not match',async()=>{
  const result=await verifyLocalQuestion({solution:'The correct value is three. Wait a minute, that does not match any option provided.'});
  assert.equal(result.valid,false);
});
test('MSQ requests constrain the model to distinct multiple-answer arrays',async()=>{
  const previous=globalThis.fetch;
  try {
    globalThis.fetch=async(_url,options)=>{
      const body=JSON.parse(options.body);const item=body.format.properties.questions.items;
      assert.deepEqual(item.properties.type.enum,['MSQ']);
      assert.equal(item.properties.answer.minItems,2);
      assert.ok(item.properties.answer.enum.every(a=>a.length>=2&&new Set(a).size===a.length));
      assert.equal(item.properties.options.type,'object');
      return {ok:true,json:async()=>({response:JSON.stringify({questions:[{type:'MSQ',question:'Select all correct statements about this system.',marks:1,solution:'A and B are correct because both stated properties apply.',options:{A:'a',B:'b',C:'c',D:'d'},answer:['A','B']}]})})};
    };
    const data=await generateQuestions({count:1,typeMix:{MCQ:0,MSQ:1,NAT:0}});
    assert.deepEqual(data.questions[0].answer,['A','B']);
  } finally {globalThis.fetch=previous;}
});
