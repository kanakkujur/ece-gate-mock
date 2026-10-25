import {createCompanionResolver} from './companion.js';
let configuration=null,oauthClient=null,pending=null,session=null,account=null,base='',challenge=null;
const resolve=createCompanionResolver();
export function googleSession(){return {connected:!!session,account};}
async function call(path,body,owner=account?.sub){
  const captured=session;
  const r=await fetch(`${base}/api/local/google${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(captured?{Authorization:`Bearer ${captured}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  const data=await r.json();if(owner&&owner!==account?.sub)throw Error('Google account changed. Retry from the active profile.');
  if(!r.ok)throw Error(data.error||'The host is unavailable. Your local work is saved.');return data;
}
export async function loadGoogleConfig(){return configuration||={mode:'server',sharedFolderUrl:'https://drive.google.com/drive/folders/1n2ahSJrqpC1zLMd792zDYFY0iWkEl_cZ'};}
export async function prepareGoogle(){
  const settings=JSON.parse(localStorage.getItem('gate-studio:connection')||'{}');
  base=await resolve(settings,location.hostname);
  try{configuration={...await loadGoogleConfig(),...await call('/config')};}catch{configuration={...await loadGoogleConfig(),ready:false};}
  if(!configuration.ready)return configuration;
  if(!window.google?.accounts?.oauth2)await new Promise((yes,no)=>{const el=document.createElement('script');el.src='https://accounts.google.com/gsi/client';el.onload=yes;el.onerror=()=>no(Error('Could not load Google sign-in.'));document.head.append(el);});
  challenge={...await call('/challenge',{}),created:Date.now()};
  oauthClient=window.google.accounts.oauth2.initCodeClient({client_id:configuration.clientId,scope:'openid email profile https://www.googleapis.com/auth/drive.file',ux_mode:'popup',state:challenge.state,callback:r=>{if(r.error||r.state!==pending?.state){pending?.reject(Error('Google sign-in failed. Try again.'));}else pending?.resolve(r.code);pending=null;},error_callback:()=>{pending?.reject(Error('Google sign-in was closed.'));pending=null;}});
  return configuration;
}
export async function signInGoogle(){
  if(!oauthClient)throw Error('Start the host and configure its private Google credentials first.');
  session=null;account=null;
  if(!challenge||Date.now()-challenge.created>240000){await prepareGoogle();throw Error('Sign-in refreshed. Click Sign in once more.');}
  const {state}=challenge;challenge=null;
  const code=await new Promise((resolve,reject)=>{pending={resolve,reject,state};oauthClient.requestCode();});
  const data=await call('/exchange',{code,state});session=data.session;account=data.account;return account;
}
export function disconnectGoogle(){const old=session;if(old)fetch(`${base}/api/local/google/disconnect`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${old}`},body:'{}'}).catch(()=>{});session=null;account=null;}
export async function restoreDriveBackups(){return call('/backups');}
export async function saveDriveBackup(snapshot,deviceId){if(snapshot.profile.id!==`google-${account?.sub}`)throw Error('Connect the matching Google profile.');return call('/backup',{snapshot,deviceId});}
export async function readDriveJson(id){if(id!=='host-shared')throw Error('Use host sharing or import the downloaded JSON paper. Browser Picker has been removed.');return call('/shared');}
export async function pickDriveFiles(){return [{id:'host-shared',name:'Host paper library'}];}
