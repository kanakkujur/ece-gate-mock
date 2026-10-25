import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createJobs,paperPlan} from '../paper-jobs.js';
const wait=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw new Error('Job timed out');};
test('mixed blueprint has 65 questions, 100 marks, 15 aptitude and 13 mathematics marks',()=>{
  const p=paperPlan();assert.equal(p.length,65);assert.equal(p.reduce((s,q)=>s+q.marks,0),100);
  assert.equal(p.filter(q=>q.subject==='General Aptitude').length,10);
  assert.equal(p.filter(q=>q.subject==='General Aptitude').reduce((s,q)=>s+q.marks,0),15);
  assert.equal(p.filter(q=>q.subject==='Engineering Mathematics').reduce((s,q)=>s+q.marks,0),13);
});
test('generation checkpoints survive a failed call and process restart; subject paper is 65/100',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gate-jobs-'));let calls=0;
  const generate=async({subject,typeMix,marks})=>{calls++;if(calls===3)throw new Error('power cut');const type=Object.keys(typeMix).find(k=>typeMix[k]);return {questions:[{subject,type,marks,question:`Distinct question ${calls}`,options:type==='NAT'?null:{A:'a',B:'b',C:'c',D:'d'},answer:type==='MCQ'?'A':type==='MSQ'?['A','B']:2,solution:'Worked answer'}]};};
  try {
    const first=createJobs({directory,generate});const job=first.create({full:false,subject:'Control Systems',topic:'Mixed',difficulty:'easy',count:65});
    await wait(()=>job.status==='paused');assert.equal(job.questions.length,2);
    const restarted=createJobs({directory,generate});const restored=restarted.get(job.id);assert.equal(restored.questions.length,2);
    restarted.resume(job.id);await wait(()=>restored.status==='done');assert.equal(restored.questions.length,65);
    assert.ok(restored.questions.every(q=>q.subject==='Control Systems'));assert.equal(restored.questions.reduce((s,q)=>s+q.marks,0),100);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
