import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve('dist');
const assets=fs.readdirSync(path.join(root,'assets')).map(n=>`assets/${n}`);
const version=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex').slice(0,12);
fs.writeFileSync(path.join(root,'sw.js'),`const CACHE='gate-studio-${version}';
const FILES=${JSON.stringify(['./','index.html',...assets])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gate-studio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/'))return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('index.html',self.registration.scope))));
 else event.respondWith(caches.match(event.request,{ignoreVary:true}).then(cached=>cached||fetch(event.request)));
});
`);
fs.writeFileSync(path.join(root,'.nojekyll'),'');
console.log('Offline app shell prepared.');

if(process.env.VITE_LOCAL_API_URL){fs.writeFileSync(path.join(root,"companion.json"),JSON.stringify({url:process.env.VITE_LOCAL_API_URL,updatedAt:new Date().toISOString()},null,2)+"\n");}
