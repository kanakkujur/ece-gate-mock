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
test('a rejected single-answer MSQ retries with feedback without losing the first question',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gate-msq-'));let msqCalls=0;
  const generate=async({typeMix,feedback})=>{
    const type=Object.keys(typeMix).find(k=>typeMix[k]);
    if(type==='MSQ') {msqCalls++;if(msqCalls===2)assert.match(feedback,/at least two correct choices/);}
    return {questions:[{type,marks:1,question:type==='MSQ'?'Which two system properties are true?':'Choose the correct system property.',options:{A:'Linear',B:'Time invariant',C:'Nonlinear',D:'Time varying'},answer:type==='MSQ'?(msqCalls===1?['A']:['A','B']):'A',solution:'A complete solution establishes the correct options.'}]};
  };
  try {
    const manager=createJobs({directory,generate});
    const job=manager.create({full:false,subject:'Control Systems',topic:'Basics',difficulty:'easy',count:2});
    await wait(()=>job.status==='done'||job.status==='paused');
    assert.equal(job.status,'done');assert.equal(job.questions.length,2);
    assert.equal(job.questions[0].type,'MCQ');assert.deepEqual(job.questions[1].answer,['A','B']);assert.equal(msqCalls,2);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('mixed mathematics paper completes without model calls or duplicate stems',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gate-math-'));let calls=0;
  try {
    const manager=createJobs({directory,generate:async()=>{calls++;throw new Error('Unexpected inference');}});
    const job=manager.create({full:false,subject:'Engineering Mathematics',topic:'Mixed fundamentals',difficulty:'medium',count:65});
    await wait(()=>job.status!=='running');
    assert.equal(job.status,'done');assert.equal(job.questions.length,65);assert.equal(calls,0);
    assert.equal(job.metrics.templateQuestions,65);assert.equal(job.metrics.duplicatesRejected,0);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
for(const action of ['pause','stop'])test(`${action} cancels inference, keeps saved questions and supports resume`,async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gate-control-'));let block=true,activeSignal;
  const generate=async({typeMix,signal})=>{
    const type=Object.keys(typeMix).find(k=>typeMix[k]);
    if(type==='MSQ'&&block){activeSignal=signal;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Cancelled')),{once:true}));}
    return {questions:[{type,marks:1,question:`A complete generated ${type} question about system properties.`,options:{A:'linear',B:'time invariant',C:'nonlinear',D:'time varying'},answer:type==='MSQ'?['A','B']:'A',solution:'This worked solution derives the correct properties.'}]};
  };
  try {
    const manager=createJobs({directory,generate});
    const job=manager.create({full:false,subject:'Control Systems',topic:'Mixed',difficulty:'easy',count:2});
    await wait(()=>!!activeSignal);const first=JSON.stringify(job.questions[0]);
    manager[action](job.id);await wait(()=>!manager.busy);
    assert.equal(activeSignal.aborted,true);assert.equal(job.status,action==='pause'?'paused':'stopped');assert.equal(job.questions.length,1);
    const saved=JSON.parse(fs.readFileSync(path.join(directory,`${job.id}.json`)));assert.equal(saved.status,job.status);
    block=false;manager.resume(job.id);await wait(()=>!manager.busy);
    assert.equal(job.status,'done');assert.equal(job.questions.length,2);assert.equal(JSON.stringify(job.questions[0]),first);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
