export const DRIVE_SCOPE='openid email profile https://www.googleapis.com/auth/drive.file';
let config=null,token=null,expires=0,account=null,oauthClient=null,pendingLogin=null;
const scripts=new Map();
function script(src){if(!scripts.has(src))scripts.set(src,new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.async=true;el.onload=resolve;el.onerror=()=>reject(new Error('Could not load Google sign-in. Check the internet connection.'));document.head.append(el);}));return scripts.get(src);}
export async function loadGoogleConfig(){
  if(config)return config;
  const r=await fetch(`${import.meta.env.BASE_URL}google-app.json`,{cache:'no-store'});
  if(!r.ok)throw new Error('Google sign-in needs owner setup.');config=await r.json();return config;
}
export async function prepareGoogle(){
  const c=await loadGoogleConfig();if(!c.clientId)return {...c,ready:false};
  await script('https://accounts.google.com/gsi/client');
  if(!oauthClient)oauthClient=window.google.accounts.oauth2.initTokenClient({client_id:c.clientId,scope:DRIVE_SCOPE,callback:response=>{
    if(response.error){pendingLogin?.reject(new Error(response.error_description||response.error));pendingLogin=null;return;}
    if(!window.google.accounts.oauth2.hasGrantedAllScopes(response,'https://www.googleapis.com/auth/drive.file')){pendingLogin?.reject(new Error('Google Drive access was not granted. Local profiles still work.'));pendingLogin=null;return;}
    token=response.access_token;expires=Date.now()+Number(response.expires_in)*1000;pendingLogin?.resolve();pendingLogin=null;
  },error_callback:error=>{pendingLogin?.reject(new Error(error.type==='popup_closed'?'Google sign-in was closed.':'Allow the Google sign-in popup and try again.'));pendingLogin=null;}});
  return {...c,ready:true};
}
function access(){if(!token||Date.now()>=expires-30000)throw new Error('Reconnect Google Drive to continue syncing. Your local work is saved.');return token;}
export function googleSession(){return {account,connected:!!token&&Date.now()<expires-30000};}
export async function signInGoogle(){
  if(!oauthClient)throw new Error('Google sign-in is not configured yet.');
  token=null;expires=0;account=null;
  await new Promise((resolve,reject)=>{pendingLogin={resolve,reject};oauthClient.requestAccessToken({prompt:'select_account'});});
  const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${access()}`}});if(!r.ok)throw new Error('Could not read the signed-in Google profile.');
  const user=await r.json();if(!user.sub||!user.email||!user.email_verified)throw new Error('Use a verified Google account.');account=user;return user;
}
export function disconnectGoogle(){token=null;expires=0;account=null;}
async function api(url,options={},owner=account?.sub){
  if(!owner||owner!==account?.sub)throw new Error('Google account changed. Retry from the active profile.');
  const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${access()}`,...options.headers},signal:AbortSignal.timeout(30000)});
  if(owner!==account?.sub)throw new Error('Google account changed. Retry from the active profile.');
  if(!r.ok){let message;try{message=(await r.json()).error?.message;}catch{}throw new Error(message||`Drive request failed (${r.status}).`);}return r;
}
export async function readDriveJson(id,owner=account?.sub){
  if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Invalid Drive file.');
  const r=await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`,{},owner);const text=await r.text();if(text.length>8e6)throw new Error('Choose a GATE Studio JSON file smaller than 8 MB.');return JSON.parse(text);
}
async function list(q,owner=account?.sub){const r=await api(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({q,fields:'files(id,name,modifiedTime),nextPageToken',pageSize:'1000'})}`,{},owner);const data=await r.json();if(data.nextPageToken)throw new Error('Too many backup files to restore in one operation.');return data.files||[];}
async function folder(owner=account?.sub){
  const user=googleSession().account;if(!user||user.sub!==owner)throw new Error('Sign in with the active Google profile first.');
  const existing=await list(`trashed=false and 'me' in owners and mimeType='application/vnd.google-apps.folder' and appProperties has {key='gateStudioOwner' and value='${user.sub}'}`,owner);
  if(existing[0])return existing[0].id;
  const r=await api('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'GATE_STUDIO_MY_PROGRESS',mimeType:'application/vnd.google-apps.folder',appProperties:{gateStudioOwner:user.sub}})},owner);return (await r.json()).id;
}
export async function restoreDriveBackups(){const owner=account?.sub;const parent=await folder(owner);const files=await list(`trashed=false and '${parent}' in parents and appProperties has {key='gateStudioKind' and value='profile-backup'}`,owner);const snapshots=[];for(const file of files)snapshots.push(await readDriveJson(file.id,owner));return snapshots;}
export async function saveDriveBackup(snapshot,deviceId){
  const user=googleSession().account;if(snapshot.profile.id!==`google-${user?.sub}`)throw new Error('Switch to the profile for the signed-in Google account before backing up.');
  const parent=await folder(user.sub);const files=await list(`trashed=false and '${parent}' in parents and appProperties has {key='gateStudioDevice' and value='${deviceId}'}`,user.sub);
  const body=JSON.stringify(snapshot);
  if(files[0]){await api(`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body},user.sub);return;}
  const boundary=`gate_${crypto.randomUUID()}`;
  const metadata={name:`progress-${deviceId}.json`,parents:[parent],mimeType:'application/json',appProperties:{gateStudioKind:'profile-backup',gateStudioDevice:deviceId}};
  await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`},user.sub);
}
export async function pickDriveFiles(){
  const c=await loadGoogleConfig();if(!c.apiKey||!c.projectNumber)throw new Error('The owner must configure the Google Picker API key and project number.');access();
  await script('https://apis.google.com/js/api.js');await new Promise(resolve=>window.gapi.load('picker',resolve));
  return new Promise(resolve=>{
    const g=window.google.picker;const view=new g.DocsView(g.ViewId.DOCS).setMimeTypes('application/json').setIncludeFolders(true);
    const picker=new g.PickerBuilder().setTitle('Choose GATE Studio setup or paper files').setAppId(c.projectNumber).setDeveloperKey(c.apiKey).setOAuthToken(access()).setOrigin(window.location.origin).addView(view).enableFeature(g.Feature.MULTISELECT_ENABLED).setCallback(data=>{if(data.action===g.Action.PICKED)resolve(data.docs.map(doc=>({id:doc.id,name:doc.name})));if(data.action===g.Action.CANCEL)resolve([]);}).build();picker.setVisible(true);
  });
}

