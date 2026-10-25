import crypto from 'node:crypto';
import express from 'express';

export const GOOGLE_SCOPE='openid email profile https://www.googleapis.com/auth/drive.file';
// Google credentials and tokens never leave this process. Restarting requires signing in again.
export function createGoogleRouter({clientId,clientSecret,emails=[],origins=[],sharedData=()=>({papers:[]}),fetcher=fetch,now=Date.now}={}) {
  const router=express.Router(),challenges=new Map(),sessions=new Map();
  const allowed=new Set(emails.map(s=>s.trim().toLowerCase()).filter(Boolean));
  const ready=Boolean(clientId&&clientSecret&&allowed.size);
  const random=()=>crypto.randomBytes(32).toString('base64url');
  function prune(){for(const [id,item] of challenges)if(item.until<now())challenges.delete(id);for(const [id,item] of sessions)if(item.until<now())sessions.delete(id);}
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');const host=req.get('Host');req.googleOrigin=req.get('Origin')||(['127.0.0.1:4001','localhost:4001'].includes(host)?`http://${host}`:'');if(!origins.includes(req.googleOrigin))return res.status(403).json({error:'Open the registered GATE Studio website.'});prune();next();});
  const route=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(()=>res.status(502).json({error:'Google Drive request failed. Local work remains saved. Reconnect and try again.'}));
  async function json(url,options={}) {const r=await fetcher(url,{...options,signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Google request failed');return r.json();}
  async function tokenFor(s){if(s.expires>now()+30000)return s.access;if(!s.refresh)throw new Error('Reconnect');const t=await json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:s.refresh,grant_type:'refresh_token'})});s.access=t.access_token;s.expires=now()+t.expires_in*1000;return s.access;}
  async function drive(s,url,options={}){return json(url,{...options,headers:{...options.headers,Authorization:`Bearer ${await tokenFor(s)}`}});}
  router.get('/config',(_req,res)=>res.json({ready,clientId:ready?clientId:'',mode:'server'}));
  router.post('/challenge',(req,res)=>{if(!ready)return res.status(503).json({error:'The host needs its private Google client secret and allowed learner emails.'});if(challenges.size>=100)return res.status(429).json({error:'Try again shortly.'});const state=random();challenges.set(state,{origin:req.googleOrigin,until:now()+300000});res.json({state});});
  router.post('/exchange',route(async(req,res)=>{
    const c=challenges.get(req.body.state);challenges.delete(req.body.state);
    if(!ready||!c||c.origin!==req.googleOrigin||typeof req.body.code!=='string'||req.body.code.length>4096)return res.status(400).json({error:'Sign-in expired. Try again.'});
    const t=await json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code:req.body.code,redirect_uri:c.origin,grant_type:'authorization_code'})});
    if(!t.access_token||!t.scope?.split(' ').includes('https://www.googleapis.com/auth/drive.file'))return res.status(403).json({error:'Grant app-file access to use Drive backups.'});
    const user=await json('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${t.access_token}`}});
    if(!user.sub||!user.email_verified||!allowed.has(user.email?.toLowerCase()))return res.status(403).json({error:'This Google account is not on the host’s family learner list.'});
    if(sessions.size>=100)return res.status(429).json({error:'Too many sessions. Try again later.'});
    const session=random(),account={sub:user.sub,name:user.name||user.email,email:user.email};
    sessions.set(session,{account,origin:c.origin,access:t.access_token,refresh:t.refresh_token,expires:now()+t.expires_in*1000,until:now()+12*3600000});res.json({session,account});
  }));
  router.use((req,res,next)=>{const s=sessions.get((req.get('Authorization')||'').replace(/^Bearer /,''));if(!s||s.origin!==req.googleOrigin)return res.status(401).json({error:'Reconnect Google Drive. Your local work is saved.'});req.google=s;next();});
  router.post('/disconnect',(req,res)=>{sessions.delete((req.get('Authorization')||'').replace(/^Bearer /,''));res.json({ok:true});});
  router.get('/shared',(_req,res)=>res.json(sharedData()));
  async function list(s,q){const data=await drive(s,`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({q,fields:'files(id,name),nextPageToken',pageSize:'1000'})}`);if(data.nextPageToken)throw new Error('Too many backups');return data.files||[];}
  async function folder(s){const found=await list(s,`trashed=false and 'me' in owners and mimeType='application/vnd.google-apps.folder' and appProperties has {key='gateStudioOwner' and value='${s.account.sub}'}`);if(found[0])return found[0].id;return (await drive(s,'https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'GATE_STUDIO_MY_PROGRESS',mimeType:'application/vnd.google-apps.folder',appProperties:{gateStudioOwner:s.account.sub}})})).id;}
  router.get('/backups',route(async(req,res)=>{const s=req.google,parent=await folder(s),files=await list(s,`trashed=false and '${parent}' in parents and appProperties has {key='gateStudioKind' and value='profile-backup'}`),out=[];for(const f of files){const data=await drive(s,`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`);if(data.profile?.id===`google-${s.account.sub}`)out.push(data);}res.json(out);}));
  router.post('/backup',express.json({limit:'8mb'}),route(async(req,res)=>{
    const s=req.google,{snapshot,deviceId}=req.body;
    if(!snapshot||snapshot.profile?.id!==`google-${s.account.sub}`||!Array.isArray(snapshot.history)||!Array.isArray(snapshot.driveFiles)||!/^[A-Za-z0-9-]{1,80}$/.test(deviceId||''))return res.status(400).json({error:'Invalid profile backup.'});
    // Drop connection settings, credentials, and any unrelated top-level input.
    const body=JSON.stringify({kind:'gate-profile-backup',version:1,profile:{id:snapshot.profile.id,name:snapshot.profile.name,email:s.account.email},history:snapshot.history,attempt:snapshot.attempt,driveFiles:[],updatedAt:new Date(now()).toISOString()});
    const parent=await folder(s),files=await list(s,`trashed=false and '${parent}' in parents and appProperties has {key='gateStudioDevice' and value='${deviceId}'}`);
    if(files[0])await drive(s,`https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body});
    else {const b=`gate_${random()}`,metadata={name:`progress-${deviceId}.json`,parents:[parent],mimeType:'application/json',appProperties:{gateStudioKind:'profile-backup',gateStudioDevice:deviceId}};await drive(s,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${b}`},body:`--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`});}
    res.json({ok:true});
  }));
  return router;
}
