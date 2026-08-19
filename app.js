const APP_VERSION='0.10';
const PILOT_REGIONS=['Basel-Stadt','Basel-Landschaft','Aargau','Solothurn'];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmt=n=>new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF',maximumFractionDigits:0}).format(Number(n)||0);
const num=n=>new Intl.NumberFormat('de-CH',{maximumFractionDigits:0}).format(Number(n)||0);
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const calcIds=['price','gfa','sellable','saleM2','buildM2','softPct','reservePct','acqPct','targetMargin','demolition','hazard','contamination','ground','excavation','retrofit','utilities','externalWorks','finance','marketing','otherSpecial','costBasis','location','planning','architecture','risk'];
const loaded=JSON.parse(localStorage.getItem('structaScoutItems')||'[]');
const state={items:loaded.filter(x=>!['Riehen BS · Bauland','Rümlingen BL · Bauland','Frick AG · Bauland','Oberdorf SO · Bauland'].includes(x.name))};
const save=()=>localStorage.setItem('structaScoutItems',JSON.stringify(state.items));
if(state.items.length!==loaded.length)save();
let editingId=null;
let pendingMarketContext=null;

function basisMeta(value){
  const map={rough:{label:'Grobe Vorprüfung',className:'rough'},detailed:{label:'Vertiefte Vorprüfung',className:'detailed'},verified:{label:'Belastbare Projektannahmen',className:'verified'}};
  return map[value]||map.rough;
}

function calculate(x){
  const price=+x.price||0,gfa=+x.gfa||0,sellable=+x.sellable||0,saleM2=+x.saleM2||0,buildM2=+x.buildM2||0;
  const basis=basisMeta(x.costBasis);
  if(!(gfa&&sellable&&saleM2&&buildM2))return {...x,invest:null,revenue:null,profit:null,margin:null,score:null,decision:'DATEN FEHLEN',decisionClass:'check',reason:'BGF, verkaufbare Fläche, Marktannahme und Baukosten müssen ergänzt werden.',basis};
  const build=gfa*buildM2;
  const soft=build*((+x.softPct||0)/100);
  const reserve=build*((+x.reservePct||0)/100);
  const acq=price*((+x.acqPct||0)/100);
  const specialFields=['demolition','hazard','contamination','ground','excavation','retrofit','utilities','externalWorks','finance','marketing','otherSpecial'];
  const specialTotal=specialFields.reduce((sum,key)=>sum+(+x[key]||0),0);
  const constructionGroup=build+soft+reserve;
  const acquisitionGroup=price+acq;
  const invest=acquisitionGroup+constructionGroup+specialTotal;
  const revenue=sellable*saleM2;
  const profit=revenue-invest;
  const margin=invest?profit/invest*100:0;
  const breakEven=sellable?invest/sellable:0;
  const marketBuffer=saleM2?((saleM2-breakEven)/saleM2)*100:0;
  const target=(+x.targetMargin||15)/100;
  const maxLand=Math.max(0,(revenue/(1+target)-(constructionGroup+specialTotal))/(1+((+x.acqPct||0)/100)));
  const econ=clamp((margin+5)*4);
  const market=clamp(50+marketBuffer*2);
  const score=Math.round(econ*.35+market*.25+(+x.planning||50)*.15+(+x.architecture||60)*.10+(+x.risk||50)*.15);
  let decision='VERTIEFEN',decisionClass='check',reason='Potenzial vorhanden, Annahmen und Baurecht weiter vertiefen.';
  if(margin<8||marketBuffer<0||score<50){decision='NICHT KAUFEN';decisionClass='no';reason='Aktuelle Annahmen ergeben zu wenig Marge, Marktpuffer oder Gesamtscore.';}
  else if(margin>=15&&marketBuffer>=8&&score>=70){
    if((x.costBasis||'rough')==='verified'){decision='KAUFEN';decisionClass='buy';reason='Wirtschaftlichkeit, Marktpuffer und Gesamtscore sind attraktiv und die Kostengrundlage ist als belastbar eingestuft.';}
    else{decision='VERTIEFEN';decisionClass='check';reason=`Wirtschaftlich attraktiv, aber Kostensicherheit ist erst „${basis.label}“. Vor Kauf Kosten und Baurecht weiter absichern.`;}
  }
  return {...x,build,soft,reserve,acq,specialTotal,constructionGroup,acquisitionGroup,invest,revenue,profit,margin,breakEven,marketBuffer,maxLand,score,decision,decisionClass,reason,basis};
}

function setValue(id,value){const el=$(id);if(el)el.value=value??'';}
function resetAnalysisForm(){
  $('form').reset();editingId=null;pendingMarketContext=null;
  const notice=$('marketImportNotice');if(notice){notice.hidden=true;notice.innerHTML='';}
}
function formData(){
  return {name:$('name').value.trim(),region:$('region').value,strategy:$('strategy').value,area:+$('area').value||0,price:+$('price').value||0,gfa:+$('gfa').value||0,sellable:+$('sellable').value||0,saleM2:+$('saleM2').value||0,buildM2:+$('buildM2').value||0,softPct:+$('softPct').value||0,reservePct:+$('reservePct').value||0,acqPct:+$('acqPct').value||0,targetMargin:+$('targetMargin').value||15,demolition:+$('demolition').value||0,hazard:+$('hazard').value||0,contamination:+$('contamination').value||0,ground:+$('ground').value||0,excavation:+$('excavation').value||0,retrofit:+$('retrofit').value||0,utilities:+$('utilities').value||0,externalWorks:+$('externalWorks').value||0,finance:+$('finance').value||0,marketing:+$('marketing').value||0,otherSpecial:+$('otherSpecial').value||0,costBasis:$('costBasis').value,costSource:$('costSource').value.trim(),location:+$('location').value||50,planning:+$('planning').value||50,architecture:+$('architecture').value||50,risk:+$('risk').value||50,status:'analysed',updated:new Date().toISOString(),...(pendingMarketContext||{})};
}

function specialBreakdown(x){
  const rows=[['Abbruch',x.demolition],['Schadstoffe / Asbest',x.hazard],['Altlasten',x.contamination],['Baugrund / Pfählung',x.ground],['Baugrube / Grundwasser',x.excavation],['Ertüchtigungen Bestand',x.retrofit],['Erschliessung / Werkleitungen',x.utilities],['Aussenanlagen / Stützungen',x.externalWorks],['Finanzierung',x.finance],['Vermarktung / Verkauf',x.marketing],['Weitere Sonderkosten',x.otherSpecial]].filter(([,v])=>(+v||0)>0);
  if(!rows.length)return '<div class="special-empty">Noch keine objektspezifischen Sonderkosten angesetzt. 0 CHF bedeutet: noch nicht berücksichtigt.</div>';
  return `<div class="special-list">${rows.map(([n,v])=>`<div><span>${esc(n)}</span><strong>${fmt(v)}</strong></div>`).join('')}</div>`;
}

function updatePreview(){
  if(!$('previewCalc'))return;
  const raw=formData(),x=calculate(raw);
  if(x.invest==null){$('previewCalc').innerHTML='<div class="calc-missing"><strong>Für die Berechnung fehlen noch Projektdaten.</strong><p>Bitte BGF, verkaufbare Fläche, Marktannahme Verkauf CHF/m² und Baukosten CHF/m² ergänzen. Gefundene Inserate liefern diese Werte meist nicht zuverlässig.</p></div>';return;}
  $('previewCalc').innerHTML=`<div class="cost-basis-row"><span class="basis-badge ${x.basis.className}">${esc(x.basis.label)}</span><span class="basis-source">${esc(raw.costSource||'Kostengrundlage noch nicht dokumentiert')}</span></div><div class="cost-groups"><div><span>Grundstück & Erwerb</span><strong>${fmt(x.acquisitionGroup)}</strong><small>Kaufpreis + Kaufnebenkosten</small></div><div><span>Bau & Planung</span><strong>${fmt(x.constructionGroup)}</strong><small>Baukosten + Planung + Reserve</small></div><div><span>Sonder-/Risikokosten</span><strong>${fmt(x.specialTotal)}</strong><small>Objektspezifische Zusatzkosten</small></div><div class="total"><span>Gesamtinvestition</span><strong>${fmt(x.invest)}</strong><small>inkl. aller angesetzten Kosten</small></div></div>${specialBreakdown(x)}<div class="preview-grid"><div><span>Verkaufserlös</span><strong>${fmt(x.revenue)}</strong></div><div><span>Gewinn</span><strong>${fmt(x.profit)}</strong></div><div><span>Projektmarge</span><strong>${x.margin.toFixed(1)} %</strong></div><div><span>Investment Score</span><strong>${x.score}/100</strong></div><div><span>Break-even Verkauf</span><strong>${fmt(x.breakEven)}/m²</strong></div><div><span>Marktpuffer</span><strong>${x.marketBuffer.toFixed(1)} %</strong></div><div><span>Max. Grundstückspreis</span><strong>${fmt(x.maxLand)}</strong></div><div><span>Sonderkostenanteil</span><strong>${x.invest?((x.specialTotal/x.invest)*100).toFixed(1):'0.0'} %</strong></div></div><div class="recommendation ${x.decisionClass}">${x.decision} · ${esc(x.reason)}</div>`;
}

function render(){
  let items=state.items.map(calculate).filter(x=>PILOT_REGIONS.includes(x.region));
  const region=$('regionFilter').value,budget=+$('budgetFilter').value*1e6,strat=$('strategyFilter').value,min=+$('marginFilter').value;
  items=items.filter(x=>(region==='all'||x.region===region)&&(strat==='all'||x.strategy===strat)&&(+x.price||0)<=budget&&(x.margin==null?min===0:x.margin>=min));
  const sort=$('sortFilter').value;items.sort((a,b)=>sort==='price'?(a.price-b.price):((b[sort]??-Infinity)-(a[sort]??-Infinity)));
  $('countKpi').textContent=items.length;
  const analysed=items.filter(x=>x.margin!=null);
  $('marginKpi').textContent=analysed.length?(analysed.reduce((s,x)=>s+x.margin,0)/analysed.length).toFixed(1)+' %':'offen';
  $('profitKpi').textContent=analysed.length?fmt(analysed.reduce((s,x)=>s+x.profit,0)/analysed.length):'offen';
  const best=analysed.length?Math.max(...analysed.map(x=>x.score||0)):null;$('scoreKpi').textContent=best??'–';$('topScore').textContent=best??'–';
  $('list').innerHTML=items.length?items.map(x=>{
    if(x.invest==null)return `<article class="card deal-card"><div><div class="deal-top"><span class="decision-chip check">DATEN FEHLEN</span><h4>${esc(x.name)}</h4></div><div class="meta"><span>${esc(x.region)}</span><span>${esc(x.strategy)}</span><span>${num(x.area)} m² Grundstück</span></div><div class="deal-foot"><small>${esc(x.reason)}</small><button class="text-btn edit-deal" data-id="${x.id||''}">Details</button></div></div><div class="score pending"><strong>?</strong><small>SCORE</small></div></article>`;
    return `<article class="card deal-card"><div><div class="deal-top"><span class="decision-chip ${x.decisionClass}">${x.decision}</span><span class="basis-mini ${x.basis.className}">${esc(x.basis.label)}</span><h4>${esc(x.name)}</h4></div><div class="meta"><span>${esc(x.region)}</span><span>${esc(x.strategy)}</span><span>${num(x.area)} m² Grundstück</span>${x.gfa?`<span>${num(x.gfa)} m² BGF</span>`:''}${x.source?`<span>Quelle: ${esc(x.source)}</span>`:''}</div><div class="metrics"><span class="metric">Kaufpreis<strong>${fmt(x.price)}</strong></span><span class="metric">Gesamtinvestition<strong>${fmt(x.invest)}</strong></span><span class="metric">Sonderkosten<strong>${fmt(x.specialTotal)}</strong></span><span class="metric">Gewinn<strong>${fmt(x.profit)}</strong></span><span class="metric">Marge<strong>${x.margin.toFixed(1)} %</strong></span></div><div class="deal-details"><div><span>Marktannahme</span><strong>${fmt(x.saleM2)}/m²</strong></div><div><span>Break-even</span><strong>${fmt(x.breakEven)}/m²</strong></div><div><span>Marktpuffer</span><strong>${x.marketBuffer.toFixed(1)} %</strong></div><div><span>Max. Landpreis</span><strong>${fmt(x.maxLand)}</strong></div></div><div class="deal-foot"><small>${esc(x.reason)}</small><div class="deal-actions">${x.sourceUrl?`<a href="${x.sourceUrl}" target="_blank" rel="noopener noreferrer">Quelle ↗</a>`:''}<button class="text-btn edit-deal" data-id="${x.id||''}">Details</button></div></div></div><div class="score"><strong>${x.score??'?'}</strong><small>SCORE</small></div></article>`;
  }).join(''):'<div class="empty"><strong>Noch keine Opportunity bewertet</strong><p>Suche ein Grundstück und tippe auf „Jetzt prüfen“ oder nutze „+ Opportunity prüfen“.</p></div>';
}

function buildFallbacks(){
  const region=$('regionFilter').value==='all'?'Basel-Stadt Basel-Landschaft Aargau Solothurn':$('regionFilter').value;
  const q=encodeURIComponent(`${$('searchKeywords').value} ${region} Schweiz`),g=s=>'https://www.google.com/search?q='+encodeURIComponent(s),base=`${$('searchKeywords').value} ${region} Schweiz`;
  const sources=[['Gesamtes Web','◎',g(base)],['Facebook Marketplace','f','https://www.facebook.com/marketplace/switzerland/search/?query='+q],['Tutti','T',g(`site:tutti.ch ${base}`)],['Comparis','C',g(`site:comparis.ch/immobilien ${base}`)],['ImmoScout24','I',g(`site:immoscout24.ch ${base}`)],['Homegate','H',g(`site:homegate.ch ${base}`)],['Newhome','N',g(`site:newhome.ch ${base}`)],['Makler & Projektentwickler','M',g(`${base} Immobilienmakler Projektentwicklung Baulandreserve Abbruchobjekt`)]];
  $('sourceGrid').innerHTML=sources.map(([n,i,u],idx)=>`<article class="source-card"><div class="source-head"><span class="source-icon">${i}</span><div><strong>${n}</strong><small>Suchbereich ${idx+1}</small></div></div><p>Kostenlose Vertiefungssuche in der Originalquelle.</p><a class="source-link" target="_blank" rel="noopener noreferrer" href="${u}">Suchbereich öffnen ↗</a></article>`).join('');
}
function fallbackSearch(){buildFallbacks();$('searchStatus').hidden=false;$('searchStatus').innerHTML='<strong>Direkte kostenlose Suchbereiche sind bereit.</strong> Der verifizierte Marktstand wird geladen, sobald das Update-Modul verfügbar ist.';}

function marketRiskHints(item){
  const text=`${item.title||''} ${item.note||''} ${item.zone||''}`.toLowerCase(),hints=[];
  if(/altliegenschaft|bestandeshaus|bestandesliegenschaft|bestand/.test(text))hints.push('Abbruch bzw. Ertüchtigung des Bestands prüfen');
  if(/altliegenschaft|bestandeshaus|bestandesliegenschaft/.test(text))hints.push('Schadstoff-/Asbestrisiko prüfen');
  if(/hanglage|hang/.test(text))hints.push('Baugrube, Stützung und Geologie prüfen');
  if(/nicht baureif|entwicklungsgebiet/.test(text))hints.push('Baureife, Planung und Erschliessung vertiefen');
  if(/aare|grundwasser|ufer/.test(text))hints.push('Grundwasser/Hochwasser und Baugrube prüfen');
  return hints;
}

function openMarketOpportunity(item){
  resetAnalysisForm();
  pendingMarketContext={source:item.source||'Web',sourceUrl:item.url||'',zone:item.zone||'',marketNote:item.note||'',marketAddress:item.address||''};
  setValue('name',`${item.title||'Web-Fund'} · ${item.address||''}`.replace(/\s·\s$/,''));setValue('region',item.region||'Basel-Landschaft');setValue('strategy','Offen / Vorprüfung');setValue('area',item.area||'');setValue('price',item.price||0);setValue('gfa','');setValue('sellable','');setValue('costBasis','rough');setValue('costSource',`Inserat: ${item.source||'Web'}; BGF/Verkaufsfläche/Baukosten/Marktwert noch zu verifizieren.`);
  const hints=marketRiskHints(item),notice=$('marketImportNotice');
  if(notice){notice.hidden=false;notice.innerHTML=`<strong>Aus dem Fund übernommen:</strong> Adresse, Region, Grundstücksfläche, Kaufpreis${item.zone?', Zone':''} und Quelle.<br><strong>Noch zu prüfen:</strong> BGF, verkaufbare Fläche, Marktwert, Baukosten und Sonderkosten.${hints.length?`<br><strong>Objekthinweise:</strong> ${hints.map(esc).join(' · ')}`:''}`;}
  $('dialog').showModal();updatePreview();
}
window.openMarketOpportunity=openMarketOpportunity;

function populateExisting(item){
  resetAnalysisForm();editingId=item.id;pendingMarketContext={source:item.source||'',sourceUrl:item.sourceUrl||'',zone:item.zone||'',marketNote:item.marketNote||'',marketAddress:item.marketAddress||''};
  const ids=['name','region','strategy','area','price','gfa','sellable','saleM2','buildM2','softPct','reservePct','acqPct','targetMargin','demolition','hazard','contamination','ground','excavation','retrofit','utilities','externalWorks','finance','marketing','otherSpecial','costBasis','costSource','location','planning','architecture','risk'];ids.forEach(id=>setValue(id,item[id]??''));
  const notice=$('marketImportNotice');if(notice&&item.source){notice.hidden=false;notice.innerHTML=`<strong>Gespeicherte Web-Opportunity.</strong> Quelle: ${esc(item.source)}${item.zone?` · Zone: ${esc(item.zone)}`:''}.`;}
  $('dialog').showModal();updatePreview();
}

function openExample(){
  resetAnalysisForm();
  const ex={name:'Präsentationsbeispiel · Pratteln BL',region:'Basel-Landschaft',strategy:'Mehrfamilienhaus',area:1250,price:2100000,gfa:1900,sellable:1520,saleM2:8350,buildM2:3500,softPct:18,reservePct:7,acqPct:3,targetMargin:15,demolition:0,hazard:0,contamination:0,ground:60000,excavation:90000,retrofit:0,utilities:65000,externalWorks:120000,finance:180000,marketing:95000,otherSpecial:0,costBasis:'verified',costSource:'Präsentationsbeispiel – angenommene, für die Demo als belastbar markierte Projektwerte.',location:82,planning:82,architecture:85,risk:75};Object.entries(ex).forEach(([k,v])=>setValue(k,v));$('dialog').showModal();updatePreview();
}

$('startSearchBtn').addEventListener('click',fallbackSearch);
$('searchKeywords').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();fallbackSearch();}});
$('addBtn').addEventListener('click',()=>{resetAnalysisForm();$('dialog').showModal();updatePreview();});
$('presentationBtn').addEventListener('click',openExample);
$('closeBtn').addEventListener('click',()=>$('dialog').close());$('cancelBtn').addEventListener('click',()=>$('dialog').close());
$('resetBtn').addEventListener('click',()=>{$('regionFilter').value='all';$('budgetFilter').value='999';$('strategyFilter').value='all';$('marginFilter').value='0';$('liveResults').innerHTML='';$('sourceGrid').innerHTML='';$('searchStatus').hidden=true;render();});
['regionFilter','budgetFilter','strategyFilter','marginFilter','sortFilter'].forEach(id=>$(id).addEventListener('change',render));
calcIds.forEach(id=>{const el=$(id);if(el){el.addEventListener('input',updatePreview);el.addEventListener('change',updatePreview);}});
$('list').addEventListener('click',e=>{const btn=e.target.closest('.edit-deal');if(!btn)return;const item=state.items.find(x=>x.id===btn.dataset.id);if(item)populateExisting(item);});
$('form').addEventListener('submit',e=>{e.preventDefault();const x=formData();if(!x.name){alert('Bitte eine Bezeichnung oder Adresse eingeben.');return;}if(!PILOT_REGIONS.includes(x.region)){alert('Region ist nicht im Pilotgebiet.');return;}if(!x.gfa||!x.sellable||!x.saleM2||!x.buildM2){alert('Bitte BGF, verkaufbare Fläche, Marktannahme und Baukosten ergänzen.');return;}if(editingId){const idx=state.items.findIndex(i=>i.id===editingId);if(idx>=0)state.items[idx]={...state.items[idx],...x,id:editingId};}else{x.id=Date.now().toString(36);state.items.unshift(x);}save();$('dialog').close();editingId=null;pendingMarketContext=null;render();});
$('appVersion').textContent='Beta '+APP_VERSION;
render();