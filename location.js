const LOCATION_VERSION='0.13';
const RENT_BENCHMARKS={
  'Basel-Stadt':{annual:357,source:'RealAdvisor',date:'August 2026',scope:'Kanton'},
  'Basel-Landschaft':{annual:320,source:'RealAdvisor',date:'August 2026',scope:'Kanton'},
  'Aargau':{annual:294,source:'RealAdvisor',date:'August 2026',scope:'Kanton'},
  'Solothurn':{annual:248,source:'RealAdvisor',date:'August 2026',scope:'Kanton'}
};
const OVERPASS_ENDPOINTS=[
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
let currentLocationAnalysis=null;

function injectLocationStyles(){
  if(document.getElementById('structaLocationStyles'))return;
  const style=document.createElement('style');
  style.id='structaLocationStyles';
  style.textContent=`
    .location-section{background:#fbfcff;border:1px solid #dfe7f2;border-radius:14px;padding:16px;margin-top:16px}
    .location-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
    .location-title h4{margin:0;color:#173d63}.location-title p{margin:4px 0 0;color:#738096;font-size:12px;line-height:1.45}
    .location-grid{display:grid;grid-template-columns:2fr 1fr;gap:12px}.location-grid label{display:grid;gap:6px}.location-grid label span{font-size:12px;font-weight:700;color:#596579}
    .location-status{margin-top:12px;padding:12px;border-radius:11px;background:#fff;border:1px solid #e3e8f0;color:#536177;font-size:12px;line-height:1.5}
    .location-status.warn{background:#fff8e8;border-color:#f1dda8}.location-status.error{background:#fdeeee;border-color:#efcccc;color:#8c3434}
    .location-score-row{display:grid;grid-template-columns:125px 1fr;gap:12px;align-items:start;margin-top:12px}
    .location-score-box{background:#173d63;color:#fff;border-radius:14px;padding:14px;text-align:center}.location-score-box strong{display:block;font-size:32px}.location-score-box span{font-size:10px;color:#dbe8f5}
    .confidence{margin-top:6px;display:inline-flex;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;background:#eaf0ff;color:#2647a3}
    .location-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.location-metric{background:#fff;border:1px solid #e5eaf2;border-radius:10px;padding:9px}
    .location-metric span{display:block;font-size:10px;color:#758196}.location-metric strong{display:block;margin-top:3px;font-size:12px;color:#25364f}.location-metric small{display:block;margin-top:3px;font-size:9px;color:#8a95a5}
    .location-source{margin-top:10px;color:#7a8594;font-size:10px;line-height:1.45}.location-explain{margin-top:10px;padding:10px 12px;border-radius:10px;background:#f5f8fd;color:#536177;font-size:11px;line-height:1.45}
    .loc-chip{display:inline-flex;align-items:center;border-radius:999px;background:#eaf0ff;color:#2647a3;padding:4px 7px;font-size:10px;font-weight:900;margin-right:6px;margin-bottom:7px}
    .loc-chip.weak{background:#fdecec;color:#9d2c2c}.loc-chip.mid{background:#fff6df;color:#8a5b00}.loc-chip.good{background:#e9f8ef;color:#17683c}
    .location-card-badge{display:inline-flex;margin-left:6px;border-radius:999px;padding:4px 7px;background:#eaf0ff;color:#2647a3;font-size:10px;font-weight:900}
    @media(max-width:700px){.location-title{flex-direction:column}.location-title .btn{width:100%}.location-grid{grid-template-columns:1fr}.location-score-row{grid-template-columns:1fr}.location-metrics{grid-template-columns:1fr 1fr}}
    @media(max-width:460px){.location-metrics{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function injectLocationSection(){
  if(document.getElementById('locationSection'))return;
  const preview=document.getElementById('previewCalc'); if(!preview)return;
  const section=document.createElement('div');
  section.id='locationSection'; section.className='location-section';
  section.innerHTML=`
    <div class="location-title">
      <div><h4>5 · Standort & Nachfrage</h4><p>Fehlende Geodaten werden nicht mehr als schlechte Lage gewertet. Der Scout zeigt zusätzlich die Datenqualität der Standortprüfung.</p></div>
      <button type="button" class="btn secondary" id="locationCheckBtn">Standort prüfen</button>
    </div>
    <div class="location-grid">
      <label><span>Adresse</span><input id="siteAddress" autocomplete="street-address" placeholder="z. B. Hohenrainstrasse 10a, Pratteln"></label>
      <label><span>Nutzungsprofil</span><select id="locationUseType"><option value="auto">Automatisch aus Projektart</option><option value="residential">Wohnen</option><option value="commercial">Gewerbe</option><option value="mixed">Mischnutzung</option></select></label>
    </div>
    <div id="locationStatus" class="location-status">Noch nicht geprüft.</div>
    <div id="locationResult"></div>
    <div class="location-source">Adresssuche: geo.admin.ch, Fallback OpenStreetMap/Nominatim. ÖV: transport.opendata.ch. Umfeld: OpenStreetMap/Overpass mit mehreren kostenlosen Server-Fallbacks. Mietwert = kantonaler Screening-Benchmark, kein objektspezifischer Mietspiegel.</div>`;
  preview.parentNode.insertBefore(section,preview);
  document.getElementById('locationCheckBtn')?.addEventListener('click',()=>analyzeLocation(false));
  document.getElementById('siteAddress')?.addEventListener('input',markLocationStale);
  document.getElementById('locationUseType')?.addEventListener('change',()=>currentLocationAnalysis?recomputeUseScore():markLocationStale());
  document.getElementById('strategy')?.addEventListener('change',()=>{if(currentLocationAnalysis&&document.getElementById('locationUseType')?.value==='auto')recomputeUseScore();});
}

function effectiveUseType(){
  const v=document.getElementById('locationUseType')?.value||'auto';
  if(v!=='auto')return v;
  const strategy=document.getElementById('strategy')?.value||'';
  if(strategy==='Gewerbe')return 'commercial';
  if(strategy==='Mischnutzung')return 'mixed';
  return 'residential';
}
function markLocationStale(){
  if(!currentLocationAnalysis)return;
  const s=document.getElementById('locationStatus'); if(s){s.className='location-status warn';s.innerHTML='<strong>Adresse oder Nutzung geändert.</strong> Standort bitte neu prüfen.';}
}
function cacheGet(key,maxAge){try{const x=JSON.parse(localStorage.getItem(key)||'null');if(x&&Date.now()-x.savedAt<maxAge)return x.data;}catch{}return null}
function cacheSet(key,data){try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));}catch{}}
function stripHtml(s=''){return String(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
function geoPointFromAdmin(result){
  const a=result?.attrs||{},g=result?.geom_st_box2d||result?.geometry||{};
  const lat=Number(a.lat??a.latitude??result?.lat??g?.coordinates?.[1]),lon=Number(a.lon??a.longitude??result?.lon??g?.coordinates?.[0]);
  if(Number.isFinite(lat)&&Number.isFinite(lon))return {lat,lon,displayName:stripHtml(a.label||a.detail||a.address||'Adresse über geo.admin.ch'),provider:'geo.admin.ch'};
  return null;
}
async function geocodeAddress(address){
  const key='structaGeo13:'+address.trim().toLowerCase(),cached=cacheGet(key,30*864e5);if(cached)return cached;
  try{
    const url='https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&origins=address&limit=1&sr=4326&searchText='+encodeURIComponent(address);
    const r=await fetch(url,{headers:{Accept:'application/json'}});if(r.ok){const d=await r.json(),p=geoPointFromAdmin(d?.results?.[0]);if(p){cacheSet(key,p);return p;}}
  }catch(e){console.warn('geo.admin geocoding fallback',e)}
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ch&q='+encodeURIComponent(address);
  const r=await fetch(url,{headers:{Accept:'application/json'},referrerPolicy:'strict-origin-when-cross-origin'});if(!r.ok)throw new Error('Adresssuche '+r.status);
  const d=await r.json();if(!d?.length)throw new Error('Adresse nicht gefunden');
  const p={lat:Number(d[0].lat),lon:Number(d[0].lon),displayName:d[0].display_name,provider:'OpenStreetMap/Nominatim'};cacheSet(key,p);return p;
}
function overpassQuery(lat,lon){return `[out:json][timeout:15];
(
 nwr(around:3500,${lat},${lon})["amenity"~"^(school|kindergarten)$"];
 nwr(around:2500,${lat},${lon})["shop"~"^(supermarket|convenience|mall|department_store)$"];
 nwr(around:3500,${lat},${lon})["amenity"~"^(doctors|pharmacy|clinic|hospital)$"];
 nwr(around:3000,${lat},${lon})["leisure"~"^(park|playground|sports_centre|fitness_centre)$"];
 nwr(around:6000,${lat},${lon})["railway"="station"];
 node(around:9000,${lat},${lon})["highway"="motorway_junction"];
 way(around:3500,${lat},${lon})["highway"~"^(motorway|trunk|primary|secondary)$"];
 nwr(around:2500,${lat},${lon})["amenity"="parking"];
 nwr(around:3500,${lat},${lon})["landuse"~"^(commercial|industrial|retail)$"];
);out center tags;`;}
async function fetchNearby(lat,lon){
  const key='structaNearby13:'+lat.toFixed(4)+','+lon.toFixed(4),cached=cacheGet(key,7*864e5);if(cached)return cached;
  const body='data='+encodeURIComponent(overpassQuery(lat,lon));let lastErr=null;
  for(const endpoint of OVERPASS_ENDPOINTS){
    try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});if(!r.ok)throw new Error(String(r.status));const d=await r.json();const out={...d,provider:endpoint};cacheSet(key,out);return out}catch(e){lastErr=e;}
  }
  throw new Error('Umfelddaten nicht erreichbar'+(lastErr?': '+lastErr.message:''));
}
async function fetchTransit(lat,lon){
  const key='structaTransit13:'+lat.toFixed(4)+','+lon.toFixed(4),cached=cacheGet(key,24*60*60*1000);if(cached)return cached;
  const url=`https://transport.opendata.ch/v1/locations?x=${encodeURIComponent(lat)}&y=${encodeURIComponent(lon)}`;
  const r=await fetch(url);if(!r.ok)throw new Error('ÖV '+r.status);const d=await r.json();
  const stations=(d.stations||[]).filter(x=>x&&Number.isFinite(Number(x.distance))).slice(0,10);
  const out={stations,nearest:stations[0]||null,provider:'transport.opendata.ch'};cacheSet(key,out);return out;
}
function pointOf(el){const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;return Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))?{lat:Number(lat),lon:Number(lon)}:null;}
function haversine(a,b){const R=6371000,toRad=x=>x*Math.PI/180,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),q=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function minDistance(elements,origin,filter){let m=Infinity;for(const el of elements){if(!filter(el))continue;const p=pointOf(el);if(p)m=Math.min(m,haversine(origin,p));}return Number.isFinite(m)?Math.round(m):null;}
function countElements(elements,filter){return elements.filter(filter).length;}
function deriveMetrics(elements,origin,transit){
  const amenity=(...x)=>el=>x.includes(el.tags?.amenity),shop=(...x)=>el=>x.includes(el.tags?.shop),leisure=(...x)=>el=>x.includes(el.tags?.leisure);
  return {
    school:minDistance(elements,origin,el=>['school','kindergarten'].includes(el.tags?.amenity)),
    shopping:minDistance(elements,origin,shop('supermarket','convenience','mall','department_store')),
    health:minDistance(elements,origin,amenity('doctors','pharmacy','clinic','hospital')),
    leisure:minDistance(elements,origin,leisure('park','playground','sports_centre','fitness_centre')),
    transit:transit?.nearest?.distance!=null?Math.round(Number(transit.nearest.distance)):null,
    transitName:transit?.nearest?.name||null,
    station:minDistance(elements,origin,el=>el.tags?.railway==='station'),
    motorway:minDistance(elements,origin,el=>el.tags?.highway==='motorway_junction'),
    majorRoad:minDistance(elements,origin,el=>['motorway','trunk','primary','secondary'].includes(el.tags?.highway)),
    parking:minDistance(elements,origin,amenity('parking')),
    businessCount:countElements(elements,el=>['commercial','industrial','retail'].includes(el.tags?.landuse))
  };
}
function distanceScore(d,steps){if(d==null)return null;for(const [limit,score] of steps)if(d<=limit)return score;return 15;}
function rentScore(annual){if(!annual)return null;const min=248,max=357;return Math.round(Math.max(45,Math.min(100,50+((annual-min)/(max-min))*50)));}
function weightedAvailable(parts){
  let total=0,w=0,available=0;
  for(const p of parts){if(p.score==null)continue;total+=p.score*p.weight;w+=p.weight;available++;}
  return {score:w?Math.round(total/w):null,available,totalParts:parts.length,coverage:w};
}
function residentialScore(metrics,annual){
  return weightedAvailable([
    {score:distanceScore(metrics.school,[[500,100],[900,88],[1500,70],[2500,45],[3500,25]]),weight:.25},
    {score:distanceScore(metrics.shopping,[[400,100],[800,90],[1500,68],[2200,45]]),weight:.20},
    {score:distanceScore(metrics.transit,[[300,100],[500,92],[800,78],[1500,55],[2500,30]]),weight:.25},
    {score:distanceScore(metrics.health,[[700,100],[1200,85],[2200,60],[3200,35]]),weight:.10},
    {score:distanceScore(metrics.leisure,[[500,100],[1000,85],[1800,65],[2800,40]]),weight:.10},
    {score:rentScore(annual),weight:.10}
  ]);
}
function commercialScore(metrics){
  const env=metrics.businessCount==null?null:metrics.businessCount>=5?100:metrics.businessCount>=3?85:metrics.businessCount>=1?65:35;
  return weightedAvailable([
    {score:distanceScore(metrics.motorway,[[1200,100],[2500,90],[4500,75],[6500,55],[9000,35]]),weight:.28},
    {score:distanceScore(metrics.majorRoad,[[250,100],[600,90],[1200,75],[2200,55],[3500,35]]),weight:.22},
    {score:distanceScore(metrics.transit,[[300,100],[700,88],[1400,68],[2500,45]]),weight:.18},
    {score:distanceScore(metrics.station,[[800,100],[1800,88],[3500,68],[5500,45]]),weight:.12},
    {score:distanceScore(metrics.parking,[[300,100],[700,85],[1400,65],[2300,40]]),weight:.08},
    {score:env,weight:.12}
  ]);
}
function confidenceScore(res,com,osmOk,transitOk){
  const relevant=effectiveUseType()==='commercial'?com:effectiveUseType()==='mixed'?{coverage:(res.coverage+com.coverage)/2}:res;
  let c=Math.round((relevant.coverage||0)*100);
  if(osmOk)c=Math.min(100,c+5);if(transitOk)c=Math.min(100,c+5);
  return Math.max(0,Math.min(100,c));
}
function chooseLocationScore(use,res,com){if(use==='commercial')return com.score;if(use==='mixed'){if(res.score==null)return com.score;if(com.score==null)return res.score;return Math.round((res.score+com.score)/2)}return res.score;}
function fmtDistance(d){if(d==null)return 'keine belastbare Angabe';return d<1000?`${d} m`:`${(d/1000).toFixed(1)} km`;}
function scoreClass(s){return s>=75?'good':s>=55?'mid':'weak';}
function confidenceLabel(c){return c>=80?'hoch':c>=60?'mittel':'niedrig';}
function persistLocationIntoContext(){if(!currentLocationAnalysis)return;pendingMarketContext={...(pendingMarketContext||{}),siteAddress:document.getElementById('siteAddress')?.value||currentLocationAnalysis.address,locationAnalysis:currentLocationAnalysis};}
function recomputeUseScore(){
  if(!currentLocationAnalysis)return;
  const use=effectiveUseType(),score=chooseLocationScore(use,currentLocationAnalysis.residential,currentLocationAnalysis.commercial);
  currentLocationAnalysis={...currentLocationAnalysis,useType:use,score};
  persistLocationIntoContext();renderLocationResult();updatePreview();render();
}
async function analyzeLocation(autoTriggered=false){
  const address=(document.getElementById('siteAddress')?.value||pendingMarketContext?.marketAddress||'').trim(),status=document.getElementById('locationStatus'),btn=document.getElementById('locationCheckBtn');
  if(!address){if(status){status.className='location-status warn';status.innerHTML='<strong>Adresse fehlt.</strong> Bitte Strasse/Ort oder mindestens Gemeinde eingeben.';}return;}
  if(btn)btn.disabled=true;if(status){status.className='location-status';status.innerHTML='<strong>Standort wird geprüft …</strong> Schweizer Adresse, ÖV und Umfeld werden getrennt abgefragt.';}
  try{
    const geo=await geocodeAddress(address);
    const [osmResult,transitResult]=await Promise.allSettled([fetchNearby(geo.lat,geo.lon),fetchTransit(geo.lat,geo.lon)]);
    const osm=osmResult.status==='fulfilled'?osmResult.value:null,transit=transitResult.status==='fulfilled'?transitResult.value:null;
    if(!osm&&!transit)throw new Error('Umfeld und ÖV derzeit nicht erreichbar');
    const metrics=deriveMetrics(osm?.elements||[],{lat:geo.lat,lon:geo.lon},transit);
    const region=document.getElementById('region')?.value||'',rent=RENT_BENCHMARKS[region]||null,res=residentialScore(metrics,rent?.annual||0),com=commercialScore(metrics),use=effectiveUseType();
    const confidence=confidenceScore(res,com,!!osm,!!transit),score=chooseLocationScore(use,res,com);
    currentLocationAnalysis={address,displayName:geo.displayName,lat:geo.lat,lon:geo.lon,geocoder:geo.provider,useType:use,residentialScore:res.score,commercialScore:com.score,residential:res,commercial:com,score,confidence,confidenceLabel:confidenceLabel(confidence),rentAnnualM2:rent?.annual||null,rentMonthlyM2:rent?.annual?Math.round(rent.annual/1.2)/10:null,rentSource:rent?.source||'',rentDate:rent?.date||'',rentScope:rent?.scope||'',metrics,checkedAt:new Date().toISOString(),osmProvider:osm?.provider||null,transitProvider:transit?.provider||null};
    persistLocationIntoContext();
    if(status){status.className='location-status'+(confidence<60?' warn':'');status.innerHTML=`<strong>Standortprüfung abgeschlossen.</strong> Datenqualität: ${currentLocationAnalysis.confidenceLabel} (${confidence}/100). ${autoTriggered?'Automatisch aus dem Objekt gestartet.':''}`;}
    renderLocationResult();updatePreview();render();
  }catch(e){
    console.warn('Standortprüfung fehlgeschlagen',e);
    if(status){status.className='location-status error';status.innerHTML='<strong>Standortdaten aktuell nicht zuverlässig verfügbar.</strong> Das Objekt wird deshalb nicht negativ bewertet. Bitte später erneut prüfen.';}
    currentLocationAnalysis=null;persistLocationIntoContext();renderLocationResult();updatePreview();render();
  }finally{if(btn)btn.disabled=false;}
}
function metricHtml(label,value,note=''){return `<div class="location-metric"><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</div>`;}
function renderLocationResult(){
  const t=document.getElementById('locationResult'),x=currentLocationAnalysis;if(!t)return;if(!x){t.innerHTML='';return;}
  const m=x.metrics||{},useLabel=x.useType==='commercial'?'Gewerbe':x.useType==='mixed'?'Mischnutzung':'Wohnen';
  const rent=x.rentMonthlyM2?metricHtml('Mietbenchmark Wohnen',`CHF ${x.rentMonthlyM2.toFixed(1)}/m² Monat`,`${x.rentScope} · ${x.rentDate}`):'';
  const residential=metricHtml('Schule / Kindergarten',fmtDistance(m.school))+metricHtml('Einkauf',fmtDistance(m.shopping))+metricHtml('ÖV',fmtDistance(m.transit),m.transitName||'')+metricHtml('Arzt / Apotheke',fmtDistance(m.health))+metricHtml('Freizeit / Park',fmtDistance(m.leisure))+rent;
  const commercial=metricHtml('Autobahnanschluss',fmtDistance(m.motorway))+metricHtml('Hauptverkehrsachse',fmtDistance(m.majorRoad))+metricHtml('ÖV',fmtDistance(m.transit),m.transitName||'')+metricHtml('Bahnhof',fmtDistance(m.station))+metricHtml('Parkierung',fmtDistance(m.parking))+metricHtml('Gewerbeumfeld',`${m.businessCount||0} erfasste Flächen`,'OSM-Umfeldindikator');
  const score=x.score==null?'–':x.score;
  t.innerHTML=`<div class="location-score-row"><div class="location-score-box"><strong>${score}</strong><span>STANDORT SCORE · ${useLabel.toUpperCase()}</span><div class="confidence">Datenqualität ${x.confidenceLabel} · ${x.confidence}/100</div></div><div><span class="loc-chip ${scoreClass(x.residentialScore||0)}">Wohnen ${x.residentialScore??'–'}/100</span><span class="loc-chip ${scoreClass(x.commercialScore||0)}">Gewerbe ${x.commercialScore??'–'}/100</span><div class="location-metrics">${x.useType==='commercial'?commercial:x.useType==='mixed'?residential+commercial:residential}</div><div class="location-explain">${x.confidence<60?'<strong>Wichtig:</strong> Die Datenabdeckung ist noch zu schwach für eine harte Kauf-/Nicht-kaufen-Aussage. Der Standort wirkt im Investment Score deshalb nur neutral.':'Die Datenabdeckung reicht für eine belastbare Erstbewertung. Mietwerte bleiben bewusst nur ein regionaler Screening-Benchmark.'}</div></div></div>`;
}

const baseCalculate=calculate;
calculate=function(x){
  const base=baseCalculate(x);if(base.invest==null)return base;
  const loc=x.locationAnalysis;
  if(!loc?.score||Number(loc.confidence||0)<60)return {...base,locationScore:loc?.score||null,locationConfidence:loc?.confidence||0};
  const econ=clamp((base.margin+5)*4),market=clamp(50+base.marketBuffer*2),ls=clamp(Number(loc.score)||50);
  const score=Math.round(econ*.30+market*.15+ls*.25+(+x.planning||50)*.10+(+x.architecture||60)*.10+(+x.risk||50)*.10);
  let decision=base.decision,decisionClass=base.decisionClass,reason=base.reason;
  if(ls<40){decision='NICHT KAUFEN';decisionClass='no';reason='Standort- und Nachfrageprüfung ist bei ausreichender Datenqualität für die vorgesehene Nutzung zu schwach.';}
  else if(decision==='KAUFEN'&&ls<65){decision='VERTIEFEN';decisionClass='check';reason='Wirtschaftlichkeit ist attraktiv, aber der Standort muss vor einem Kaufentscheid vertieft werden.';}
  else if(decision==='VERTIEFEN'&&ls>=75&&base.margin>=15&&base.marketBuffer>=8){reason='Wirtschaftlichkeit und Standort sind attraktiv; Kostengrundlage und Baurecht als Nächstes vertiefen.';}
  return {...base,score,decision,decisionClass,reason,locationScore:ls,locationConfidence:loc.confidence};
};
const baseUpdatePreview=updatePreview;updatePreview=function(){baseUpdatePreview();renderLocationResult();};
const baseRender=render;render=function(){
  baseRender();
  document.querySelectorAll('.deal-card').forEach(card=>{
    const id=card.querySelector('.edit-deal')?.dataset.id;if(!id)return;const item=state.items.find(x=>x.id===id),loc=item?.locationAnalysis;if(!loc)return;
    const top=card.querySelector('.deal-top');if(!top||top.querySelector('.location-card-badge'))return;
    const b=document.createElement('span');b.className='location-card-badge';b.textContent=`Standort ${loc.score??'–'}/100 · ${loc.confidenceLabel||confidenceLabel(loc.confidence||0)}`;top.insertBefore(b,top.querySelector('h4'));
  });
};
const basePopulateExisting=populateExisting;populateExisting=function(item){
  basePopulateExisting(item);currentLocationAnalysis=item.locationAnalysis||null;
  if(document.getElementById('siteAddress'))document.getElementById('siteAddress').value=item.siteAddress||item.marketAddress||'';
  if(document.getElementById('locationUseType'))document.getElementById('locationUseType').value=item.locationAnalysis?.useType||'auto';
  renderLocationResult();const s=document.getElementById('locationStatus');if(s&&currentLocationAnalysis){s.className='location-status';s.innerHTML=`<strong>Gespeicherte Standortprüfung geladen.</strong> Datenqualität ${currentLocationAnalysis.confidenceLabel||confidenceLabel(currentLocationAnalysis.confidence||0)}.`;}
};
const originalMarketOpportunity=window.openMarketOpportunity;
window.openMarketOpportunity=function(item){
  currentLocationAnalysis=null;originalMarketOpportunity(item);
  setTimeout(()=>{const a=item.address||'';if(document.getElementById('siteAddress'))document.getElementById('siteAddress').value=a;if(document.getElementById('locationUseType'))document.getElementById('locationUseType').value='auto';if(a)analyzeLocation(true);},50);
};
function patchDecisionModel(){
  const w=document.querySelector('.model .weights');if(w)w.innerHTML=`<div><p><strong>Wirtschaftlichkeit</strong><small>Marge und Projektökonomie</small></p><b>30 %</b></div><div><p><strong>Markt</strong><small>Puffer zum Break-even</small></p><b>15 %</b></div><div><p><strong>Standort & Nachfrage</strong><small>nur bei ausreichender Datenqualität</small></p><b>25 %</b></div><div><p><strong>Baurecht</strong><small>Entwicklungspotenzial</small></p><b>10 %</b></div><div><p><strong>Architektur</strong><small>Qualitätspotenzial</small></p><b>10 %</b></div><div><p><strong>Risiko</strong><small>Planungs-/Projektrisiko</small></p><b>10 %</b></div>`;
  const r=document.querySelector('.model .roadmap');if(r)r.innerHTML='<strong>Datenqualität vor Härte</strong><p>Fehlende Standortdaten zählen nicht als schlechte Lage. Erst ab ausreichender Datenqualität darf der Standort einen Kaufentscheid verschlechtern.</p>';
}
function bindLocationPersistence(){
  document.getElementById('form')?.addEventListener('submit',()=>{if(currentLocationAnalysis)persistLocationIntoContext();},true);
  document.getElementById('addBtn')?.addEventListener('click',()=>{currentLocationAnalysis=null;setTimeout(()=>{if(document.getElementById('siteAddress'))document.getElementById('siteAddress').value='';renderLocationResult();const s=document.getElementById('locationStatus');if(s){s.className='location-status';s.textContent='Noch nicht geprüft.';}},0);});
  document.getElementById('presentationBtn')?.addEventListener('click',()=>{currentLocationAnalysis=null;setTimeout(()=>{renderLocationResult();const s=document.getElementById('locationStatus');if(s){s.className='location-status';s.textContent='Beispielanalyse: Standort kann separat geprüft werden.';}},0);});
}
injectLocationStyles();injectLocationSection();patchDecisionModel();bindLocationPersistence();render();
