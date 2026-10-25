import {applyPrivateSetup} from './family-setup.js'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './Studio.jsx'

const setupNotice=applyPrivateSetup(window.location,{getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)},url=>window.history.replaceState(null,'',url))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App setupNotice={setupNotice} />
  </React.StrictMode>
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.error)); }
