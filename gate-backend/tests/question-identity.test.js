import {test} from 'node:test';
import assert from 'node:assert/strict';
import {questionIdentity} from '../question-identity.js';
test('detects the same problem across superscripts and appended options',()=>{
  const a={question:'Find the area between y = x^2 − 4x + 3 and y = x + 1. The options are A) 9, B) 10.'};
  const b={question:'Find the area between y = x² - 4x + 3 and y = x + 1.'};
  assert.equal(questionIdentity(a),questionIdentity(b));
});
test('different numeric givens or diagram values are distinct',()=>{
  assert.notEqual(questionIdentity({question:'Find current with 12 V.'}),questionIdentity({question:'Find current with 24 V.'}));
  assert.notEqual(questionIdentity({question:'Find current.',diagram:{r1:2}}),questionIdentity({question:'Find current.',diagram:{r1:3}}));
});
