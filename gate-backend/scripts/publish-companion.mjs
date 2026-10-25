import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const url=fs.readFileSync(path.join(root,'gate-backend/local-data/companion-url.txt'),'utf8').trim();
const parsed=new URL(url);
if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.trycloudflare.com'))throw new Error('Expected an HTTPS quick-tunnel address.');
const endpoint='repos/kanakkujur/ece-gate-mock/contents/companion.json';
const existing=spawnSync('gh',['api',`${endpoint}?ref=gh-pages`],{encoding:'utf8',windowsHide:true});
let prior;
if(existing.status===0){prior=JSON.parse(existing.stdout);const data=JSON.parse(Buffer.from(prior.content,'base64').toString('utf8'));if(data.url===url){console.log('The permanent website already has the current companion address.');process.exit(0);}}
else if(!existing.stderr?.includes('404'))throw new Error('Could not read the host pointer. Check GitHub CLI sign-in.');
// Only the public tunnel address is published. No .env contents or access key.
const content=Buffer.from(JSON.stringify({url,updatedAt:new Date().toISOString()},null,2)+'\n').toString('base64');
const body={message:'Update live companion address',branch:'gh-pages',content,...(prior?{sha:prior.sha}:{})};
const result=spawnSync('gh',['api','--method','PUT',endpoint,'--input','-'],{input:JSON.stringify(body),encoding:'utf8',windowsHide:true});
if(result.status!==0)throw new Error('Could not publish the companion address. Check GitHub CLI sign-in and repository access.');
console.log('Companion address published. Keep using https://kanakkujur.github.io/ece-gate-mock/');
