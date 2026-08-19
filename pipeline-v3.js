const PIPELINE_V3='0.16-hotfix';
(function(){
  const STORAGE_KEY='structaScoutItems';
  const $=id=>document.getElementById(id);
  const STATUS={
    new:{label:'Neu geprüft',icon:'●',className:'new'},
    deepen:{label:'Vertiefen',icon:'↗',className:'deepen'},
    favorite:{label:'Favorit',icon:'★',className:'favorite'},
    rejected:{label:'Ausgeschieden',icon:'×',className:'rejected'}
  };
  let statusFilter='active';
  let lastSavedId=null;
  let rendering=false;
  let beforeSubmitIds=[];

  function readItems(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
  function writeItems(items){localStorage.setItem(STORAGE_KEY,JSON.stringify(items));try{if(typeof state!=='undefined'&&Array.isArray(state.items)){state.items.splice(0,state.items.length,...items)}}catch{}}
  function calculated(item){try{return typeof calculate==='function'?calculate(item):item}catch{return item}}
  function fmtCHF(n){return new Intl.NumberFormat('de-CH',{style:'currency',currency:'CHF',maximumFractionDigits:0}).format(Number(n)||0)}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function itemStatus(x){return x.pipelineStatus&&STATUS[x.pipelineStatus]?x.pipelineStatus:'new'}
  function statusCounts(items){return {all:items.length,active:items.filter(x=>itemStatus(x)!=='rejected').length,new:items.filter(x=>itemStatus(x)==='new').length,deepen:items.filter(x=>itemStatus(x)==='deepen').length,favorite:items.filter(x=>itemStatus(x)==='favorite').length,rejected:items.filter(x=>itemStatus(x)==='rejected').length}}

  function injectStyles(){
    if($('pipelineV3Styles'))return;
    const s=document.createElement('style');s.id='pipelineV3Styles';s.textContent=`
      #list{display:none!important}.pipeline-v3-list{display:grid;gap:12px}.pipeline-toolbar-v3{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 12px}.pipe-v3-tab{border:1px solid #dce4ef;background:#fff;color:#536177;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}.pipe-v3-tab.active{background:#173d63;color:#fff;border-color:#173d63}.pipe-v3-tab b{margin-left:5px}.pipeline-v3-note{font-size:11px;color:#738096;margin:-8px 0 12px;line-height:1.45}
      .pipe-v3-card{background:#fff;border:1px solid #e3e8f0;border-radius:14px;padding:14px;position:relative}.pipe-v3-card.highlight{outline:3px solid rgba(38,71,163,.20);box-shadow:0 10px 30px rgba(38,71,163,.12)}.pipe-v3-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.pipe-v3-main{min-width:0}.pipe-v3-badges{display:flex;gap:6px;flex-wrap:wrap}.pipe-v3-status,.pipe-v3-decision,.pipe-v3-basis{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900}.pipe-v3-status.new{background:#eef2f7;color:#596579}.pipe-v3-status.deepen{background:#fff3d8;color:#8a5b00}.pipe-v3-status.favorite{background:#eaf0ff;color:#2647a3}.pipe-v3-status.rejected{background:#fdecec;color:#9d2c2c}.pipe-v3-decision.buy{background:#e9f8ef;color:#17683c}.pipe-v3-decision.check{background:#fff3d8;color:#8a5b00}.pipe-v3-decision.no{background:#fdecec;color:#9d2c2c}.pipe-v3-basis{background:#f2f4f8;color:#667386}.pipe-v3-card h4{margin:7px 0 4px;font-size:16px}.pipe-v3-meta{display:flex;gap:8px;flex-wrap:wrap;color:#738096;font-size:10px}.pipe-v3-score{flex:0 0 62px;height:62px;border-radius:14px;background:#eaf0ff;color:#2647a3;display:grid;place-items:center;text-align:center}.pipe-v3-score strong{display:block;font-size:22px;line-height:1}.pipe-v3-score small{font-size:8px;font-weight:900}.pipe-v3-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:12px}.pipe-v3-metric{background:#f6f8fb;border-radius:9px;padding:8px}.pipe-v3-metric span{display:block;color:#7a8594;font-size:9px}.pipe-v3-metric strong{display:block;color:#223148;font-size:12px;margin-top:3px;word-break:break-word}.pipe-v3-reason{margin-top:10px;padding:9px 10px;border-radius:9px;background:#f7f9fc;color:#536177;font-size:10px;line-height:1.4}.pipe-v3-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid #edf0f4}.pipe-v3-action{border:0;border-radius:8px;padding:8px 10px;font-size:10px;font-weight:800;cursor:pointer;background:#edf2f8;color:#29415f}.pipe-v3-action.primary{background:#2647a3;color:#fff}.pipe-v3-action.favorite{background:#eaf0ff;color:#2647a3}.pipe-v3-action.reject{background:#fdeeee;color:#963737}.pipe-v3-action.delete{margin-left:auto;background:transparent;color:#9a5960}.pipe-v3-source{color:#2647a3;text-decoration:none;font-size:10px;font-weight:800;align-self:center}.pipe-v3-empty{padding:28px 18px;text-align:center;border:1px dashed #cdd7e5;border-radius:12px;color:#738096}.pipe-v3-empty strong{display:block;color:#43536a;margin-bottom:5px}.pipeline-toast-v3{position:fixed;z-index:1600;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#173d63;color:#fff;border-radius:999px;padding:11px 16px;font-size:13px;font-weight:800;box-shadow:0 12px 32px rgba(23,61,99,.28);max-width:calc(100vw - 30px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:760px){.pipe-v3-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.pipe-v3-score{flex-basis:54px;height:54px}.pipe-v3-actions{display:grid;grid-template-columns:1fr 1fr}.pipe-v3-action{min-height:38px}.pipe-v3-action.delete{margin-left:0}.pipe-v3-card h4{font-size:14px}}
    `;document.head.appendChild(s);
  }

  function ensureOwnArea(){
    const old=$('list');if(!old)return null;
    let note=$('pipelineV3Note');if(!note){note=document.createElement('div');note.id='pipelineV3Note';note.className='pipeline-v3-note';note.textContent='Gespeicherte Opportunities – unabhängig von den Suchfiltern. Hier entscheidest du: vertiefen, favorisieren oder ausscheiden.';old.insertAdjacentElement('beforebegin',note)}
    let toolbar=$('pipelineToolbarV3');if(!toolbar){toolbar=document.createElement('div');toolbar.id='pipelineToolbarV3';toolbar.className='pipeline-toolbar-v3';old.insertAdjacentElement('beforebegin',toolbar)}
    let own=$('pipelineV3List');if(!own){own=document.createElement('div');own.id='pipelineV3List';own.className='pipeline-v3-list';old.insertAdjacentElement('afterend',own)}
    return own;
  }

  function visibleItems(items){
    if(statusFilter==='all')return items;
    if(statusFilter==='active')return items.filter(x=>itemStatus(x)!=='rejected');
    return items.filter(x=>itemStatus(x)===statusFilter);
  }
  function sortItems(items){const sort=$('sortFilter')?.value||'score';return [...items].sort((a,b)=>sort==='price'?(Number(a.price)||0)-(Number(b.price)||0):(Number(b[sort])||-Infinity)-(Number(a[sort])||-Infinity))}

  function updateKpis(items){
    const active=items.filter(x=>itemStatus(x)!=='rejected'),analysed=active.map(calculated).filter(x=>x.margin!=null);
    if($('countKpi'))$('countKpi').textContent=active.length;
    if($('countKpi')?.nextElementSibling)$('countKpi').nextElementSibling.textContent=`${items.length} gespeichert · ${items.length-active.length} ausgeschieden`;
    if($('marginKpi'))$('marginKpi').textContent=analysed.length?(analysed.reduce((s,x)=>s+Number(x.margin||0),0)/analysed.length).toFixed(1)+' %':'offen';
    if($('profitKpi'))$('profitKpi').textContent=analysed.length?fmtCHF(analysed.reduce((s,x)=>s+Number(x.profit||0),0)/analysed.length):'offen';
    const best=analysed.length?Math.max(...analysed.map(x=>Number(x.score)||0)):null;if($('scoreKpi'))$('scoreKpi').textContent=best??'–';if($('topScore'))$('topScore').textContent=best??'–';
  }

  function card(raw){
    const x=calculated(raw),stKey=itemStatus(raw),st=STATUS[stKey],loc=raw.locationAnalysis,basis=x.basis?.label||'Grobe Vorprüfung';
    return `<article class="pipe-v3-card ${raw.id===lastSavedId?'highlight':''}" data-pipe-v3-id="${esc(raw.id)}"><div class="pipe-v3-head"><div class="pipe-v3-main"><div class="pipe-v3-badges"><span class="pipe-v3-status ${st.className}">${st.icon} ${st.label}</span><span class="pipe-v3-decision ${x.decisionClass||'check'}">${esc(x.decision||'DATEN FEHLEN')}</span><span class="pipe-v3-basis">${esc(basis)}</span></div><h4>${esc(raw.name||'Unbenannte Opportunity')}</h4><div class="pipe-v3-meta"><span>${esc(raw.region||'')}</span><span>${esc(raw.strategy||'')}</span><span>${Number(raw.area||0).toLocaleString('de-CH')} m² Land</span>${loc?.score?`<span>Standort ${loc.score}/100</span>`:''}</div></div><div class="pipe-v3-score"><div><strong>${x.score??'?'}</strong><small>SCORE</small></div></div></div><div class="pipe-v3-metrics"><div class="pipe-v3-metric"><span>Kaufpreis</span><strong>${fmtCHF(raw.price)}</strong></div><div class="pipe-v3-metric"><span>Gesamtinvestition</span><strong>${x.invest!=null?fmtCHF(x.invest):'offen'}</strong></div><div class="pipe-v3-metric"><span>Gewinnpotenzial</span><strong>${x.profit!=null?fmtCHF(x.profit):'offen'}</strong></div><div class="pipe-v3-metric"><span>Projektmarge</span><strong>${x.margin!=null?Number(x.margin).toFixed(1)+' %':'offen'}</strong></div><div class="pipe-v3-metric"><span>Max. Landpreis</span><strong>${x.maxLand!=null?fmtCHF(x.maxLand):'offen'}</strong></div></div><div class="pipe-v3-reason">${esc(x.reason||'Noch keine vollständige Bewertung vorhanden.')}</div><div class="pipe-v3-actions"><button type="button" class="pipe-v3-action primary" data-v3-action="details">Details / Annahmen</button>${stKey!=='deepen'?'<button type="button" class="pipe-v3-action" data-v3-action="deepen">Vertiefen</button>':''}${stKey!=='favorite'?'<button type="button" class="pipe-v3-action favorite" data-v3-action="favorite">★ Favorit</button>':''}${stKey!=='rejected'?'<button type="button" class="pipe-v3-action reject" data-v3-action="rejected">Ausscheiden</button>':'<button type="button" class="pipe-v3-action" data-v3-action="new">Reaktivieren</button>'}${raw.sourceUrl?`<a class="pipe-v3-source" href="${esc(raw.sourceUrl)}" target="_blank" rel="noopener noreferrer">Originalquelle ↗</a>`:''}<button type="button" class="pipe-v3-action delete" data-v3-action="delete">Löschen</button></div></article>`;
  }

  function render(){
    if(rendering)return;rendering=true;
    try{
      const own=ensureOwnArea();if(!own)return;
      const raw=readItems(),calc=raw.map(r=>({...r,...calculated(r)}));updateKpis(raw);
      const c=statusCounts(raw),bar=$('pipelineToolbarV3');if(bar){const defs=[['active','Aktiv',c.active],['new','Neu',c.new],['deepen','Vertiefen',c.deepen],['favorite','Favoriten',c.favorite],['rejected','Ausgeschieden',c.rejected],['all','Alle',c.all]];bar.innerHTML=defs.map(([v,l,n])=>`<button type="button" class="pipe-v3-tab ${statusFilter===v?'active':''}" data-v3-filter="${v}">${l}<b>${n}</b></button>`).join('')}
      const rawMap=new Map(raw.map(x=>[x.id,x]));const visible=sortItems(visibleItems(calc)).map(x=>rawMap.get(x.id)||x);
      own.innerHTML=visible.length?visible.map(card).join(''):`<div class="pipe-v3-empty"><strong>${raw.length?'Keine Opportunities in diesem Status':'Noch keine Opportunity gespeichert'}</strong><span>${raw.length?'Wähle oben einen anderen Status.':'Suche ein Grundstück, tippe auf „Jetzt prüfen“ und danach auf „Bewerten & speichern“.'}</span></div>`;
      if(lastSavedId){const el=own.querySelector(`[data-pipe-v3-id="${CSS.escape(lastSavedId)}"]`);if(el)setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'center'}),100);setTimeout(()=>{lastSavedId=null;own.querySelectorAll('.highlight').forEach(e=>e.classList.remove('highlight'))},2200)}
    }finally{rendering=false}
  }

  function setStatus(id,status){const items=readItems(),x=items.find(i=>i.id===id);if(!x)return;x.pipelineStatus=status;x.pipelineUpdated=new Date().toISOString();writeItems(items);render()}
  function deleteItem(id){if(!confirm('Diese Opportunity wirklich löschen?'))return;const items=readItems().filter(x=>x.id!==id);writeItems(items);render()}
  function toast(msg){let t=$('pipelineToastV3');if(t)t.remove();t=document.createElement('div');t.id='pipelineToastV3';t.className='pipeline-toast-v3';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2400)}

  function bind(){
    const panel=document.querySelector('.opportunities');if(panel&&!panel.dataset.v3Bound){panel.dataset.v3Bound='1';panel.addEventListener('click',e=>{const tab=e.target.closest('[data-v3-filter]');if(tab){statusFilter=tab.dataset.v3Filter;render();return}const btn=e.target.closest('[data-v3-action]');if(!btn)return;const card=btn.closest('[data-pipe-v3-id]'),id=card?.dataset.pipeV3Id;if(!id)return;const action=btn.dataset.v3Action;if(action==='details'){const item=readItems().find(x=>x.id===id);if(item&&typeof populateExisting==='function')populateExisting(item)}else if(action==='delete')deleteItem(id);else setStatus(id,action)})}

    const form=$('form');if(form&&!form.dataset.v3Bound){form.dataset.v3Bound='1';form.addEventListener('submit',()=>{beforeSubmitIds=readItems().map(x=>x.id);try{if(typeof state!=='undefined'&&Array.isArray(state.items)){const stored=new Map(readItems().map(x=>[x.id,x.pipelineStatus]));state.items.forEach(x=>{if(stored.get(x.id))x.pipelineStatus=stored.get(x.id)})}}catch{}},true);form.addEventListener('submit',()=>{setTimeout(()=>{const items=readItems();const added=items.find(x=>!beforeSubmitIds.includes(x.id));if(added){if(!added.pipelineStatus)added.pipelineStatus='new';writeItems(items);lastSavedId=added.id;toast('Opportunity gespeichert ✓');const target=document.querySelector('.opportunities');if(target)setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),80)}render()},140)})}

    ['regionFilter','budgetFilter','strategyFilter','marginFilter','sortFilter'].forEach(id=>$(id)?.addEventListener('change',()=>setTimeout(render,0)));
    window.addEventListener('focus',render);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render()});window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY)render()});

    const old=$('list');if(old&&!old.dataset.v3Observed){old.dataset.v3Observed='1';new MutationObserver(()=>queueMicrotask(render)).observe(old,{childList:true,subtree:true,characterData:true})}
  }

  function wrapMarketOpen(){
    if(typeof window.openMarketOpportunity!=='function'||window.openMarketOpportunity.__v3)return;
    const original=window.openMarketOpportunity;const wrapped=function(item){original(item);setTimeout(()=>{const selected=$('strategyFilter')?.value||'all';if(selected!=='all'&&$('strategy')){$('strategy').value=selected;$('strategy').dispatchEvent(new Event('change',{bubbles:true}))}},60)};wrapped.__v3=true;window.openMarketOpportunity=wrapped;
  }

  function install(){injectStyles();ensureOwnArea();bind();wrapMarketOpen();render()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();window.addEventListener('load',()=>{wrapMarketOpen();render()},{once:true});
})();