import React,{useState} from 'react';
import Studio from './Studio.jsx';
import {profileRegistry,DEFAULT_PROFILE,readProfile,writeProfile,mergeResults,restoreSnapshots} from './profiles.js';
export default function ProfileApp({setupNotice}) {
  const [registry,setRegistry]=useState(()=>profileRegistry(localStorage));
  const [initialView,setInitialView]=useState('dashboard');
  const [revision,setRevision]=useState(0);
  const profile=registry.profiles.find(p=>p.id===registry.activeId)||registry.profiles[0];
  function commit(profiles,activeId=registry.activeId){localStorage.setItem('gate-studio:profiles',JSON.stringify(profiles));localStorage.setItem('gate-studio:active-profile',activeId);setRegistry({profiles,activeId});}
  function switchProfile(id){setInitialView('profiles');commit(registry.profiles,id);}
  function createProfile(name){const p={id:`local-${crypto.randomUUID()}`,name:name.trim(),kind:'local'};if(!p.name)throw new Error('Enter a profile name.');setInitialView('profiles');commit([...registry.profiles,p],p.id);}
  function googleProfile(account,snapshots=[]) {
    const old=registry.profiles.find(p=>p.id===`google-${account.sub}`);
    const p={...old,id:`google-${account.sub}`,name:old?.name||account.name||account.email,email:account.email,picture:account.picture||'',kind:'google'};
    restoreSnapshots(localStorage,p,snapshots);
    setInitialView('profiles');commit([...registry.profiles.filter(old=>old.id!==p.id),p],p.id);setRevision(v=>v+1);
  }
  function updateProfile(next){commit(registry.profiles.map(p=>p.id===profile.id?{...p,name:next.name,driveAuto:next.driveAuto??p.driveAuto}:p));}
  function refreshData(){setInitialView('profiles');setRevision(v=>v+1);}
  function copyLocal(){const local=readProfile(localStorage,DEFAULT_PROFILE,'history',[]);writeProfile(localStorage,profile.id,'history',mergeResults(local,readProfile(localStorage,profile.id,'history',[])));refreshData();}
  return <Studio key={`${profile.id}:${revision}`} profile={profile} profiles={registry.profiles} onSwitchProfile={switchProfile} onCreateProfile={createProfile} onGoogleProfile={googleProfile} onUpdateProfile={updateProfile} onRefreshProfile={refreshData} onCopyLocal={copyLocal} initialView={initialView} setupNotice={setupNotice}/>;
}
