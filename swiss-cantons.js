const SWISS_CANTONS_VERSION='0.20.1';
(function(){
  const CANTONS=['Aargau','Appenzell Ausserrhoden','Appenzell Innerrhoden','Basel-Landschaft','Basel-Stadt','Bern','Freiburg','Genf','Glarus','Graubünden','Jura','Luzern','Neuenburg','Nidwalden','Obwalden','Schaffhausen','Schwyz','Solothurn','St. Gallen','Tessin','Thurgau','Uri','Waadt','Wallis','Zug','Zürich'];
  const VERIFIED_MARKET_REGIONS=new Set(['Aargau','Basel-Landschaft','Basel-Stadt','Solothurn']);
  window.STRUCTA_CANTONS=CANTONS;

  function fillSelect(id,allOption=false){
    const select=document.getElementById(id);if(!select)return;
    const current=select.value;
    select.innerHTML=(allOption?'<option value="all">Alle Kantone</option>':'')+CANTONS.map(c=>`<option value="${c}">${c}</option>`).join('');
    if(current&&([...select.options].some(o=>o.value===current)))select.value=current;
    else if(allOption)select.value='all';
    else select.value='Basel-Landschaft';
  }

  function patchLabels(){
    const badge=document.querySelector('.hero .badge');if(badge)badge.textContent='STRUCTA INVESTMENT RADAR · GANZE SCHWEIZ';
    const version=document.getElementById('versionBadge');if(version)version.textContent='Beta 0.20.1 · Ganze Schweiz';
    const side=document.getElementById('appVersion');if(side)side.textContent='Beta 0.20.1';
  }

  function installCantons(){fillSelect('regionFilter',true);fillSelect('region',false);patchLabels();}

  if(typeof buildFallbacks==='function'){
    buildFallbacks=function(){
      const region=document.getElementById('regionFilter')?.value||'all';
      const regionText=region==='all'?'Schweiz':region;
      const keywords=document.getElementById('searchKeywords')?.value||'Bauland Grundstück Entwicklungsobjekt Abbruchobjekt Baulandreserve';
      const base=`${keywords} ${regionText}`;
      const q=encodeURIComponent(base);
      const g=s=>'https://www.google.com/search?q='+encodeURIComponent(s);
      const sources=[['Gesamtes Web','◎',g(base)],['Facebook Marketplace','f','https://www.facebook.com/marketplace/switzerland/search/?query='+q],['Tutti','T',g(`site:tutti.ch ${base}`)],['Comparis','C',g(`site:comparis.ch/immobilien ${base}`)],['ImmoScout24','I',g(`site:immoscout24.ch ${base}`)],['Homegate','H',g(`site:homegate.ch ${base}`)],['Newhome','N',g(`site:newhome.ch ${base}`)],['Makler & Projektentwickler','M',g(`${base} Immobilienmakler Projektentwicklung Baulandreserve Abbruchobjekt`)]];
      const grid=document.getElementById('sourceGrid');if(!grid)return;
      grid.innerHTML=sources.map(([n,i,u],idx)=>`<article class="source-card"><div class="source-head"><span class="source-icon">${i}</span><div><strong>${n}</strong><small>Suchbereich ${idx+1}</small></div></div><p>Kostenlose Vertiefungssuche in der Originalquelle.</p><a class="source-link" target="_blank" rel="noopener noreferrer" href="${u}">Suchbereich öffnen ↗</a></article>`).join('');
    };
  }

  function installNationalSearch(){
    const button=document.getElementById('startSearchBtn');if(!button||button.dataset.allCantonsBound==='1')return;
    button.dataset.allCantonsBound='1';
    button.addEventListener('click',e=>{
      const region=document.getElementById('regionFilter')?.value||'all';
      if(region!=='all'&&VERIFIED_MARKET_REGIONS.has(region))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(typeof buildFallbacks==='function')buildFallbacks();
      const details=document.querySelector('#searchCenter details.fallback');if(details)details.open=true;
      const status=document.getElementById('searchStatus');if(status){status.hidden=false;status.innerHTML=region==='all'?'<strong>Schweiz-weite Suche ist bereit.</strong> Die direkten Suchbereiche durchsuchen die ganze Schweiz.':'<strong>Suche für '+region+' ist bereit.</strong> Für diesen Kanton werden die direkten Schweizer Immobilienquellen verwendet.';}
    },true);
  }

  if(typeof render==='function'){
    render=function(){
      let items=state.items.map(calculate);
      const region=document.getElementById('regionFilter')?.value||'all',budget=(+document.getElementById('budgetFilter')?.value||999)*1e6,strat=document.getElementById('strategyFilter')?.value||'all',min=+document.getElementById('marginFilter')?.value||0;
      items=items.filter(x=>(region==='all'||x.region===region)&&(strat==='all'||x.strategy===strat)&&(+x.price||0)<=budget&&(x.margin==null?min===0:x.margin>=min));
      const sort=document.getElementById('sortFilter')?.value||'score';items.sort((a,b)=>sort==='price'?(a.price-b.price):((b[sort]??-Infinity)-(a[sort]??-Infinity)));
      const analysed=items.filter(x=>x.margin!=null);
      if(document.getElementById('countKpi'))document.getElementById('countKpi').textContent=items.length;
      if(document.getElementById('marginKpi'))document.getElementById('marginKpi').textContent=analysed.length?(analysed.reduce((s,x)=>s+x.margin,0)/analysed.length).toFixed(1)+' %':'offen';
      if(document.getElementById('profitKpi'))document.getElementById('profitKpi').textContent=analysed.length?fmt(analysed.reduce((s,x)=>s+x.profit,0)/analysed.length):'offen';
      const best=analysed.length?Math.max(...analysed.map(x=>x.score||0)):null;
      if(document.getElementById('scoreKpi'))document.getElementById('scoreKpi').textContent=best??'–';if(document.getElementById('topScore'))document.getElementById('topScore').textContent=best??'–';
      const list=document.getElementById('list');if(!list)return;
      list.innerHTML=items.length?items.map(x=>{if(x.invest==null)return `<article class="card deal-card"><div><div class="deal-top"><span class="decision-chip check">DATEN FEHLEN</span><h4>${esc(x.name)}</h4></div><div class="meta"><span>${esc(x.region)}</span><span>${esc(x.strategy)}</span><span>${num(x.area)} m² Grundstück</span></div><div class="deal-foot"><small>${esc(x.reason)}</small><button class="text-btn edit-deal" data-id="${x.id||''}">Details</button></div></div><div class="score pending"><strong>?</strong><small>SCORE</small></div></article>`;return `<article class="card deal-card"><div><div class="deal-top"><span class="decision-chip ${x.decisionClass}">${x.decision}</span><span class="basis-mini ${x.basis.className}">${esc(x.basis.label)}</span><h4>${esc(x.name)}</h4></div><div class="meta"><span>${esc(x.region)}</span><span>${esc(x.strategy)}</span><span>${num(x.area)} m² Grundstück</span>${x.gfa?`<span>${num(x.gfa)} m² BGF</span>`:''}${x.source?`<span>Quelle: ${esc(x.source)}</span>`:''}</div><div class="metrics"><span class="metric">Kaufpreis<strong>${fmt(x.price)}</strong></span><span class="metric">Gesamtinvestition<strong>${fmt(x.invest)}</strong></span><span class="metric">Sonderkosten<strong>${fmt(x.specialTotal)}</strong></span><span class="metric">Gewinn<strong>${fmt(x.profit)}</strong></span><span class="metric">Marge<strong>${x.margin.toFixed(1)} %</strong></span></div><div class="deal-details"><div><span>Marktannahme</span><strong>${fmt(x.saleM2)}/m²</strong></div><div><span>Break-even</span><strong>${fmt(x.breakEven)}/m²</strong></div><div><span>Marktpuffer</span><strong>${x.marketBuffer.toFixed(1)} %</strong></div><div><span>Max. Landpreis</span><strong>${fmt(x.maxLand)}</strong></div></div><div class="deal-foot"><small>${esc(x.reason)}</small><div class="deal-actions">${x.sourceUrl?`<a href="${x.sourceUrl}" target="_blank" rel="noopener noreferrer">Quelle ↗</a>`:''}<button class="text-btn edit-deal" data-id="${x.id||''}">Details</button></div></div></div><div class="score"><strong>${x.score??'?'}</strong><small>SCORE</small></div></article>`;}).join(''):'<div class="empty"><strong>Noch keine Opportunity bewertet</strong><p>Suche ein Grundstück und tippe auf „Jetzt prüfen“.</p></div>';
    };
  }

  function init(){installCantons();installNationalSearch();if(typeof buildFallbacks==='function')buildFallbacks();if(typeof render==='function')render();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
