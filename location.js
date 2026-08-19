const LOCATION_VERSION='0.12';
const RENT_BENCHMARKS={
  'Basel-Stadt':{annual:357,source:'RealAdvisor',date:'August 2026'},
  'Basel-Landschaft':{annual:320,source:'RealAdvisor',date:'August 2026'},
  'Aargau':{annual:294,source:'RealAdvisor',date:'August 2026'},
  'Solothurn':{annual:248,source:'RealAdvisor',date:'August 2026'}
};
let currentLocationAnalysis=null;
let lastGeocodeAt=0;

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
    .location-score-row{display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center;margin-top:12px}
    .location-score-box{background:#173d63;color:#fff;border-radius:14px;padding:14px;text-align:center}.location-score-box strong{display:block;font-size:32px}.location-score-box span{font-size:10px;color:#dbe8f5}
    .location-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.location-metric{background:#fff;border:1px solid #e5eaf2;border-radius:10px;padding:9px}.location-metric span{display:block;font-size:10px;color:#758196}.location-metric strong{display:block;margin-top:3px;font-size:12px;color:#25364f}
    .location-source{margin-top:10px;color:#7a8594;font-size:10px;line-height:1.45}
    .loc-chip{display:inline-flex;align-items:center;border-radius:999px;background:#eaf0ff;color:#2647a3;padding:4px 7px;font-size:10px;font-weight:900;margin-right:6px}
    .loc-chip.weak{background:#fdecec;color:#9d2c2c}.loc-chip.mid{background:#fff6df;color:#8a5b00}.loc-chip.good{background:#e9f8ef;color:#17683c}
    .location-card-badge{display:inline-flex;margin-left:6px;border-radius:999px;padding:4px 7px;background:#eaf0ff;color:#2647a3;font-size:10px;font-weight:900}
    @media(max-width:700px){.location-title{flex-direction:column}.location-title .btn{width:100%}.location-grid{grid-template-columns:1fr}.location-score-row{grid-template-columns:1fr}.location-metrics{grid-template-columns:1fr 1fr}}
    @media(max-width:460px){.location-metrics{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function injectLocationSection(){
  if(document.getElementById('locationSection'))return;
  const preview=document.getElementById('previewCalc');
  if(!preview)return;
  const section=document.createElement('div');
  section.id='locationSection';
  section.className='location-section';
  section.innerHTML=`
    <div class="location-title">
      <div><h4>5 · Standort & Nachfrage</h4><p>Der Scout prüft die Lage passend zur Nutzung. Wohnen gewichtet Schule, Einkauf, ÖV, Gesundheit, Freizeit und Mietniveau. Gewerbe gewichtet Strassen-/Autobahnanbindung, ÖV, Bahnhof, Parkierung und Gewerbeumfeld.</p></div>
      <button type="button" class="btn secondary" id="locationCheckBtn">Standort prüfen</button>
    </div>
    <div class="location-grid">
      <label><span>Adresse für Standortprüfung</span><input id="siteAddress" autocomplete="street-address" placeholder="z. B. Hauptstrasse 18, 4133 Pratteln"></label>
      <label><span>Nutzungsprofil</span><select id="locationUseType"><option value="auto">Automatisch aus Projektart</option><option value="residential">Wohnen</option><option value="commercial">Gewerbe</option><option value="mixed">Mischnutzung</option></select></label>
    </div>
    <div id="locationStatus" class="location-status">Noch nicht geprüft. Bei einem Web-Fund startet die Standortprüfung automatisch.</div>
    <div id="locationResult"></div>
    <div class="location-source">Geodaten: © OpenStreetMap-Mitwirkende, abgefragt über Nominatim/Overpass. Mietbenchmark Wohnen: RealAdvisor, August 2026, kantonaler Durchschnitt der Jahresmiete pro m². Für die Ankaufentscheidung später gemeinde- und objektspezifisch verifizieren.</div>
  `;
  preview.parentNode.insertBefore(section,preview);
  document.getElementById('locationCheckBtn')?.addEventListener('click',()=>analyzeLocation(false));
  document.getElementById('siteAddress')?.addEventListener('input',()=>markLocationStale());
  document.getElementById('locationUseType')?.addEventListener('change',()=>{if(currentLocationAnalysis){recomputeUseScore();}else markLocationStale();});
  document.getElementById('strategy')?.addEventListener('change',()=>{if(currentLocationAnalysis&&document.getElementById('locationUseType')?.value==='auto')recomputeUseScore();});
}

function effectiveUseType(){
  const selected=document.getElementById('locationUseType')?.value||'auto';
  if(selected!=='auto')return selected;
  const strategy=document.getElementById('strategy')?.value||'';
  if(strategy==='Gewerbe')return 'commercial';
  if(strategy==='Mischnutzung')return 'mixed';
  return 'residential';
}
function markLocationStale(){
  if(!currentLocationAnalysis)return;
  const status=document.getElementById('locationStatus');
  if(status)status.innerHTML='<strong>Standortdaten geändert.</strong> Bitte Standort erneut prüfen.';
}
function cacheGet(key,maxAgeMs){
  try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(raw&&Date.now()-raw.savedAt<maxAgeMs)return raw.data;}catch{}
  return null;
}
function cacheSet(key,data){try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));}catch{}}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function geocodeAddress(address){
  const key='structaGeo:'+address.trim().toLowerCase();
  const cached=cacheGet(key,30*24*60*60*1000);if(cached)return cached;
  const wait=Math.max(0,1100-(Date.now()-lastGeocodeAt));if(wait)await sleep(wait);lastGeocodeAt=Date.now();
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ch&q='+encodeURIComponent(address);
  const r=await fetch(url,{headers:{'Accept':'application/json'},referrerPolicy:'strict-origin-when-cross-origin'});
  if(!r.ok)throw new Error('Geocoding '+r.status);
  const data=await r.json();if(!data?.length)throw new Error('Adresse nicht gefunden');
  const result={lat:Number(data[0].lat),lon:Number(data[0].lon),displayName:data[0].display_name};cacheSet(key,result);return result;
}
function overpassQuery(lat,lon){return `[out:json][timeout:20];
(
 nwr(around:3500,${lat},${lon})["amenity"~"^(school|kindergarten)$"];
 nwr(around:2500,${lat},${lon})["shop"~"^(supermarket|convenience|mall|department_store)$"];
 nwr(around:3500,${lat},${lon})["amenity"~"^(doctors|pharmacy|clinic|hospital)$"];
 nwr(around:3000,${lat},${lon})["leisure"~"^(park|playground|sports_centre|fitness_centre)$"];
 nwr(around:3000,${lat},${lon})["highway"="bus_stop"];
 nwr(around:3000,${lat},${lon})["public_transport"~"^(platform|station|stop_position)$"];
 nwr(around:6000,${lat},${lon})["railway"="station"];
 node(around:8000,${lat},${lon})["highway"="motorway_junction"];
 way(around:3000,${lat},${lon})["highway"~"^(motorway|trunk|primary|secondary)$"];
 nwr(around:2500,${lat},${lon})["amenity"="parking"];
 nwr(around:3500,${lat},${lon})["landuse"~"^(commercial|industrial|retail)$"];
);
out center tags;`;}
async function fetchNearby(lat,lon){
  const key='structaNearby:'+lat.toFixed(4)+','+lon.toFixed(4);const cached=cacheGet(key,7*24*60*60*1000);if(cached)return cached;
  const body='data='+encodeURIComponent(overpassQuery(lat,lon));
  const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
  if(!r.ok)throw new Error('Geodaten '+r.status);const data=await r.json();cacheSet(key,data);return data;
}
function pointOf(el){const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;return Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))?{lat:Number(lat),lon:Number(lon)}:null;}
function haversine(a,b){const R=6371000,toRad=x=>x*Math.PI/180;const dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon);const s=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(s));}
function minDistance(elements,origin,filter){let min=Infinity;for(const el of elements){if(!filter(el))continue;const p=pointOf(el);if(!p)continue;min=Math.min(min,haversine(origin,p));}return Number.isFinite(min)?Math.round(min):null;}
function countElements(elements,filter){return elements.filter(filter).length;}
function distanceScore(d,steps){if(d==null)return 10;for(const [limit,score] of steps)if(d<=limit)return score;return 15;}
function rentScore(annual){if(!annual)return 50;const min=248,max=357;return Math.round(clamp(50+((annual-min)/(max-min))*50,45,100));}
function fmtDistance(d){if(d==null)return 'kein Treffer';return d<1000?`${d} m`:`${(d/1000).toFixed(1)} km`;}
function deriveMetrics(elements,origin){
  const amenity=(...vals)=>el=>vals.includes(el.tags?.amenity),shop=(...vals)=>el=>vals.includes(el.tags?.shop),leisure=(...vals)=>el=>vals.includes(el.tags?.leisure);
  const school=minDistance(elements,origin,el=>['school','kindergarten'].includes(el.tags?.amenity));
  const shopping=minDistance(elements,origin,shop('supermarket','convenience','mall','department_store'));
  const health=minDistance(elements,origin,amenity('doctors','pharmacy','clinic','hospital'));
  const leisureD=minDistance(elements,origin,leisure('park','playground','sports_centre','fitness_centre'));
  const transit=minDistance(elements,origin,el=>el.tags?.highway==='bus_stop'||['platform','station','stop_position'].includes(el.tags?.public_transport)||el.tags?.railway==='station');
  const station=minDistance(elements,origin,el=>el.tags?.railway==='station');
  const motorway=minDistance(elements,origin,el=>el.tags?.highway==='motorway_junction');
  const majorRoad=minDistance(elements,origin,el=>['motorway','trunk','primary','secondary'].includes(el.tags?.highway));
  const parking=minDistance(elements,origin,amenity('parking'));
  const businessCount=countElements(elements,el=>['commercial','industrial','retail'].includes(el.tags?.landuse));
  return {school,shopping,health,leisure:leisureD,transit,station,motorway,majorRoad,parking,businessCount};
}
function residentialScore(metrics,annualRent){
  const school=distanceScore(metrics.school,[[500,100],[900,88],[1500,70],[2500,45],[3500,25]]),shopping=distanceScore(metrics.shopping,[[400,100],[800,90],[1500,68],[2200,45]]),transit=distanceScore(metrics.transit,[[300,100],[500,92],[800,78],[1500,55],[2500,30]]),health=distanceScore(metrics.health,[[700,100],[1200,85],[2200,60],[3200,35]]),leisure=distanceScore(metrics.leisure,[[500,100],[1000,85],[1800,65],[2800,40]]),rent=rentScore(annualRent);
  return Math.round(school*.20+shopping*.18+transit*.22+health*.10+leisure*.10+rent*.20);
}
function commercialScore(metrics){
  const motorway=distanceScore(metrics.motorway,[[1200,100],[2500,90],[4500,75],[6500,55],[8000,35]]),road=distanceScore(metrics.majorRoad,[[250,100],[600,90],[1200,75],[2200,55],[3000,35]]),transit=distanceScore(metrics.transit,[[300,100],[700,88],[1400,68],[2500,45]]),station=distanceScore(metrics.station,[[800,100],[1800,88],[3500,68],[5500,45]]),parking=distanceScore(metrics.parking,[[300,100],[700,85],[1400,65],[2300,40]]),env=metrics.businessCount>=5?100:metrics.businessCount>=3?85:metrics.businessCount>=1?65:35;
  return Math.round(motorway*.25+road*.20+transit*.15+station*.15+parking*.10+env*.15);
}
function chooseLocationScore(useType,res,commercial){if(useType==='commercial')return commercial;if(useType==='mixed')return Math.round((res+commercial)/2);return res;}
function recomputeUseScore(){if(!currentLocationAnalysis)return;const useType=effectiveUseType();currentLocationAnalysis={...currentLocationAnalysis,useType,score:chooseLocationScore(useType,currentLocationAnalysis.residentialScore,currentLocationAnalysis.commercialScore)};persistLocationIntoContext();renderLocationResult();updatePreview();render();}
function persistLocationIntoContext(){if(!currentLocationAnalysis)return;pendingMarketContext={...(pendingMarketContext||{}),siteAddress:document.getElementById('siteAddress')?.value||currentLocationAnalysis.address,locationAnalysis:currentLocationAnalysis};}
async function analyzeLocation(autoTriggered=false){
  const address=(document.getElementById('siteAddress')?.value||pendingMarketContext?.marketAddress||'').trim(),status=document.getElementById('locationStatus');
  if(!address){if(status)status.innerHTML='<strong>Adresse fehlt.</strong> Bitte eine vollständige Adresse eingeben.';return;}
  const btn=document.getElementById('locationCheckBtn');if(btn)btn.disabled=true;if(status)status.innerHTML='<strong>Standort wird geprüft …</strong> Adresse, Umfeld und Erreichbarkeit werden aus kostenlosen öffentlichen Geodaten ausgewertet.';
  try{
    const geo=await geocodeAddress(address),osm=await fetchNearby(geo.lat,geo.lon),metrics=deriveMetrics(osm.elements||[],{lat:geo.lat,lon:geo.lon}),region=document.getElementById('region')?.value||'',rent=RENT_BENCHMARKS[region]||null,res=residentialScore(metrics,rent?.annual||0),com=commercialScore(metrics),useType=effectiveUseType();
    currentLocationAnalysis={address,displayName:geo.displayName,lat:geo.lat,lon:geo.lon,useType,residentialScore:res,commercialScore:com,score:chooseLocationScore(useType,res,com),rentAnnualM2:rent?.annual||null,rentMonthlyM2:rent?.annual?Math.round((rent.annual/12)*10)/10:null,rentSource:rent?.source||'',rentDate:rent?.date||'',metrics,checkedAt:new Date().toISOString(),geoSource:'OpenStreetMap'};
    persistLocationIntoContext();if(status)status.innerHTML=`<strong>Standortprüfung abgeschlossen.</strong> ${autoTriggered?'Automatisch aus dem gefundenen Objekt gestartet.':''}`;renderLocationResult();updatePreview();render();
  }catch(err){console.warn('Standortprüfung fehlgeschlagen',err);if(status)status.innerHTML='<strong>Standortprüfung aktuell nicht verfügbar.</strong> Die Wirtschaftlichkeitsprüfung bleibt nutzbar. Standortdaten später erneut prüfen.';}
  finally{if(btn)btn.disabled=false;}
}
function scoreClass(score){return score>=75?'good':score>=55?'mid':'weak';}
function renderLocationResult(){
  const target=document.getElementById('locationResult'),x=currentLocationAnalysis;if(!target)return;if(!x){target.innerHTML='';return;}const m=x.metrics||{},useLabel=x.useType==='commercial'?'Gewerbe':x.useType==='mixed'?'Mischnutzung':'Wohnen',rentHtml=x.rentAnnualM2?`<div class="location-metric"><span>Mietbenchmark Wohnen</span><strong>CHF ${x.rentMonthlyM2.toFixed(1)}/m² Monat</strong></div>`:'';
  const residential=`<div class="location-metric"><span>Schule / Kindergarten</span><strong>${fmtDistance(m.school)}</strong></div><div class="location-metric"><span>Einkauf</span><strong>${fmtDistance(m.shopping)}</strong></div><div class="location-metric"><span>ÖV</span><strong>${fmtDistance(m.transit)}</strong></div><div class="location-metric"><span>Arzt / Apotheke</span><strong>${fmtDistance(m.health)}</strong></div><div class="location-metric"><span>Freizeit / Park</span><strong>${fmtDistance(m.leisure)}</strong></div>${rentHtml}`;
  const commercial=`<div class="location-metric"><span>Autobahnanschluss</span><strong>${fmtDistance(m.motorway)}</strong></div><div class="location-metric"><span>Hauptverkehrsachse</span><strong>${fmtDistance(m.majorRoad)}</strong></div><div class="location-metric"><span>ÖV</span><strong>${fmtDistance(m.transit)}</strong></div><div class="location-metric"><span>Bahnhof</span><strong>${fmtDistance(m.station)}</strong></div><div class="location-metric"><span>Parkierung</span><strong>${fmtDistance(m.parking)}</strong></div><div class="location-metric"><span>Gewerbeumfeld</span><strong>${m.businessCount||0} OSM-Flächen im Umfeld</strong></div>`;
  target.innerHTML=`<div class="location-score-row"><div class="location-score-box"><strong>${x.score}</strong><span>STANDORT SCORE · ${useLabel.toUpperCase()}</span></div><div><span class="loc-chip ${scoreClass(x.residentialScore)}">Wohnen ${x.residentialScore}/100</span><span class="loc-chip ${scoreClass(x.commercialScore)}">Gewerbe ${x.commercialScore}/100</span><div class="location-metrics">${x.useType==='commercial'?commercial:x.useType==='mixed'?residential+commercial:residential}</div></div></div>`;
}

const baseCalculate=calculate;
calculate=function(x){
  const base=baseCalculate(x);if(base.invest==null)return base;const loc=x.locationAnalysis;if(!loc?.score)return {...base,locationScore:null};
  const econ=clamp((base.margin+5)*4),market=clamp(50+base.marketBuffer*2),locationScore=clamp(Number(loc.score)||50),score=Math.round(econ*.30+market*.15+locationScore*.25+(+x.planning||50)*.10+(+x.architecture||60)*.10+(+x.risk||50)*.10);
  let decision=base.decision,decisionClass=base.decisionClass,reason=base.reason;
  if(locationScore<40){decision='NICHT KAUFEN';decisionClass='no';reason='Standort- und Nachfrageprüfung ist für die vorgesehene Nutzung aktuell zu schwach.';}
  else if(decision==='KAUFEN'&&locationScore<65){decision='VERTIEFEN';decisionClass='check';reason='Wirtschaftlichkeit ist attraktiv, aber der Standort-Score muss vor einem Kaufentscheid vertieft werden.';}
  else if(decision==='VERTIEFEN'&&locationScore>=75&&base.margin>=15&&base.marketBuffer>=8){reason='Wirtschaftlichkeit und Standort sind attraktiv; Kostengrundlage und Baurecht als nächstes vertiefen.';}
  return {...base,score,decision,decisionClass,reason,locationScore};
};
const baseUpdatePreview=updatePreview;updatePreview=function(){baseUpdatePreview();renderLocationResult();};
const baseRender=render;render=function(){baseRender();document.querySelectorAll('.deal-card').forEach(card=>{const id=card.querySelector('.edit-deal')?.dataset.id;if(!id)return;const item=state.items.find(x=>x.id===id);if(!item?.locationAnalysis)return;const top=card.querySelector('.deal-top');if(!top||top.querySelector('.location-card-badge'))return;const badge=document.createElement('span');badge.className='location-card-badge';badge.textContent='Standort '+item.locationAnalysis.score+'/100';top.insertBefore(badge,top.querySelector('h4'));});};
const basePopulateExisting=populateExisting;populateExisting=function(item){basePopulateExisting(item);currentLocationAnalysis=item.locationAnalysis||null;const addr=item.siteAddress||item.marketAddress||'';if(document.getElementById('siteAddress'))document.getElementById('siteAddress').value=addr;if(document.getElementById('locationUseType'))document.getElementById('locationUseType').value=item.locationAnalysis?.useType||'auto';renderLocationResult();const status=document.getElementById('locationStatus');if(status&&currentLocationAnalysis)status.innerHTML='<strong>Gespeicherte Standortprüfung geladen.</strong>';};
const originalMarketOpportunity=window.openMarketOpportunity;window.openMarketOpportunity=function(item){currentLocationAnalysis=null;originalMarketOpportunity(item);setTimeout(()=>{const address=item.address||'';if(document.getElementById('siteAddress'))document.getElementById('siteAddress').value=address;if(document.getElementById('locationUseType'))document.getElementById('locationUseType').value='auto';if(address)analyzeLocation(true);},0);};
function patchDecisionModel(){const weights=document.querySelector('.model .weights');if(weights)weights.innerHTML=`<div><p><strong>Wirtschaftlichkeit</strong><small>Marge und Projektökonomie</small></p><b>30 %</b></div><div><p><strong>Markt</strong><small>Puffer zum Break-even</small></p><b>15 %</b></div><div><p><strong>Standort & Nachfrage</strong><small>nutzungsabhängiger Lagealgorithmus</small></p><b>25 %</b></div><div><p><strong>Baurecht</strong><small>Entwicklungspotenzial</small></p><b>10 %</b></div><div><p><strong>Architektur</strong><small>Qualitätspotenzial</small></p><b>10 %</b></div><div><p><strong>Risiko</strong><small>Planungs-/Projektrisiko</small></p><b>10 %</b></div>`;const road=document.querySelector('.model .roadmap');if(road)road.innerHTML='<strong>Nutzung entscheidet</strong><p>Wohnen bewertet Nahversorgung, Schulen, ÖV und Mietniveau. Gewerbe bewertet Erreichbarkeit, Hauptachsen, Bahnhof, Parkierung und Gewerbeumfeld. Schwache Standortwerte können einen rechnerisch guten Deal zurückstufen.</p>';}
function bindLocationPersistence(){
  const form=document.getElementById('form');if(form)form.addEventListener('submit',()=>{if(currentLocationAnalysis)persistLocationIntoContext();},true);
  document.getElementById('addBtn')?.addEventListener('click',()=>{currentLocationAnalysis=null;setTimeout(()=>{if(document.getElementById('siteAddress'))document.getElementById('siteAddress').value='';renderLocationResult();const s=document.getElementById('locationStatus');if(s)s.textContent='Noch nicht geprüft. Adresse eingeben und Standort prüfen.';},0);});
  document.getElementById('presentationBtn')?.addEventListener('click',()=>{currentLocationAnalysis=null;setTimeout(()=>{renderLocationResult();const s=document.getElementById('locationStatus');if(s)s.textContent='Beispielanalyse: Standort kann separat geprüft werden.';},0);});
}

injectLocationStyles();injectLocationSection();patchDecisionModel();bindLocationPersistence();render();
