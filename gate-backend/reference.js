import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const indexPath=fileURLToPath(new URL('../references/reference-index.json',import.meta.url));
function load(){try{return JSON.parse(fs.readFileSync(indexPath,'utf8'));}catch{return null;}}
export function referenceInfo(){const data=load();return data?{file:data.file,pages:data.pages,coverage:data.coverage,limitations:data.limitations,indexedExcerpts:data.chunks.length}:null;}
export function retrieveReference(query){
  const data=load();if(!data)return {context:'',references:[]};
  // Coverage guard prevents the sample's signals chapters being used for unrelated subjects.
  if(!/z[ -]?transform|fourier|\bdtft\b|\bdft\b|\bfft\b|signals\s*&?\s*systems/i.test(query))return {context:'',references:[]};
  const terms=[...new Set(query.toLowerCase().match(/[a-z]{3,}/g)||[])].filter(t=>!['the','and','for','with','what','question','subject','mixed','fundamentals','systems','signals'].includes(t));
  const ranked=data.chunks.map(chunk=>({...chunk,rank:terms.reduce((n,t)=>n+((chunk.topic+' '+chunk.text).toLowerCase().includes(t)?1:0),0)})).filter(c=>c.rank>0).sort((a,b)=>b.rank-a.rank).slice(0,2);
  const references=[...new Map(ranked.map(c=>[c.page,{file:data.file,page:c.page,topic:c.topic}])).values()];
  return {references,context:ranked.map(c=>`[Private reference, physical PDF page ${c.page}; ${c.topic}]\n${c.text.slice(0,800)}`).join('\n\n')};
}
