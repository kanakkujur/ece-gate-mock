import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createGoogleRouter} from '../google-server.js';
async function fixture(fn,{email='owner@example.test'}={}){
 const origin='https://kanakkujur.github.io',calls=[];
 const fetcher=async(url,options={})=>{calls.push({url,options});let data;if(url.includes('oauth2.googleapis.com/token'))data={access_token:'private-access',refresh_token:'private-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'};else if(url.includes('userinfo'))data={sub:'123',email,email_verified:true,name:'Owner'};else if(url.includes('/files?'))data={files:[{id:'private-folder'}]};else data={id:'backup'};return new Response(JSON.stringify(data),{status:200});};
 const app=express();app.use(express.json({limit:'8mb'}));app.use('/google',createGoogleRouter({clientId:'public-client-id',clientSecret:'private-client-secret',emails:['owner@example.test'],origins:[origin],sharedData:()=>({papers:[],key:'family-private'}),fetcher}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/google`;
 const request=async(path,body,token,source=origin)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:source,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const login=async()=>{const c=await request('/challenge',{});return request('/exchange',{state:c.data.state,code:'one-use-code'});};
 try{await fn({request,login,calls});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
test('server code exchange never returns Google tokens or client secret and consumes state',()=>fixture(async({request,login,calls})=>{
 const c=await request('/challenge',{});const result=await request('/exchange',{state:c.data.state,code:'code'});assert.equal(result.status,200);assert.equal(result.data.account.sub,'123');assert.ok(result.data.session);const out=JSON.stringify(result);for(const secret of ['private-access','private-refresh','private-client-secret'])assert.ok(!out.includes(secret));assert.equal((await request('/exchange',{state:c.data.state,code:'code'})).status,400);assert.equal(new URLSearchParams(calls[0].options.body).get('redirect_uri'),'https://kanakkujur.github.io');
 assert.equal((await request('/shared',null,result.data.session)).data.key,'family-private');assert.equal((await request('/shared')).status,401);assert.equal((await request('/shared',null,result.data.session,'https://other.test')).status,403);
 await request('/disconnect',{},result.data.session);assert.equal((await request('/shared',null,result.data.session)).status,401);
}));
test('a Google account outside the family allowlist receives no session',()=>fixture(async({login})=>{const result=await login();assert.equal(result.status,403);assert.equal(result.data.session,undefined);},{email:'stranger@example.test'}));
test('backup rejects another learner and omits connection fields',()=>fixture(async({request,login,calls})=>{
 const {data:{session}}=await login();assert.equal((await request('/backup',{deviceId:'device-1',snapshot:{profile:{id:'google-other'},history:[],driveFiles:[]}},session)).status,400);
 const r=await request('/backup',{deviceId:'device-1',snapshot:{profile:{id:'google-123',name:'Owner'},history:[],attempt:null,driveFiles:[],connection:{key:'do-not-upload'}}},session);assert.equal(r.status,200);const upload=calls.find(c=>c.url.includes('upload/drive'));assert.ok(upload);assert.ok(!upload.options.body.includes('do-not-upload'));assert.equal(JSON.parse(upload.options.body).kind,'gate-profile-backup');
}));
