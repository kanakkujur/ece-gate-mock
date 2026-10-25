import {normalizeSet} from './practice.js';
import {makeSnapshot} from './profiles.js';
import {googleSession,saveDriveBackup} from './google-drive-client.js';
export function sharedDriveData(data) {
  if(data?.kind==='gate-family-connection'&&data.version===1){
    if(typeof data.key!=='string'||!data.key.trim()||data.key.length>512||/[\u0000-\u001f]/.test(data.key))throw new Error('Invalid family connection file.');
    return {key:data.key.trim(),papers:[]};
  }
  if(data?.kind==='gate-paper-library'&&Array.isArray(data.papers))return {...(data.key?sharedDriveData({kind:'gate-family-connection',version:1,key:data.key}):{}),papers:data.papers.map(normalizeSet)};
  if(Array.isArray(data?.questions))return {papers:[normalizeSet(data)]};
  throw new Error('Choose a GATE Studio connection file, paper library, or question paper.');
}
export async function backupCurrentProfile(storage,profile) {
  const session=googleSession();
  if(!session.connected||profile.id!==`google-${session.account?.sub}`)return false;
  let device=storage.getItem('gate-studio:device-id');
  if(!device||!/^[A-Za-z0-9-]{1,80}$/.test(device)){device=crypto.randomUUID();storage.setItem('gate-studio:device-id',device);}
  await saveDriveBackup(makeSnapshot(storage,profile),device);return true;
}
