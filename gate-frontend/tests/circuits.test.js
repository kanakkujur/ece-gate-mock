import {test} from 'node:test';
import assert from 'node:assert/strict';
import {circuitQuestion,validDiagram} from '../src/circuits.js';
test('circuit numerical keys are derived from the displayed values',()=>{
  for(let index=0;index<30;index++)for(const subject of ['Networks','Analog Circuits']) {
    const q=circuitQuestion({subject,type:'NAT',marks:2,index});const d=q.diagram;
    assert.ok(validDiagram(d));
    const exact=d.kind==='series'?(d.r1+d.r2)/1000:d.kind==='parallel'?d.r1*d.r2/(d.r1+d.r2)/1000:d.kind==='voltage-divider'?d.voltage*d.r2/(d.r1+d.r2):-d.r2/d.r1;
    assert.equal(q.answer,Number(exact.toFixed(2)));
    const mcq=circuitQuestion({subject,type:'MCQ',marks:2,index});
    assert.equal(parseFloat(mcq.options[mcq.answer]),q.answer);
    assert.equal(new Set(Object.values(mcq.options)).size,4);
  }
});
test('rejects unsupported topologies and invalid component values',()=>{
  assert.equal(!!validDiagram({kind:'anything',r1:1,r2:2,voltage:3}),false);
  assert.equal(!!validDiagram({kind:'series',r1:-1,r2:2,voltage:3}),false);
});
