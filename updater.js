const LOCAL_VERSION='0.9';
const RELEASE_ID='0.9';
const RELEASE_NOTES={
  title:'Beta 0.9 – Update & Bedienung',
  date:'19.08.2026',
  notes:[
    'Die aktuelle Version ist jetzt dauerhaft oben in der App sichtbar.',
    'Patchnotes werden nach jedem neuen Versionsstand zuverlässig automatisch angezeigt.',
    'Über die Versionsanzeige können die Patchnotes jederzeit erneut geöffnet werden.',
    'Pull-to-Refresh ergänzt: ganz oben nach unten ziehen prüft Updates und lädt die App frisch.',
    'Gespeicherte Opportunities und Einstellungen bleiben beim Aktualisieren erhalten.'
  ]
};
let updateInProgress=false;

async function clearScoutCaches(){
  if(!('caches' in window))return;
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('structa-scout-')).map(k=>caches.delete(k)));
}

async function forceLatestVersion(targetVersion=LOCAL_VERSION){
  if(updateInProgress)return;
  updateInProgress=true;
  try{
    const status=document.getElementById('updateStatus');
    if(status){status.textContent='Neue Version wird geladen …';status.hidden=false;}
    const regs=('serviceWorker' in navigator)?await navigator.serviceWorker.getRegistrations():[];
    await Promise.all(regs.map(r=>r.update().catch(()=>{})));
    await clearScoutCaches();
    const u=new URL(location.href);
    u.searchParams.set('v',targetVersion);
    u.searchParams.set('refresh',Date.now().toString());
    location.replace(u.toString());
  }catch(e){
    console.warn('Update konnte nicht erzwungen werden',e);
    updateInProgress=false;
  }
}

async function checkRemoteVersion(){
  try{
    const r=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)return;
    const data=await r.json();
    if(data.version&&data.version!==LOCAL_VERSION){
      await forceLatestVersion(data.version);
    }
  }catch(e){
    console.warn('Versionsprüfung nicht verfügbar',e);
  }
}

function injectUxStyles(){
  if(document.getElementById('structaUxStyles'))return;
  const style=document.createElement('style');
  style.id='structaUxStyles';
  style.textContent=`
    .version-pill{border:1px solid #cfdaf0;background:#fff;color:#2647a3;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:900;letter-spacing:.03em;cursor:pointer;box-shadow:0 4px 12px rgba(38,71,163,.08);white-space:nowrap}
    .version-pill:hover{background:#f4f7ff}
    .pull-refresh{position:fixed;z-index:1200;left:50%;top:-58px;transform:translateX(-50%);background:#173d63;color:#fff;border-radius:999px;padding:10px 16px;font-size:12px;font-weight:800;box-shadow:0 10px 28px rgba(23,61,99,.28);transition:top .18s ease,opacity .18s ease;opacity:0;pointer-events:none}
    .pull-refresh.visible{top:14px;opacity:1}
    .pull-refresh.ready{background:#2647a3}
    @media(max-width:640px){.top-actions{flex-wrap:wrap}.version-pill{width:100%;text-align:center;order:-1}}
  `;
  document.head.appendChild(style);
}

function setVisibleVersion(){
  const sidebar=document.getElementById('appVersion');
  if(sidebar)sidebar.textContent='Beta '+LOCAL_VERSION;
  let badge=document.getElementById('versionBadge');
  if(!badge){
    const actions=document.querySelector('.top-actions');
    if(actions){
      badge=document.createElement('button');
      badge.type='button';
      badge.id='versionBadge';
      badge.className='version-pill';
      badge.title='Patchnotes anzeigen';
      actions.prepend(badge);
    }
  }
  if(badge){
    badge.textContent='Beta '+LOCAL_VERSION+' · Was ist neu?';
    badge.onclick=()=>showReleaseNotes(true);
  }
}

function fillReleaseNotes(){
  const title=document.getElementById('patchTitle');
  const date=document.getElementById('patchDate');
  const notes=document.getElementById('patchNotes');
  if(!title||!date||!notes)return false;
  title.textContent='Was ist neu in '+RELEASE_NOTES.title+'?';
  date.textContent=RELEASE_NOTES.date;
  notes.innerHTML=RELEASE_NOTES.notes.map(n=>`<div class="patch-item"><span>✓</span><p>${String(n).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p></div>`).join('');
  return true;
}

function showReleaseNotes(force=false){
  if(!force&&localStorage.getItem('structaScoutReleaseSeen')===RELEASE_ID)return;
  if(!fillReleaseNotes())return;
  const dialog=document.getElementById('patchDialog');
  if(dialog&&!dialog.open){
    try{dialog.showModal();}catch(e){console.warn('Patchnotes konnten nicht geöffnet werden',e);}
  }
}

function bindReleaseClose(){
  const close=document.getElementById('patchCloseBtn');
  if(!close||close.dataset.releaseBound==='1')return;
  close.dataset.releaseBound='1';
  close.addEventListener('click',()=>localStorage.setItem('structaScoutReleaseSeen',RELEASE_ID));
}

function installPullToRefresh(){
  if(document.getElementById('pullRefreshIndicator'))return;
  const indicator=document.createElement('div');
  indicator.id='pullRefreshIndicator';
  indicator.className='pull-refresh';
  indicator.textContent='Zum Aktualisieren nach unten ziehen';
  document.body.appendChild(indicator);
  let startY=null;
  let pull=0;
  let tracking=false;

  document.addEventListener('touchstart',e=>{
    if(window.scrollY<=0&&e.touches&&e.touches.length===1){
      startY=e.touches[0].clientY;
      pull=0;
      tracking=true;
    }
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(!tracking||startY===null||!e.touches||!e.touches.length)return;
    pull=Math.max(0,e.touches[0].clientY-startY);
    if(pull>12){
      indicator.classList.add('visible');
      if(pull>=75){
        indicator.classList.add('ready');
        indicator.textContent='Loslassen zum Aktualisieren';
      }else{
        indicator.classList.remove('ready');
        indicator.textContent='Zum Aktualisieren weiterziehen';
      }
    }
  },{passive:true});

  document.addEventListener('touchend',async()=>{
    if(!tracking)return;
    const shouldRefresh=pull>=75&&window.scrollY<=2;
    tracking=false;
    startY=null;
    if(shouldRefresh){
      indicator.classList.add('visible','ready');
      indicator.textContent='Aktualisiere …';
      await forceLatestVersion(LOCAL_VERSION);
      return;
    }
    indicator.classList.remove('visible','ready');
    setTimeout(()=>{indicator.textContent='Zum Aktualisieren nach unten ziehen';},180);
  },{passive:true});
}

function initReleaseUx(){
  injectUxStyles();
  setVisibleVersion();
  bindReleaseClose();
  installPullToRefresh();
  showReleaseNotes(false);
}

window.addEventListener('load',()=>{
  initReleaseUx();
  checkRemoteVersion();
  setInterval(checkRemoteVersion,5*60*1000);
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkRemoteVersion();});
window.addEventListener('focus',checkRemoteVersion);
