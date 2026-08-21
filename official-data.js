const OFFICIAL_DATA_VERSION='0.19';

(function(){
  const API='https://api3.geo.admin.ch/rest/services/api';
  const CACHE_PREFIX='structaOfficial19:';

  function escO(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function strip(value){
    return String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  }

  function cacheGet(key,maxAge=7*864e5){
    try{const x=JSON.parse(localStorage.getItem(CACHE_PREFIX+key)||'null');if(x&&Date.now()-x.savedAt<maxAge)return x.data}catch{}
    return null;
  }

  function cacheSet(key,data){
    try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({savedAt:Date.now(),data}))}catch{}
  }

  async function getJson(url){
    const r=await fetch(url,{headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error('geo.admin '+r.status);
    return r.json();
  }

  function normaliseLv95(attrs={}){
    const values=[Number(attrs.x),Number(attrs.y)].filter(Number.isFinite);
    let easting=values.find(v=>v>=2400000&&v<=2900000);
    let northing=values.find(v=>v>=1000000&&v<=1400000);
    if(!easting||!northing){
      const east03=values.find(v=>v>=400000&&v<=900000);
      const north03=values.find(v=>v>=0&&v<=400000);
      if(east03&&north03){easting=east03+2000000;northing=north03+1000000;}
    }
    return easting&&northing?{easting,northing}:null;
  }

  async function locateLv95(address){
    const key='point:'+address.toLowerCase();
    const cached=cacheGet(key,30*864e5);if(cached)return cached;
    const q=new URLSearchParams({type:'locations',origins:'address',limit:'1',sr:'2056',searchText:address});
    const d=await getJson(API+'/SearchServer?'+q.toString());
    const result=d?.results?.[0],attrs=result?.attrs||{};
    const lv95=normaliseLv95(attrs);
    if(!lv95)throw new Error('Keine LV95-Koordinaten gefunden');
    const out={...lv95,label:strip(attrs.label||attrs.detail||address),featureId:attrs.featureId||result?.id||null};
    cacheSet(key,out);return out;
  }

  async function identifyLayer(point,layer){
    const q=new URLSearchParams({
      geometry:`${point.easting},${point.northing}`,
      geometryType:'esriGeometryPoint',
      layers:'all:'+layer,
      mapExtent:'2480000,1070000,2840000,1310000',
      imageDisplay:'3600,2400,96',
      tolerance:'0',
      sr:'2056'
    });
    const d=await getJson(API+'/MapServer/identify?'+q.toString());
    return Array.isArray(d?.results)?d.results:[];
  }

  async function findParcel(point){
    try{
      const d=12;
      const q=new URLSearchParams({
        type:'locations',origins:'parcel',limit:'3',sr:'2056',
        bbox:`${point.easting-d},${point.northing-d},${point.easting+d},${point.northing+d}`
      });
      const data=await getJson(API+'/SearchServer?'+q.toString());
      const r=data?.results?.[0],a=r?.attrs||{};
      if(!r)return null;
      return {label:strip(a.label||a.detail||'Parzelle gefunden'),featureId:a.featureId||r.id||null};
    }catch(e){console.warn('Parzellensuche',e);return null}
  }

  function attrsOf(result){return result?.attributes||result?.properties||result?.feature?.attributes||{}}
  function normKey(k){return String(k).toLowerCase().replace(/[^a-z0-9äöü]+/g,'')}

  function pickAttr(attrs,patterns){
    const entries=Object.entries(attrs||{}).filter(([,v])=>v!=null&&String(v).trim()!=='');
    for(const p of patterns){
      const np=normKey(p);
      const hit=entries.find(([k])=>normKey(k)===np)||entries.find(([k])=>normKey(k).includes(np));
      if(hit)return strip(hit[1]);
    }
    return null;
  }

  function zoneResult(results){
    if(!results.length)return {found:false,label:'Keine harmonisierte Bauzone am Punkt gefunden'};
    const a=attrsOf(results[0]);
    const label=pickAttr(a,['ch_bez_d','nutzung_de','hauptnutzung','nutzungsart','bezeichnung','zone','typ','label'])||'Bauzone erkannt';
    return {found:true,label,attributes:a,featureId:results[0]?.featureId||results[0]?.id||null};
  }

  function transitClassResult(results){
    if(!results.length)return {found:false,label:'Keine ÖV-Güteklasse A–D am Punkt gefunden',className:null};
    const a=attrsOf(results[0]);
    let label=pickAttr(a,['gueteklasse','güteklasse','klasse','class','kat','bezeichnung','label']);
    if(!label){
      const values=Object.values(a).map(strip).filter(Boolean);
      label=values.find(v=>/\b[ABCD]\b/i.test(v))||'ÖV-Güteklasse erkannt';
    }
    const m=String(label).match(/\b([ABCD])\b/i);
    return {found:true,label,className:m?m[1].toUpperCase():null,attributes:a,featureId:results[0]?.featureId||results[0]?.id||null};
  }

  async function fetchOfficialData(address){
    const key='bundle:'+address.toLowerCase();
    const cached=cacheGet(key);if(cached)return cached;
    const point=await locateLv95(address);
    const [zoneSettled,transitSettled,parcelSettled]=await Promise.allSettled([
      identifyLayer(point,'ch.are.bauzonen'),
      identifyLayer(point,'ch.are.gueteklassen_oev'),
      findParcel(point)
    ]);
    const zone=zoneSettled.status==='fulfilled'?zoneResult(zoneSettled.value):{found:null,label:'Bauzone derzeit nicht abrufbar'};
    const transit=transitSettled.status==='fulfilled'?transitClassResult(transitSettled.value):{found:null,label:'ÖV-Güteklasse derzeit nicht abrufbar',className:null};
    const parcel=parcelSettled.status==='fulfilled'?parcelSettled.value:null;
    const data={
      point,parcel,zone,transit,
      checkedAt:new Date().toISOString(),
      sources:{
        zone:'Bundesamt für Raumentwicklung ARE · Bauzonen Schweiz (harmonisiert), Datenstand 01.01.2022',
        transit:'Bundesamt für Raumentwicklung ARE · ÖV-Güteklassen',
        parcel:'geo.admin.ch · Katasterparzellensuche'
      }
    };
    cacheSet(key,data);return data;
  }

  function ensureOfficialBox(){
    const locationResult=document.getElementById('locationResult');
    if(!locationResult)return null;
    let box=document.getElementById('officialDataResult');
    if(!box){box=document.createElement('div');box.id='officialDataResult';box.className='official-data-result';locationResult.insertAdjacentElement('afterend',box)}
    return box;
  }

  function injectStyles(){
    if(document.getElementById('officialDataStyles'))return;
    const s=document.createElement('style');s.id='officialDataStyles';s.textContent=`
      .official-data-result{margin-top:12px}.official-data-card{border:1px solid #dfe7f2;background:#fff;border-radius:12px;padding:12px}.official-data-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.official-data-head strong{color:#173d63}.official-badge{font-size:9px;font-weight:900;background:#e9f8ef;color:#17683c;padding:4px 7px;border-radius:999px}.official-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.official-grid div{background:#f6f8fb;border-radius:9px;padding:9px}.official-grid span{display:block;color:#7a8594;font-size:9px}.official-grid strong{display:block;color:#223148;font-size:11px;margin-top:3px;line-height:1.35}.official-source{margin-top:9px;color:#7a8594;font-size:9px;line-height:1.45}@media(max-width:650px){.official-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function renderOfficial(data){
    const box=ensureOfficialBox();if(!box)return;
    if(!data){box.innerHTML='';return}
    const parcel=data.parcel?.label||'noch nicht eindeutig ermittelt';
    const zone=data.zone?.label||'offen';
    const transit=data.transit?.className?`Klasse ${data.transit.className} · ${data.transit.label}`:(data.transit?.label||'offen');
    box.innerHTML=`<div class="official-data-card"><div class="official-data-head"><strong>Amtliche Standortdaten</strong><span class="official-badge">BUNDESDATEN</span></div><div class="official-grid"><div><span>Kataster / Parzelle</span><strong>${escO(parcel)}</strong></div><div><span>Bauzone</span><strong>${escO(zone)}</strong></div><div><span>ÖV-Güteklasse</span><strong>${escO(transit)}</strong></div></div><div class="official-source">Bauzone: ARE, harmonisierter Bundesdatensatz (Stand 01.01.2022) · ÖV-Güteklasse: ARE · Parzelle: geo.admin.ch. Diese Angaben verbessern die Erstprüfung, ersetzen aber bei einer Kaufentscheidung nicht den aktuellen kommunalen Zonenplan/ÖREB-Auszug.</div></div>`;
  }

  function persistOfficial(data){
    try{
      if(typeof currentLocationAnalysis==='undefined'||!currentLocationAnalysis)return;
      currentLocationAnalysis={...currentLocationAnalysis,officialData:data};
      if(typeof persistLocationIntoContext==='function')persistLocationIntoContext();
      renderOfficial(data);
      if(typeof updatePreview==='function')updatePreview();
      if(typeof render==='function')render();
    }catch(e){console.warn('Amtliche Daten speichern',e)}
  }

  async function runOfficialCheck(){
    const address=(document.getElementById('siteAddress')?.value||globalThis.pendingMarketContext?.marketAddress||'').trim();
    if(!address)return null;
    const box=ensureOfficialBox();if(box)box.innerHTML='<div class="official-data-card">Amtliche Bauzonen- und ÖV-Daten werden geprüft …</div>';
    try{const data=await fetchOfficialData(address);persistOfficial(data);return data}catch(e){console.warn('Amtliche Standortdaten',e);if(box)box.innerHTML='<div class="official-data-card">Amtliche Zusatzdaten konnten gerade nicht geladen werden. Der übrige Standortcheck bleibt gültig.</div>';return null}
  }

  function wrapLocationCheck(){
    if(typeof analyzeLocation!=='function'||analyzeLocation.__official19)return;
    const base=analyzeLocation;
    const wrapped=async function(...args){const result=await base(...args);await runOfficialCheck();return result};
    wrapped.__official19=true;analyzeLocation=wrapped;
  }

  function wrapExisting(){
    if(typeof populateExisting!=='function'||populateExisting.__official19)return;
    const base=populateExisting;
    const wrapped=function(item){const result=base(item);setTimeout(()=>renderOfficial(item?.locationAnalysis?.officialData||null),30);return result};
    wrapped.__official19=true;populateExisting=wrapped;
  }

  function wrapAccuracyQuality(){
    if(typeof calculate!=='function'||calculate.__official19)return;
    const base=calculate;
    const wrapped=function(item){
      const result=base(item),official=item?.locationAnalysis?.officialData;
      if(!result?.dataQuality||!official)return result;
      let boost=0;
      if(official.zone?.found!==null)boost+=4;
      if(official.transit?.found!==null)boost+=4;
      if(official.parcel)boost+=2;
      const score=Math.min(100,Number(result.dataQuality.score||0)+boost);
      const label=score>=80?'hoch':score>=60?'mittel':'niedrig';
      return {...result,dataQuality:{...result.dataQuality,score,label}};
    };
    wrapped.__official19=true;calculate=wrapped;
  }

  function setVersion(){
    const b=document.getElementById('versionBadge');if(b)b.textContent='Beta 0.19 · Amtliche Daten';
    const side=document.getElementById('appVersion');if(side)side.textContent='Beta 0.19';
  }

  function install(){injectStyles();ensureOfficialBox();wrapLocationCheck();wrapExisting();wrapAccuracyQuality();setVersion()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
