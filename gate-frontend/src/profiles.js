import {normalizeSet} from './practice.js';
export const DEFAULT_PROFILE='local-default';
export function profileKey(profileId,key) {
  return !['sets','connection','job'].includes(key)&&profileId!==DEFAULT_PROFILE?`gate-studio:profile:${profileId}:${key}`:`gate-studio:${key}`;
}
export function readProfile(storage,id,key,fallback) {try{return JSON.parse(storage.getItem(profileKey(id,key)))??fallback;}catch{return fallback;}}
export function writeProfile(storage,id,key,value) {storage.setItem(profileKey(id,key),JSON.stringify(value));}
export function profileRegistry(storage) {
  let saved;try{saved=JSON.parse(storage.getItem('gate-studio:profiles'));}catch{}
  const connection=readProfile(storage,DEFAULT_PROFILE,'connection',{});
  const profiles=Array.isArray(saved)?saved.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'):[];
  if(!profiles.some(p=>p.id===DEFAULT_PROFILE))profiles.unshift({id:DEFAULT_PROFILE,name:connection.name||'Local learner',kind:'local'});
  const active=storage.getItem('gate-studio:active-profile');
  return {profiles,activeId:profiles.some(p=>p.id===active)?active:DEFAULT_PROFILE};
}
export function mergeResults(...histories) {
  const merged=new Map();
  for(const history of histories)for(let row of Array.isArray(history)?history:[])if(row?.id&&Array.isArray(row.set?.questions)&&row.submittedAt){
    try{row={...row,set:normalizeSet(row.set)};}catch{continue;}
    const old=merged.get(row.id);
    merged.set(row.id,{...old,...row,aiNotes:{...old?.aiNotes,...row.aiNotes},aiReferences:{...old?.aiReferences,...row.aiReferences}});
  }
  return [...merged.values()].sort((a,b)=>Date.parse(b.submittedAt)-Date.parse(a.submittedAt));
}
export function makeSnapshot(storage,profile) {
  return {kind:'gate-profile-backup',version:1,profile:{id:profile.id,name:profile.name,email:profile.email||''},updatedAt:new Date().toISOString(),history:readProfile(storage,profile.id,'history',[]),attempt:readProfile(storage,profile.id,'attempt',null),driveFiles:readProfile(storage,profile.id,'drive-files',[])};
}
export function restoreSnapshots(storage,profile,snapshots) {
  const matching=snapshots.filter(s=>s?.kind==='gate-profile-backup'&&s.version===1&&s.profile?.id===profile.id).sort((a,b)=>Date.parse(a.updatedAt)-Date.parse(b.updatedAt));
  const files=[...matching.flatMap(s=>Array.isArray(s.driveFiles)?s.driveFiles:[]),...readProfile(storage,profile.id,'drive-files',[])].filter(f=>typeof f.id==='string'&&/^[A-Za-z0-9_-]+$/.test(f.id));
  writeProfile(storage,profile.id,'drive-files',[...new Map(files.map(f=>[f.id,{id:f.id,name:String(f.name||'Drive file')}])).values()]);
  const local=readProfile(storage,profile.id,'history',[]);
  writeProfile(storage,profile.id,'history',mergeResults(...matching.map(s=>s.history),local));
  // Never overwrite an unfinished local test during cloud restore.
  if(!readProfile(storage,profile.id,'attempt',null)) {
    const attempt=[...matching].reverse().find(s=>s.attempt)?.attempt;
    if(Array.isArray(attempt?.set?.questions)&&attempt.answers&&Number.isFinite(attempt.remaining)&&Number.isFinite(attempt.deadline)&&['exam','practice'].includes(attempt.timerMode)){try{writeProfile(storage,profile.id,'attempt',{...attempt,set:normalizeSet(attempt.set)});}catch{}}
  }
  return matching.length;
}
