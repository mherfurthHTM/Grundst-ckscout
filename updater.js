const LOCAL_VERSION='0.13';
const RELEASE_ID='0.13-r1';
const RELEASE_NOTES={
  title:'Beta 0.13 – Standortprüfung stabilisiert',
  date:'19.08.2026',
  notes:[
    'Standortprüfung wurde robuster aufgebaut und zeigt jetzt zusätzlich die Datenqualität.',
    'Fehlende Geodaten werden nicht mehr automatisch als schlechte Lage bewertet.',
    'Adresssuche nutzt geo.admin.ch mit OpenStreetMap als Fallback.',
    'ÖV wird zusätzlich über die Schweizer Transport API geprüft.',
    'Für OSM-Umfelddaten stehen mehrere kostenlose Overpass-Server als Fallback bereit.',
    'Ein Standort darf einen Deal erst bei ausreichender Datenqualität negativ zurückstufen.',
    '0 CHF laufende Softwarekosten, sichtbare Version, Patchnotes und Pull-to-Refresh bleiben bestehen.'
  ]
};
let updateInProgress=false;
async function clearScoutCaches(){if(!('caches' in window))return;const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('structa-scout-')).map(k=>caches.delete(k)));}
async function forceLatestVersion(v=LOCAL_VERSION){
  if(updateInProgress)return;updateInProgress=true;
  try{
    const s=document.getElementById('updateStatus');if(s){s.textContent='Neue Version wird geladen …';s.hidden=false;}
    if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.update().catch(()=>{})));}
    await clearScoutCaches();const u=new URL(location.href);u.searchParams.set('v',v);u.searchParams.set('refresh',Date.now());location.replace(u.toString());
  }catch(e){console.warn(e);updateInProgress=false;}
}
async function checkRemoteVersion(){try{const r=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)return;const d=await r.json();if(d.version&&d.version!==LOCAL_VERSION)await forceLatestVersion(d.version);}catch(e){console.warn('Versionsprüfung',e);}}
async function registerServiceWorker(){if(!('serviceWorker' in navigator))return;try{const r=await navigator.serviceWorker.register('./sw.js?v='+LOCAL_VERSION);r.update().catch(()=>{});}catch(e){console.warn('Service Worker',e);}}
function escRelease(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function injectUxStyles(){
  if(document.getElementById('structaUxStyles'))return;
  const st=document.createElement('style');st.id='structaUxStyles';st.textContent=`
  .version-pill{border:1px solid #cfdaf0;background:#fff;color:#2647a3;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap}
  .pull-refresh{position:fixed;z-index:1200;left:50%;top:-58px;transform:translateX(-50%);background:#173d63;color:#fff;border-radius:999px;padding:10px 16px;font-size:12px;font-weight:800;box-shadow:0 10px 28px rgba(23,61,99,.28);transition:.18s;opacity:0;pointer-events:none}.pull-refresh.visible{top:14px;opacity:1}.pull-refresh.ready{background:#2647a3}
  .verified-live-card{border-left:4px solid #2647a3}.verified-badge{display:inline-flex;background:#e9f8ef;color:#17683c;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;margin-bottom:7px}
  .verified-address{font-size:12px;color:#667386;margin:0 0 8px}.verified-metrics{display:flex;gap:8px;flex-wrap:wrap;margin:9px 0}.verified-metrics span{background:#f4f7fb;border-radius:8px;padding:7px 9px;font-size:11px}.verified-note{font-size:11px!important;color:#738096!important}
  .verified-live-card .live-meta{border-top:1px solid #edf0f4;padding-top:9px}.verified-source{font-weight:800;color:#405675}.market-actions{display:flex;gap:10px;align-items:center}.market-check-btn{padding:8px 11px;font-size:12px}
  @media(max-width:640px){.top-actions{flex-wrap:wrap}.version-pill{width:100%;text-align:center;order:-1}.verified-metrics{display:grid;grid-template-columns:1fr 1fr}.verified-live-card .live-meta{align-items:flex-start;flex-direction:column}.market-actions{width:100%;justify-content:space-between}}
  `;document.head.appendChild(st);
}
function setVisibleVersion(){
  const side=document.getElementById('appVersion');if(side)side.textContent='Beta '+LOCAL_VERSION;
  let b=document.getElementById('versionBadge');if(!b){const a=document.querySelector('.top-actions');if(a){b=document.createElement('button');b.type='button';b.id='versionBadge';b.className='version-pill';a.prepend(b);}}
  if(b){b.textContent='Beta '+LOCAL_VERSION+' · Was ist neu?';b.onclick=()=>showReleaseNotes(true);}
}
function fillReleaseNotes(){
  const t=document.getElementById('patchTitle'),d=document.getElementById('patchDate'),n=document.getElementById('patchNotes');if(!t||!d||!n)return false;
  t.textContent='Was ist neu in '+RELEASE_NOTES.title+'?';d.textContent=RELEASE_NOTES.date;n.innerHTML=RELEASE_NOTES.notes.map(x=>`<div class="patch-item"><span>✓</span><p>${escRelease(x)}</p></div>`).join('');return true;
}
function showReleaseNotes(force=false){if(!force&&localStorage.getItem('structaScoutReleaseSeen')===RELEASE_ID)return;if(!fillReleaseNotes())return;const d=document.getElementById('patchDialog');if(d&&!d.open)try{d.showModal()}catch{}}
function bindReleaseClose(){const b=document.getElementById('patchCloseBtn');if(!b||b.dataset.releaseBound==='1')return;b.dataset.releaseBound='1';b.addEventListener('click',()=>{localStorage.setItem('structaScoutReleaseSeen',RELEASE_ID);const d=document.getElementById('patchDialog');if(d?.open)d.close();});}
function installPullToRefresh(){
  if(document.getElementById('pullRefreshIndicator'))return;const i=document.createElement('div');i.id='pullRefreshIndicator';i.className='pull-refresh';i.textContent='Zum Aktualisieren nach unten ziehen';document.body.appendChild(i);
  let y=null,p=0,on=false;
  document.addEventListener('touchstart',e=>{if(scrollY<=0&&e.touches?.length===1){y=e.touches[0].clientY;p=0;on=true;}},{passive:true});
  document.addEventListener('touchmove',e=>{if(!on||y===null)return;p=Math.max(0,e.touches[0].clientY-y);if(p>12){i.classList.add('visible');if(p>=75){i.classList.add('ready');i.textContent='Loslassen zum Aktualisieren';}else{i.classList.remove('ready');i.textContent='Zum Aktualisieren weiterziehen';}}},{passive:true});
  document.addEventListener('touchend',async()=>{if(!on)return;const go=p>=75&&scrollY<=2;on=false;y=null;if(go){i.classList.add('visible','ready');i.textContent='Aktualisiere …';await forceLatestVersion();}else{i.classList.remove('visible','ready');}},{passive:true});
}
const chf=n=>new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF',maximumFractionDigits:0}).format(Number(n)||0);
const intFmt=n=>new Intl.NumberFormat('de-CH',{maximumFractionDigits:0}).format(Number(n)||0);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function verifiedFilter(items){const r=document.getElementById('regionFilter')?.value||'all',b=document.getElementById('budgetFilter')?.value||'999',max=b==='999'?Infinity:Number(b)*1e6;return items.filter(x=>(r==='all'||x.region===r)&&(!x.price||x.price<=max));}
function renderVerifiedResults(data){
  const t=document.getElementById('liveResults'),s=document.getElementById('searchStatus');if(!t||!s)return;const items=verifiedFilter(data.items||[]);window.__structaVerifiedItems=items;
  if(!items.length){t.innerHTML='';s.hidden=false;s.innerHTML=`<strong>Keine Angebote im aktuellen Filter.</strong> Stand ${safe(data.updated||'')}.`;return;}
  t.innerHTML=items.map((x,i)=>{const ppm=x.area&&x.price?Math.round(x.price/x.area):null;return `<article class="live-card verified-live-card"><span class="verified-badge">✓ VERIFIZIERTER WEB-FUND</span><h4>${safe(x.title)}</h4><p class="verified-address">${safe(x.address)} · ${safe(x.region)}</p><div class="verified-metrics"><span>Kaufpreis <strong>${x.price?chf(x.price):'auf Anfrage'}</strong></span><span>Grundstück <strong>${intFmt(x.area)} m²</strong></span>${ppm?`<span>Landpreis <strong>${chf(ppm)}/m²</strong></span>`:''}${x.zone?`<span>Zone <strong>${safe(x.zone)}</strong></span>`:''}</div><p class="verified-note">${safe(x.note||'')}</p><div class="live-meta"><span class="verified-source">Quelle: ${safe(x.source)}</span><div class="market-actions"><a href="${x.url}" target="_blank" rel="noopener noreferrer">Originalquelle ↗</a><button type="button" class="btn primary market-check-btn" data-market-index="${i}">Jetzt prüfen</button></div></div></article>`;}).join('');
  s.hidden=false;s.innerHTML=`<strong>${items.length} passende Marktangebote.</strong> „Jetzt prüfen“ startet Grobkosten, Wirtschaftlichkeit und die stabilisierte Standortprüfung.`;
}
async function runVerifiedMarketSearch(e){if(e){e.preventDefault();e.stopImmediatePropagation();}const s=document.getElementById('searchStatus'),t=document.getElementById('liveResults');if(s){s.hidden=false;s.innerHTML='<strong>Markt wird geprüft …</strong>';}if(t)t.innerHTML='';try{const r=await fetch('./market-data.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error();renderVerifiedResults(await r.json());if(typeof buildFallbacks==='function')buildFallbacks();}catch{if(s)s.innerHTML='<strong>Marktstand konnte gerade nicht geladen werden.</strong> Bitte aktualisieren oder direkte Suchbereiche nutzen.';}}
function installMarketHandlers(){
  const t=document.getElementById('liveResults');if(t&&t.dataset.checkBound!=='1'){t.dataset.checkBound='1';t.addEventListener('click',e=>{const b=e.target.closest('.market-check-btn');if(!b)return;const x=(window.__structaVerifiedItems||[])[Number(b.dataset.marketIndex)];if(x&&typeof window.openMarketOpportunity==='function')window.openMarketOpportunity(x);});}
  const b=document.getElementById('startSearchBtn');if(b&&b.dataset.verifiedBound!=='1'){b.dataset.verifiedBound='1';b.addEventListener('click',runVerifiedMarketSearch,true);}
  const q=document.getElementById('searchKeywords');if(q&&q.dataset.verifiedBound!=='1'){q.dataset.verifiedBound='1';q.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();runVerifiedMarketSearch();}},true);}
}
function init(){injectUxStyles();setVisibleVersion();bindReleaseClose();installPullToRefresh();installMarketHandlers();registerServiceWorker();showReleaseNotes(false);}
window.addEventListener('load',()=>{init();checkRemoteVersion();setInterval(checkRemoteVersion,5*60*1000);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkRemoteVersion();});
window.addEventListener('focus',checkRemoteVersion);
