import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStatistics,completedAttempts,paperKind} from '../src/statistics.js';
import {normalizeSet} from '../src/practice.js';

const question=(subject,marks=1)=>({subject,marks,type:'MCQ',question:'Choose the correct numerical value for this problem.',options:{A:'1',B:'2',C:'3',D:'4'},answer:'A',solution:'The correct numerical value is one.'});
const full=normalizeSet({id:'full',full:true,title:'Full ECE mock',subject:'Mixed ECE',difficulty:'medium',questions:Array.from({length:65},(_,i)=>question(i<10?'General Aptitude':'Networks',i<5||i>=10&&i<35?1:2))});
const subject=normalizeSet({id:'subject',full:false,title:'Networks short set',subject:'Networks',difficulty:'easy',questions:[question('Networks',1),{type:'NAT',subject:'Networks',marks:2,question:'Calculate the numerical value zero for this problem.',answer:0}]});
const a={id:'a',set:full,answers:Object.fromEntries(full.questions.map((_,i)=>[i,'A'])),submittedAt:'2026-10-01T10:00:00Z',learner:'Kanak',timerMode:'exam'};
const b={id:'b',set:subject,answers:{0:'B'},submittedAt:'2026-10-02T10:00:00Z',learner:'Brother',timerMode:'practice'};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('full and subject attempts stay separate and scores compare by percentage',()=>{
  const stats=buildStatistics([b,a]);
  assert.equal(stats.groups.full.count,1);assert.equal(stats.groups.subject.count,1);
  assert.equal(stats.groups.full.averageScore,100);close(stats.groups.subject.averageScore,-100/9);
  close(stats.summary.averageScore,(100-100/9)/2);close(stats.summary.accuracy,100*65/66);
  assert.equal(stats.summary.questions,67);assert.equal(stats.summary.attempted,66);
  assert.equal(stats.attempts[0].id,'a');assert.equal(stats.summary.latest.id,'b');
});
test('subject breakdown includes questions inside a full mock and MCQ penalties',()=>{
  const stats=buildStatistics([a,b]);const networks=stats.subjectRows.find(row=>row.subject==='Networks');
  assert.equal(networks.questions,57);assert.equal(networks.correct,55);assert.equal(networks.attempted,56);
  assert.equal(networks.skipped,1);assert.equal(networks.attempts,2);assert.equal(networks.maxScore,88);
  close(networks.score,85-1/3);close(networks.accuracy,100*55/56);close(stats.summary.negativeMarks,1/3);
});
test('mode subject learner date difficulty and timing filters are applied',()=>{
  assert.equal(buildStatistics([a,b],{kind:'full'}).summary.count,1);
  assert.equal(buildStatistics([a,b],{kind:'subject',subject:'Networks'}).summary.latest.id,'b');
  assert.equal(buildStatistics([a,b],{learner:'Kanak',difficulty:'medium',timing:'exam'}).summary.latest.id,'a');
  assert.equal(buildStatistics([a,b],{days:'30'},Date.parse('2026-12-01T00:00:00Z')).summary.count,0);
  assert.equal(buildStatistics([a,b],{subject:'Analog Circuits'}).summary.averageScore,null);
});
test('empty and skipped-only histories do not invent accuracy or improvement',()=>{
  const empty=buildStatistics([]);assert.equal(empty.summary.count,0);assert.equal(empty.summary.averageScore,null);assert.equal(empty.summary.bestScore,null);
  const skipped=buildStatistics([{...b,answers:{}}]);assert.equal(skipped.summary.accuracy,null);assert.equal(skipped.summary.completion,0);assert.equal(skipped.summary.change,null);
});
test('duplicates are counted once and warm-ups are not classified as full ECE mocks',()=>{
  assert.equal(completedAttempts([a,a,b]).length,2);
  assert.equal(paperKind({subject:'Mixed ECE',questions:[question('Networks')]}),'mixed');
  assert.equal(paperKind({...subject,paperMode:undefined,full:undefined}),'subject');
  assert.equal(paperKind({...full,paperMode:undefined,full:undefined}),'full');
  assert.equal(normalizeSet({...full,full:true}).paperMode,'full');
});
