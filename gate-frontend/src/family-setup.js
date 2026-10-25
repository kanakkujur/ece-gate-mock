export const FAMILY_WEBSITE='https://kanakkujur.github.io/ece-gate-mock/';
const SETTINGS_KEY='gate-studio:connection';

export function privateSetupLink(key) {
  if(typeof key!=='string'||!key.trim()||key.length>512||/[\u0000-\u001f]/.test(key))throw new Error('Enter a valid family access key first.');
  const bytes=new TextEncoder().encode(JSON.stringify({v:1,key:key.trim()}));
  const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return `${FAMILY_WEBSITE}#setup=${encoded}`;
}

export function applyPrivateSetup({hash,pathname='/',search=''},storage,replaceUrl) {
  const params=new URLSearchParams(String(hash||'').replace(/^#/,''));
  const encoded=params.get('setup');
  if(!encoded)return {message:'',error:''};
  let message='',error='',validated=false;
  try {
    if(encoded.length>2048||!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('This private setup link is invalid.');
    const padded=encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4);
    const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(padded),c=>c.charCodeAt(0))));
    if(payload.v!==1||typeof payload.key!=='string'||!payload.key.trim()||payload.key.length>512||/[\u0000-\u001f]/.test(payload.key))throw new Error('This private setup link is invalid.');
    validated=true;
    let existing={};try{existing=JSON.parse(storage.getItem(SETTINGS_KEY))||{};}catch{}
    // The invitation cannot override the trusted host resolver with another URL.
    storage.setItem(SETTINGS_KEY,JSON.stringify({name:typeof existing.name==='string'?existing.name:'Learner',key:payload.key.trim(),auto:true,url:''}));
    message='Family connection saved on this device. Reconnecting to local AI…';
  }catch(e){error=!validated?'This private setup link is invalid.':'Could not save the family connection. Allow storage for this website and open the setup link again.';}
  finally {
    params.delete('setup');
    const remaining=params.toString();
    replaceUrl(`${pathname}${search}${remaining?`#${remaining}`:''}`);
  }
  return {message,error};
}
