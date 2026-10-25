import {mathematicsQuestion} from '../gate-frontend/src/math-questions.js';
import {questionIdentity} from './question-identity.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { circuitQuestion } from '../gate-frontend/src/circuits.js';
import { normalizeSet } from '../gate-frontend/src/practice.js';

export function balanceQuestionTypes(plan) {
  if(plan.length!==65)return plan;
  const balanced=plan.map(slot=>({...slot,type:'MCQ'}));
  for(const marks of [1,2]) {
    let remaining=balanced.flatMap((slot,index)=>slot.marks===marks&&slot.subject!=='General Aptitude'?[index]:[]);
    // Aptitude-only single-subject practice still uses the requested practice mix.
    if(!remaining.length)remaining=balanced.flatMap((slot,index)=>slot.marks===marks?[index]:[]);
    for(const [type,count] of [['NAT',6],['MSQ',9]]) {
      const chosen=new Set(Array.from({length:count},(_,i)=>remaining[Math.floor((i+0.5)*remaining.length/count)]));
      for(const index of chosen)balanced[index].type=type;
      remaining=remaining.filter(index=>!chosen.has(index));
    }
  }
  return balanced;
}

export function paperPlan() {
  const plan = [];
  const add = (subject, ones, twos) => {
    for (let i=0;i<ones+twos;i++) plan.push({subject,marks:i<ones?1:2,type:subject==='General Aptitude'?'MCQ':['MCQ','MSQ','NAT'][i%3]});
  };
  add('General Aptitude',5,5);
  add('Engineering Mathematics',3,5);
  for (const [subject,ones,twos] of [['Networks',3,3],['Signals & Systems',3,3],['Electronic Devices',3,3],['Analog Circuits',3,3],['Digital Circuits',3,3],['Control Systems',3,3],['Communication Systems',2,4],['Electromagnetics',2,3]]) add(subject,ones,twos);
  return balanceQuestionTypes(plan);
}

export function createJobs({directory, generate, verify}) {
  fs.mkdirSync(directory,{recursive:true});
  const jobs = new Map();
  for (const name of fs.readdirSync(directory).filter(n=>n.endsWith('.json'))) {
    const job=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
    if(!Array.isArray(job.plan)||typeof job.id!=='string'||name!==`${job.id}.json`)continue;
    if (job.status==='running') {job.status='paused';job.error='Host restarted. Resume to continue from the last saved question.';}
    jobs.set(job.id,job);
  }
  let running=false;
  const controls=new Map();
  const save = job => {
    const target=path.join(directory,`${job.id}.json`);
    fs.writeFileSync(`${target}.tmp`,JSON.stringify(job));
    // Windows virus scanners can briefly lock the destination during replacement.
    for(let attempt=0;attempt<6;attempt++) {
      try {fs.renameSync(`${target}.tmp`,target);break;}
      catch(error) {
        if(attempt===5||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20*(attempt+1));
      }
    }
  };
  async function run(job) {
    if(running) throw new Error('Another paper is generating. Wait for it to finish.');
    const controller=new AbortController();controls.set(job.id,controller);
    running=true;job.status='running';job.error='';job.metrics ||= {modelCalls:0,templateQuestions:0,duplicatesRejected:0,generationMs:0,reviewMs:0};save(job);
    try {
      while(job.questions.length<job.plan.length) {
        controller.signal.throwIfAborted();
        const slot=job.plan[job.questions.length];
        const usedTopics=[...new Set(job.questions.filter(q=>q.subject===slot.subject).map(q=>q.topic))].slice(-8).join(', ');
        const template=mathematicsQuestion({...slot,index:job.questions.length,topic:job.full?'Mixed fundamentals':job.topic}) || ((job.full || job.questions.length%4===0) ? circuitQuestion({...slot,index:job.questions.length}) : null);
        let clean;
        let acceptedTopic=job.topic;
        let feedback="";
        const themes=slot.subject==='General Aptitude'?['percentage changes','ratios and mixtures','work and time','conditional probability','logical deductions','number sequences','English grammar','short reading comprehension','averages','data interpretation with a table in text']:slot.subject==='Engineering Mathematics'?['eigenvalues','definite integrals','first order differential equations','complex numbers','probability distributions','matrix rank','partial derivatives','Laplace transforms']:['fundamental laws','numerical analysis','system behaviour','limiting cases','design constraints','frequency response','transient response'];
        const subIndex=job.questions.filter(q=>q.subject===slot.subject).length;
        for(let retry=0;retry<3;retry++) {
          controller.signal.throwIfAborted();
          acceptedTopic=themes[(subIndex+retry)%themes.length];
          const generationStart=Date.now();
          if(!template)job.metrics.modelCalls++;
          const batch=template ? {questions:[template]} : await generate({subject:slot.subject,topic:`${job.topic}. Focus: ${themes[(subIndex+retry)%themes.length]}. Original problem number ${subIndex+1}, variant ${retry+1}. Stay strictly within the selected focus. Recently used topic labels (do not reuse the same problem): ${usedTopics || 'none'}`,difficulty:job.difficulty,count:1,typeMix:{MCQ:0,MSQ:0,NAT:0,[slot.type]:1},marks:slot.marks,feedback,seed:crypto.randomInt(1,2147483647),signal:controller.signal});
          controller.signal.throwIfAborted();
          if(!template)job.metrics.generationMs+=Date.now()-generationStart;
          const q=batch.questions?.[0];
          try {
            if(!q || q.type!==slot.type) throw new Error('Model returned the wrong question type.');
            clean=normalizeSet({questions:[{...q,marks:slot.marks}]}).questions[0];
            if(job.questions.some(old=>questionIdentity(old)===questionIdentity(clean))){job.metrics.duplicatesRejected++;throw new Error('Duplicate question detected.');}
            if(!template && verify){const reviewStart=Date.now();job.metrics.modelCalls++;const check=await verify(clean,{signal:controller.signal});controller.signal.throwIfAborted();job.metrics.reviewMs+=Date.now()-reviewStart;if(check.valid!==true)throw new Error(`Local review rejected the answer: ${check.reason || "Inconsistent solution"}`);clean.aiReview=check.reason;}
            break;
          } catch(error) {if(controller.signal.aborted)throw error;clean=null;feedback=error.message.replace(/^Question 1 /,"This draft ");if(retry===2)throw new Error(`Question ${job.questions.length+1} could not pass validation: ${feedback} Your earlier questions are saved. Resume to retry.`);}
        }
        if(template)job.metrics.templateQuestions++;
        job.questions.push({...clean,topic:template?clean.topic:acceptedTopic,subject:slot.subject,section:slot.subject==='General Aptitude'?'GA':'EC',id:job.questions.length});
        save(job);
      }
      job.status='done';job.source=[...new Set(job.questions.map(q=>q.source||'Local AI'))].join(' + ');save(job);
    } catch(error) {if(!controller.signal.aborted){job.status='paused';job.error=error.message;}save(job);}
    finally {controls.delete(job.id);running=false;}
  }
  function halt(id,status) {
    const job=jobs.get(id);if(!job)throw new Error('Paper not found.');
    if(job.status==='done')return job;
    job.status=status;job.error=status==='paused'?'Paused by you. Completed questions are saved.':'Stopped by you. Completed questions are saved; resume whenever you want.';
    controls.get(id)?.abort();save(job);return job;
  }
  return {
    pause(id){return halt(id,'paused');},
    stop(id){return halt(id,'stopped');},
    restart(id){
      if(running)throw new Error('Pause the active generation first.');
      const job=jobs.get(id);if(!job)throw new Error('Paper not found.');
      const backupDirectory=path.join(directory,'backups');fs.mkdirSync(backupDirectory,{recursive:true});
      const backupName=`${id}-${Date.now()}.json`;fs.writeFileSync(path.join(backupDirectory,backupName),JSON.stringify(job));
      job.recovery={backup:backupName,replacedQuestions:job.questions.length};job.questions=[];job.plan=balanceQuestionTypes(job.plan);delete job.metrics;
      void run(job);return job;
    },
    get busy(){return running;},
    list(){return [...jobs.values()];},
    get(id){return jobs.get(id);},
    create({full,subject,topic,difficulty,count}) {
      if(running) throw new Error('Another paper is generating.');
      const plan=full?paperPlan():balanceQuestionTypes(Array.from({length:count},(_,i)=>({subject,marks:count===65?(i<30?1:2):(i%2?2:1),type:['MCQ','MSQ','NAT'][i%3]})));
      const job={id:crypto.randomUUID(),title:full?'GATE ECE · Full mock paper':`${subject} · ${topic}`,subject:full?'Mixed ECE':subject,topic,difficulty,full,source:'Local DeepSeek + verified circuit templates · Review AI answer keys',createdAt:new Date().toISOString(),status:'queued',questions:[],plan};
      jobs.set(job.id,job);save(job);void run(job);return job;
    },
    resume(id){const job=jobs.get(id);if(!job)throw new Error('Paper not found.');if(job.status!=='done')void run(job);return job;}
  };
}
