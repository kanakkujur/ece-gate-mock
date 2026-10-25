import {test} from 'node:test';
import assert from 'node:assert/strict';
import {referenceInfo,retrieveReference} from '../reference.js';
test('private sample retrieval stays within its actual coverage',{skip:!referenceInfo()},()=>{
  const relevant=retrieveReference('Signals & Systems Z-transform region of convergence');
  assert.ok(relevant.references.length>0);assert.ok(relevant.references.every(r=>r.page>=8));
  assert.equal(retrieveReference('Networks series resistor voltage divider').context,'');
  assert.equal(retrieveReference('Analog Circuits amplifier gain').references.length,0);
});
