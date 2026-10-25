import {scoreSet} from './practice.js';

export function paperKind(set) {
  if(set.paperMode==='full'||set.full===true||set.mode==='main')return 'full';
  if(set.paperMode==='subject'||set.full===false)return 'subject';
  if(set.paperMode==='mixed')return 'mixed';
  const subjects=new Set(set.questions.map(q=>q.subject||set.subject).filter(Boolean));
  if(set.questions.length===65&&set.subject==='Mixed ECE')return 'full';
  if(subjects.size===1&&!['Mixed ECE','Mixed','Networks & Analog Circuits'].includes(set.subject))return 'subject';
  return 'mixed';
}

export function completedAttempts(history) {
  const unique=new Map();
  for(const attempt of Array.isArray(history)?history:[]) {
    if(!attempt?.id||!attempt.submittedAt||!Array.isArray(attempt.set?.questions)||!attempt.set.questions.length||!Number.isFinite(Date.parse(attempt.submittedAt)))continue;
    const result=scoreSet(attempt.set,attempt.answers||{});
    if(result.maxScore<=0)continue;
    const row={...attempt,result,kind:paperKind(attempt.set),scorePercent:100*result.score/result.maxScore,time:Date.parse(attempt.submittedAt),learner:attempt.learner||'Learner'};
    if(!unique.has(row.id)||row.time>=unique.get(row.id).time)unique.set(row.id,row);
  }
  return [...unique.values()].sort((a,b)=>a.time-b.time||String(a.id).localeCompare(String(b.id)));
}

export function summarize(attempts) {
  if(!attempts.length)return {count:0,averageScore:null,bestScore:null,accuracy:null,completion:null,latest:null,change:null,correct:0,attempted:0,questions:0,negativeMarks:0};
  const correct=attempts.reduce((sum,a)=>sum+a.result.correct,0);
  const attempted=attempts.reduce((sum,a)=>sum+a.result.attempted,0);
  const questions=attempts.reduce((sum,a)=>sum+a.set.questions.length,0);
  const latest=attempts.at(-1),previous=attempts.at(-2);
  return {count:attempts.length,averageScore:attempts.reduce((sum,a)=>sum+a.scorePercent,0)/attempts.length,bestScore:Math.max(...attempts.map(a=>a.scorePercent)),accuracy:attempted?100*correct/attempted:null,completion:100*attempted/questions,latest,change:previous?latest.scorePercent-previous.scorePercent:null,correct,attempted,questions,negativeMarks:attempts.reduce((sum,a)=>sum+a.result.items.reduce((n,item)=>n+Math.max(0,-item.score),0),0)};
}

export function buildStatistics(history,filters={},now=Date.now()) {
  const all=completedAttempts(history);
  const learners=[...new Set(all.map(a=>a.learner))].sort();
  const subjects=[...new Set(all.filter(a=>a.kind==='subject').map(a=>a.set.subject))].sort();
  const attempts=all.filter(a=>{
    if(filters.kind&&filters.kind!=='all'&&a.kind!==filters.kind)return false;
    if(filters.subject&&filters.subject!=='all'&&a.set.subject!==filters.subject)return false;
    if(filters.learner&&filters.learner!=='all'&&a.learner!==filters.learner)return false;
    if(filters.difficulty&&filters.difficulty!=='all'&&a.set.difficulty!==filters.difficulty)return false;
    if(filters.timing&&filters.timing!=='all'&&(a.timerMode||'practice')!==filters.timing)return false;
    if(filters.days&&filters.days!=='all'&&a.time<now-Number(filters.days)*86400000)return false;
    return true;
  });
  const bySubject=new Map();
  for(const attempt of attempts)attempt.set.questions.forEach((q,index)=>{
    const name=q.subject||attempt.set.subject||'Unspecified';
    const row=bySubject.get(name)||{subject:name,questions:0,attempted:0,correct:0,wrong:0,skipped:0,score:0,maxScore:0,attemptIds:new Set()};
    const item=attempt.result.items[index];
    row.questions++;row.attempted+=item.skipped?0:1;row.correct+=item.correct?1:0;row.wrong+=!item.correct&&!item.skipped?1:0;row.skipped+=item.skipped?1:0;
    row.score+=item.score;row.maxScore+=q.marks;row.attemptIds.add(attempt.id);bySubject.set(name,row);
  });
  const subjectRows=[...bySubject.values()].map(({attemptIds,...row})=>({...row,attempts:attemptIds.size,accuracy:row.attempted?100*row.correct/row.attempted:null,scorePercent:100*row.score/row.maxScore})).sort((a,b)=>a.scorePercent-b.scorePercent||a.subject.localeCompare(b.subject));
  return {all,attempts,summary:summarize(attempts),groups:Object.fromEntries(['full','subject','mixed'].map(kind=>[kind,summarize(attempts.filter(a=>a.kind===kind))])),subjects,learners,subjectRows};
}
