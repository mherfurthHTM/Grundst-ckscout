const OEREB_VERSION='0.20';

(function(){
  const SERVICES={
    'Aargau':'https://api.geo.ag.ch/v2/oereb',
    'Basel-Landschaft':'https://oereb.geo.bl.ch',
    'Basel-Stadt':'https://api.oereb.bs.ch',
    'Solothurn':'https://geo.so.ch/api/oereb'
  };
  const CACHE_PREFIX='structaOereb20:';

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function cacheGet(key,maxAge=24*60*60*1000){
    try{
      const x=JSON.parse(localStorage.getItem(CACHE_PREFIX+key)||'null');
      if(x&&Date.now()-x.savedAt<maxAge)return x.data;
    }catch{}
    return null;
  }

  function cacheSet(key,data){
    try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({savedAt:Date.now(),data}))}catch{}
  }

  function findRecursive(value,keyName){
    if(value==null)return null;
    if(Array.isArray(value)){
      for(const item of value){const hit=findRecursive(item,keyName);if(hit)return hit}
      return null;
    }
    if(typeof value==='object'){
      for(const [key,item] of Object.entries(value)){
        if(String(key).toLowerCase()===keyName.toLowerCase()&&item!=null&&String(item).trim())return String(item).trim();
        const hit=findRecursive(item,keyName);if(hit)return hit;
      }
    }
    return null;
  }

  function xmlValue(text,names){
    const doc=new DOMParser().parseFromString(text,'application/xml');
    if(doc.querySelector('parsererror'))return null;
    const nodes=[...doc.getElementsByTagName('*')];
    for(const name of names){
      const n=nodes.find(el=>String(el.localName||el.nodeName).toLowerCase()===name.toLowerCase()&&el.textContent?.trim());
      if(n)return n.textContent.trim();
    }
    return null;
  }

  async function fetchEgrid(base,easting,northing){
    const key=`${base}:${Math.round(easting)},${Math.round(northing)}`;
    const cached=cacheGet(key);if(cached)return cached;
    const en=`${Math.round(easting)},${Math.round(northing)}`;
    const geometry=`POINT(${Math.round(easting)} ${Math.round(northing)})`;
    const attempts=[
      {url:`${base}/getegrid/json/?EN=${encodeURIComponent(en)}`,type:'json'},
      {url:`${base}/getegrid/xml/?EN=${encodeURIComponent(en)}`,type:'xml'},
      {url:`${base}/getegrid/xml/?GEOMETRY=${encodeURIComponent(geometry)}`,type:'xml'}
    ];
    let lastError=null;
    for(const attempt of attempts){
      try{
        const r=await fetch(attempt.url,{headers:{Accept:attempt.type==='json'?'application/json':'application/xml,text/xml'}});
        if(!r.ok)throw new Error(String(r.status));
        if(attempt.type==='json'){
          const d=await r.json();
          const egrid=findRecursive(d,'egrid')||findRecursive(d,'EGRID');
          if(egrid){
            const out={egrid,number:findRecursive(d,'number'),identDN:findRecursive(d,'identDN'),service:base};
            cacheSet(key,out);return out;
          }
        }else{
          const text=await r.text();
          const egrid=xmlValue(text,['EGRID']);
          if(egrid){
            const out={egrid,number:xmlValue(text,['Number','Nummer']),identDN:xmlValue(text,['IdentDN']),service:base};
            cacheSet(key,out);return out;
          }
        }
      }catch(e){lastError=e}
    }
    throw lastError||new Error('EGRID nicht gefunden');
  }

  function linksFor(base,egrid){
    const q='EGRID='+encodeURIComponent(egrid)+'&LANG=de';
    return {
      online:`${base}/extract/url/?${q}`,
      pdf:`${base}/extract/pdf/?${q}`
    };
  }

  function ensureBox(){
    let box=document.getElementById('oerebResult');
    if(box)return box;
    const official=document.getElementById('officialDataResult');
    const location=document.getElementById('locationResult');
    const anchor=official||location;
    if(!anchor)return null;
    box=document.createElement('div');box.id='oerebResult';box.className='oereb-result';anchor.insertAdjacentElement('afterend',box);return box;
  }

  function injectStyles(){
    if(document.getElementById('oerebStyles'))return;
    const s=document.createElement('style');s.id='oerebStyles';s.textContent=`
      .oereb-result{margin-top:12px}.oereb-card{border:1px solid #dfe7f2;background:#fff;border-radius:12px;padding:12px}.oereb-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.oereb-head strong{color:#173d63}.oereb-badge{font-size:9px;font-weight:900;background:#eef5ff;color:#315d92;padding:4px 7px;border-radius:999px}.oereb-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.oereb-grid div{background:#f6f8fb;border-radius:9px;padding:9px}.oereb-grid span{display:block;color:#7a8594;font-size:9px}.oereb-grid strong{display:block;color:#223148;font-size:11px;margin-top:3px;line-height:1.35;word-break:break-word}.oereb-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.oereb-link{display:inline-flex;text-decoration:none;border-radius:8px;padding:8px 10px;font-size:10px;font-weight:900;background:#2647a3;color:#fff}.oereb-link.secondary{background:#edf2f8;color:#29415f}.oereb-note{margin-top:9px;color:#7a8594;font-size:9px;line-height:1.45}@media(max-width:650px){.oereb-grid{grid-template-columns:1fr}.oereb-actions{display:grid;grid-template-columns:1fr}.oereb-link{justify-content:center}}
    `;document.head.appendChild(s);
  }

  function render(data){
    const box=ensureBox();if(!box)return;
    if(!data){box.innerHTML='';return}
    if(!data.egrid){
      box.innerHTML=`<div class="oereb-card"><div class="oereb-head"><strong>ÖREB-Kataster</strong><span class="oereb-badge">AMTLICH</span></div><div class="oereb-note">${esc(data.message||'ÖREB-Daten konnten für dieses Grundstück noch nicht automatisch zugeordnet werden.')}</div>${data.service?`<div class="oereb-actions"><a class="oereb-link secondary" href="${esc(data.service)}" target="_blank" rel="noopener noreferrer">Kantonalen ÖREB-Dienst öffnen ↗</a></div>`:''}</div>`;
      return;
    }
    box.innerHTML=`<div class="oereb-card"><div class="oereb-head"><strong>ÖREB-Kataster</strong><span class="oereb-badge">EGRID GEFUNDEN</span></div><div class="oereb-grid"><div><span>EGRID</span><strong>${esc(data.egrid)}</strong></div><div><span>Grundstück</span><strong>${esc(data.number||data.identDN||'amtlich zugeordnet')}</strong></div></div><div class="oereb-actions"><a class="oereb-link" href="${esc(data.links.online)}" target="_blank" rel="noopener noreferrer">ÖREB-Information öffnen ↗</a><a class="oereb-link secondary" href="${esc(data.links.pdf)}" target="_blank" rel="noopener noreferrer">PDF-Auszug öffnen ↗</a></div><div class="oereb-note">Quelle: offizieller kantonaler ÖREB-Webservice. Der ÖREB-Kataster enthält die wichtigsten öffentlich-rechtlichen Eigentumsbeschränkungen und ist die bessere Grundlage für die spätere Baupotenzialprüfung.</div></div>`;
  }

  function persist(data){
    try{
      if(typeof currentLocationAnalysis==='undefined'||!currentLocationAnalysis)return;
      currentLocationAnalysis={...currentLocationAnalysis,oerebData:data};
      if(typeof persistLocationIntoContext==='function')persistLocationIntoContext();
      render(data);
      if(typeof updatePreview==='function')updatePreview();
      if(typeof render==='function')render();
    }catch(e){console.warn('ÖREB speichern',e)}
  }

  async function run(detail){
    const region=document.getElementById('region')?.value||'';
    const base=SERVICES[region];
    if(!base)return null;
    const point=detail?.point||((typeof currentLocationAnalysis!=='undefined')?currentLocationAnalysis?.officialData?.point:null);
    if(!point?.easting||!point?.northing)return null;
    const box=ensureBox();if(box)box.innerHTML='<div class="oereb-card">ÖREB-Grundstück wird amtlich zugeordnet …</div>';
    try{
      const parcel=await fetchEgrid(base,point.easting,point.northing);
      const data={...parcel,region,links:linksFor(base,parcel.egrid),checkedAt:new Date().toISOString()};
      persist(data);return data;
    }catch(e){
      console.warn('ÖREB-Abfrage',e);
      const data={region,service:base,egrid:null,message:'Die direkte EGRID-Abfrage war nicht verfügbar. Der übrige Standortcheck bleibt gültig; der kantonale ÖREB-Dienst kann manuell geöffnet werden.',checkedAt:new Date().toISOString()};
      persist(data);return null;
    }
  }

  function wrapExisting(){
    if(typeof populateExisting!=='function'||populateExisting.__oereb20)return;
    const base=populateExisting;
    const wrapped=function(item){const result=base(item);setTimeout(()=>render(item?.locationAnalysis?.oerebData||null),50);return result};
    wrapped.__oereb20=true;populateExisting=wrapped;
  }

  function wrapQuality(){
    if(typeof calculate!=='function'||calculate.__oereb20)return;
    const base=calculate;
    const wrapped=function(item){
      const result=base(item),oereb=item?.locationAnalysis?.oerebData;
      if(!result?.dataQuality||!oereb?.egrid)return result;
      const score=Math.min(100,Number(result.dataQuality.score||0)+6);
      const label=score>=80?'hoch':score>=60?'mittel':'niedrig';
      return {...result,dataQuality:{...result.dataQuality,score,label}};
    };
    wrapped.__oereb20=true;calculate=wrapped;
  }

  function setVersion(){
    const b=document.getElementById('versionBadge');if(b)b.textContent='Beta 0.20 · ÖREB';
    const side=document.getElementById('appVersion');if(side)side.textContent='Beta 0.20';
  }

  function install(){
    injectStyles();ensureBox();wrapExisting();wrapQuality();setVersion();
    window.addEventListener('structa:official-data',e=>run(e.detail));
    if(typeof currentLocationAnalysis!=='undefined'&&currentLocationAnalysis?.oerebData)render(currentLocationAnalysis.oerebData);
  }

  window.__structaRunOereb=run;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
