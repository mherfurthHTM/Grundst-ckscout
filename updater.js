const LOCAL_VERSION='0.17';
const RELEASE_ID='0.17-cleanup';
const RELEASE_NOTES={
  title:'Beta 0.17 – Aufräumen & Stabilität',
  date:'21.08.2026',
  notes:[
    'Die veraltete zweite Pipeline wurde entfernt – es läuft nur noch die aktuelle Opportunity-Pipeline.',
    'Service Worker und Cache laden jetzt die aktuelle Pipeline statt der alten Version.',
    'Versionsprüfung und Update-Logik wurden vereinfacht und auf Beta 0.17 vereinheitlicht.',
    'Gespeicherte Opportunities bleiben unverändert erhalten.'
  ]
};
let updateInProgress=false;

async function clearScoutCaches(){
  if(!('caches' in window))return;
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith('structa-scout-')).map(k=>caches.delete(k)));
}

async function forceLatestVersion(v=LOCAL_VERSION){
  if(updateInProgress)return;
  updateInProgress=true;
  try{
    const status=document.getElementById('updateStatus');
    if(status){status.textContent='Neue Version wird geladen …';status.hidden=false;}
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.update().catch(()=>{})));
    }
    await clearScoutCaches();
    const u=new URL(location.href);
    u.searchParams.set('v',v);
    u.searchParams.set('refresh',Date.now());
    location.replace(u.toString());
  }catch(e){
    console.warn('Update fehlgeschlagen',e);
    updateInProgress=false;
  }
}

async function checkRemoteVersion(){
  try{
    const r=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)return;
    const d=await r.json();
    if(d.version&&d.version!==LOCAL_VERSION)await forceLatestVersion(d.version);
  }catch(e){console.warn('Versionsprüfung',e)}
}

async function registerServiceWorker(){
  if(!('serviceWorker' in navigator))return;
  try{
    const r=await navigator.serviceWorker.register('./sw.js?v='+LOCAL_VERSION);
    r.update().catch(()=>{});
  }catch(e){console.warn('Service Worker',e)}
}

function escU(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const chfU=n=>new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF',maximumFractionDigits:0}).format(Number(n)||0);
const intU=n=>new Intl.NumberFormat('de-CH',{maximumFractionDigits:0}).format(Number(n)||0);

function injectUxStyles(){
  if(document.getElementById('structaUxStyles'))return;
  const st=document.createElement('style');
  st.id='structaUxStyles';
  st.textContent=`.version-pill{border:1px solid #cfdaf0;background:#fff;color:#2647a3;border-radius:999px;padding:9px 12px;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap}.pull-refresh{position:fixed;z-index:1200;left:50%;top:-58px;transform:translateX(-50%);background:#173d63;color:#fff;border-radius:999px;padding:10px 16px;font-size:12px;font-weight:800;box-shadow:0 10px 28px rgba(23,61,99,.28);transition:.18s;opacity:0;pointer-events:none}.pull-refresh.visible{top:14px;opacity:1}.pull-refresh.ready{background:#2647a3}.verified-live-card{border-left:4px solid #2647a3}.verified-badge{display:inline-flex;background:#e9f8ef;color:#17683c;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:900;margin-bottom:7px}.verified-address{font-size:12px;color:#667386;margin:0 0 8px}.verified-metrics{display:flex;gap:8px;flex-wrap:wrap;margin:9px 0}.verified-metrics span{background:#f4f7fb;border-radius:8px;padding:7px 9px;font-size:11px}.verified-note{font-size:11px!important;color:#738096!important}.verified-live-card .live-meta{border-top:1px solid #edf0f4;padding-top:9px}.verified-source{font-weight:800;color:#405675}.market-actions{display:flex;gap:10px;align-items:center}.market-check-btn{padding:8px 11px;font-size:12px}.kpis article.kpi-action{position:relative;cursor:pointer;border:1px solid transparent;user-select:none}.kpis article.kpi-action:after{content:'›';position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:22px;font-weight:800;color:#a8b3c4}.kpis article.kpi-action.blue:after{color:#dce5ff}@media(max-width:640px){.top-actions{flex-wrap:wrap}.version-pill{width:100%;text-align:center;order:-1}.verified-metrics{display:grid;grid-template-columns:1fr 1fr}.verified-live-card .live-meta{align-items:flex-start;flex-direction:column}.market-actions{width:100%;justify-content:space-between}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}.kpis article{min-height:118px;padding:14px 13px!important;border-radius:14px!important;display:flex;flex-direction:column;justify-content:center}.kpis article span{font-size:12px;line-height:1.2;padding-right:14px}.kpis article strong{font-size:23px!important;line-height:1.05;margin:7px 0!important}.kpis article small{font-size:10px;line-height:1.25}.kpis article.kpi-action:after{right:8px;font-size:18px}}`;
  document.head.appendChild(st);
}

function setVisibleVersion(){
  const side=document.getElementById('appVersion');
  if(side)side.textContent='Beta '+LOCAL_VERSION;
  let b=document.getElementById('versionBadge');
  if(!b){
    const actions=document.querySelector('.top-actions');
    if(actions){b=document.createElement('button');b.type='button';b.id='versionBadge';b.className='version-pill';actions.prepend(b)}
  }
  if(b){b.textContent='Beta '+LOCAL_VERSION+' · Was ist neu?';b.onclick=()=>showReleaseNotes(true)}
}

function fillReleaseNotes(){
  const t=document.getElementById('patchTitle'),d=document.getElementById('patchDate'),n=document.getElementById('patchNotes');
  if(!t||!d||!n)return false;
  t.textContent='Was ist neu in '+RELEASE_NOTES.title+'?';
  d.textContent=RELEASE_NOTES.date;
  n.innerHTML=RELEASE_NOTES.notes.map(x=>`<div class="patch-item"><span>✓</span><p>${escU(x)}</p></div>`).join('');
  return true;
}

function showReleaseNotes(force=false){
  if(!force&&localStorage.getItem('structaScoutReleaseSeen')===RELEASE_ID)return;
  if(!fillReleaseNotes())return;
  const d=document.getElementById('patchDialog');
  if(d&&!d.open)try{d.showModal()}catch{}
}

function bindReleaseClose(){
  const b=document.getElementById('patchCloseBtn');
  if(!b||b.dataset.releaseBound==='1')return;
  b.dataset.releaseBound='1';
  b.addEventListener('click',()=>{
    localStorage.setItem('structaScoutReleaseSeen',RELEASE_ID);
    const d=document.getElementById('patchDialog');
    if(d?.open)d.close();
  });
}

function installPullToRefresh(){
  if(document.getElementById('pullRefreshIndicator'))return;
  const i=document.createElement('div');
  i.id='pullRefreshIndicator';i.className='pull-refresh';i.textContent='Zum Aktualisieren nach unten ziehen';document.body.appendChild(i);
  let y=null,p=0,on=false;
  document.addEventListener('touchstart',e=>{if(scrollY<=0&&e.touches?.length===1){y=e.touches[0].clientY;p=0;on=true}},{passive:true});
  document.addEventListener('touchmove',e=>{if(!on||y===null)return;p=Math.max(0,e.touches[0].clientY-y);if(p>12){i.classList.add('visible');if(p>=75){i.classList.add('ready');i.textContent='Loslassen zum Aktualisieren'}else{i.classList.remove('ready');i.textContent='Zum Aktualisieren weiterziehen'}}},{passive:true});
  document.addEventListener('touchend',async()=>{if(!on)return;const go=p>=75&&scrollY<=2;on=false;y=null;if(go){i.classList.add('visible','ready');i.textContent='Aktualisiere …';await forceLatestVersion()}else{i.classList.remove('visible','ready')}},{passive:true});
}

function verifiedFilter(items){
  const region=document.getElementById('regionFilter')?.value||'all';
  const budget=document.getElementById('budgetFilter')?.value||'999';
  const max=budget==='999'?Infinity:Number(budget)*1e6;
  return items.filter(x=>(region==='all'||x.region===region)&&(!x.price||x.price<=max));
}

function renderVerifiedResults(data){
  const target=document.getElementById('liveResults'),status=document.getElementById('searchStatus');
  if(!target||!status)return;
  const items=verifiedFilter(data.items||[]);
  window.__structaVerifiedItems=items;
  if(!items.length){target.innerHTML='';status.hidden=false;status.innerHTML=`<strong>Keine Angebote im aktuellen Suchfilter.</strong> Stand ${escU(data.updated||'')}.`;return}
  target.innerHTML=items.map((x,i)=>{
    const ppm=x.area&&x.price?Math.round(x.price/x.area):null;
    return `<article class="live-card verified-live-card"><span class="verified-badge">✓ VERIFIZIERTER WEB-FUND</span><h4>${escU(x.title)}</h4><p class="verified-address">${escU(x.address)} · ${escU(x.region)}</p><div class="verified-metrics"><span>Kaufpreis <strong>${x.price?chfU(x.price):'auf Anfrage'}</strong></span><span>Grundstück <strong>${intU(x.area)} m²</strong></span>${ppm?`<span>Landpreis <strong>${chfU(ppm)}/m²</strong></span>`:''}${x.zone?`<span>Zone <strong>${escU(x.zone)}</strong></span>`:''}</div><p class="verified-note">${escU(x.note||'')}</p><div class="live-meta"><span class="verified-source">Quelle: ${escU(x.source)}</span><div class="market-actions"><a href="${x.url}" target="_blank" rel="noopener noreferrer">Originalquelle ↗</a><button type="button" class="btn primary market-check-btn" data-market-index="${i}">Jetzt prüfen</button></div></div></article>`;
  }).join('');
  status.hidden=false;
  status.innerHTML=`<strong>${items.length} passende Marktangebote.</strong> „Jetzt prüfen“ übernimmt das Objekt in die Analyse.`;
}

async function runVerifiedMarketSearch(e){
  if(e){e.preventDefault();e.stopImmediatePropagation()}
  const status=document.getElementById('searchStatus'),target=document.getElementById('liveResults');
  if(status){status.hidden=false;status.innerHTML='<strong>Markt wird geprüft …</strong>'}
  if(target)target.innerHTML='';
  try{
    const r=await fetch('./market-data.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error();
    renderVerifiedResults(await r.json());
  }catch{
    if(status)status.innerHTML='<strong>Marktstand konnte gerade nicht geladen werden.</strong> Die direkten Suchbereiche stehen weiterhin zur Verfügung.';
  }finally{
    if(typeof buildFallbacks==='function')buildFallbacks();
  }
}

function installMarketHandlers(){
  const target=document.getElementById('liveResults');
  if(target&&target.dataset.checkBound!=='1'){
    target.dataset.checkBound='1';
    target.addEventListener('click',e=>{const b=e.target.closest('.market-check-btn');if(!b)return;const x=(window.__structaVerifiedItems||[])[Number(b.dataset.marketIndex)];if(x&&typeof window.openMarketOpportunity==='function')window.openMarketOpportunity(x)});
  }
  const button=document.getElementById('startSearchBtn');
  if(button&&button.dataset.verifiedBound!=='1'){button.dataset.verifiedBound='1';button.addEventListener('click',runVerifiedMarketSearch,true)}
  const query=document.getElementById('searchKeywords');
  if(query&&query.dataset.verifiedBound!=='1'){query.dataset.verifiedBound='1';query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();runVerifiedMarketSearch()}},true)}
}

function scrollToPipeline(sortValue=null){
  const sort=document.getElementById('sortFilter');
  if(sortValue&&sort){sort.value=sortValue;sort.dispatchEvent(new Event('change',{bubbles:true}))}
  const target=document.querySelector('.opportunities');
  if(target)setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),30);
}

function installKpiDashboard(){
  const defs=[['countKpi',null,'Geprüfte Opportunities anzeigen'],['marginKpi','margin','Nach Projektmarge sortieren'],['profitKpi','profit','Nach Gewinnpotenzial sortieren'],['scoreKpi','score','Beste Bewertung anzeigen']];
  defs.forEach(([id,sortValue,label])=>{
    const value=document.getElementById(id),card=value?.closest('article');
    if(!card||card.dataset.kpiBound==='1')return;
    card.dataset.kpiBound='1';card.classList.add('kpi-action');card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-label',label);
    const go=()=>scrollToPipeline(sortValue);
    card.addEventListener('click',go);
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}});
  });
}

function init(){
  injectUxStyles();
  setVisibleVersion();
  bindReleaseClose();
  installPullToRefresh();
  installMarketHandlers();
  installKpiDashboard();
  registerServiceWorker();
  showReleaseNotes(false);
}

window.addEventListener('load',()=>{init();checkRemoteVersion();setInterval(checkRemoteVersion,5*60*1000)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkRemoteVersion()});
window.addEventListener('focus',checkRemoteVersion);
