export const COMPANION_POINTER='https://raw.githubusercontent.com/kanakkujur/ece-gate-mock/gh-pages/companion.json';
export function createCompanionResolver({fetcher=fetch,now=Date.now}={}) {
  let cached=null,pending=null;
  return async function resolve(settings,hostname,{force=false}={}) {
    const fallback=(settings.url||'').trim().replace(/\/$/,'');
    if(settings.auto===false||['localhost','127.0.0.1','::1'].includes(hostname))return fallback;
    if(!force&&cached&&now()-cached.checked<30000)return cached.url;
    if(!pending)pending=(async()=>{
      try {
        const r=await fetcher(`${COMPANION_POINTER}?t=${now()}`,{cache:'no-store',signal:AbortSignal.timeout(6000)});
        if(!r.ok)throw new Error('Host pointer unavailable');
        const data=await r.json();const url=new URL(data.url);
        if(url.protocol!=='https:'||!url.hostname.endsWith('.trycloudflare.com'))throw new Error('Invalid host pointer');
        cached={url:url.origin,checked:now()};return cached.url;
      }catch{return cached?.url||fallback;}
      finally{pending=null;}
    })();
    return pending;
  };
}
