const PIPELINE_VERSION='0.15';
(function(){
  const $=id=>document.getElementById(id);
  let installed=false;

  function toast(message){
    let el=$('pipelineToast');
    if(!el){
      el=document.createElement('div');
      el.id='pipelineToast';
      el.style.cssText='position:fixed;z-index:1500;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(12px);background:#173d63;color:#fff;border-radius:999px;padding:11px 16px;font-size:13px;font-weight:800;box-shadow:0 12px 32px rgba(23,61,99,.28);opacity:0;transition:.18s;pointer-events:none;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis';
      document.body.appendChild(el);
    }
    el.textContent=message;
    requestAnimationFrame(()=>{el.style.opacity='1';el.style.transform='translateX(-50%) translateY(0)';});
    clearTimeout(el._hideTimer);
    el._hideTimer=setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(-50%) translateY(12px)';},2400);
  }

  function currentStored(){
    try{return JSON.parse(localStorage.getItem('structaScoutItems')||'[]');}catch{return [];}
  }

  function selectedProjectType(){
    const value=$('strategyFilter')?.value||'all';
    return value==='all'?'':value;
  }

  function applySearchProjectType(){
    const strategy=selectedProjectType();
    if(strategy&&$('strategy')){
      $('strategy').value=strategy;
      $('strategy').dispatchEvent(new Event('change',{bubbles:true}));
    }
  }

  function ensureSavedItemCanBeSeen(){
    const formRegion=$('region')?.value||'';
    const formStrategy=$('strategy')?.value||'';
    const price=Number($('price')?.value||0);

    const regionFilter=$('regionFilter');
    if(regionFilter&&regionFilter.value!=='all'&&regionFilter.value!==formRegion)regionFilter.value='all';

    const strategyFilter=$('strategyFilter');
    if(strategyFilter&&strategyFilter.value!=='all'&&strategyFilter.value!==formStrategy)strategyFilter.value='all';

    const budgetFilter=$('budgetFilter');
    if(budgetFilter&&budgetFilter.value!=='999'&&price>Number(budgetFilter.value)*1000000)budgetFilter.value='999';

    const marginFilter=$('marginFilter');
    if(marginFilter&&Number(marginFilter.value)>0)marginFilter.value='0';
  }

  function scrollToPipeline(){
    const target=document.querySelector('.opportunities');
    if(target)setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),120);
  }

  function wrapMarketOpportunity(){
    if(typeof window.openMarketOpportunity!=='function'||window.openMarketOpportunity.__pipelineWrapped)return;
    const original=window.openMarketOpportunity;
    const wrapped=function(item){
      original(item);
      setTimeout(()=>{
        applySearchProjectType();
        if(typeof window.updatePreview==='function')window.updatePreview();
      },40);
    };
    wrapped.__pipelineWrapped=true;
    window.openMarketOpportunity=wrapped;
  }

  function bindFormSave(){
    const form=$('form');
    if(!form||form.dataset.pipelineBound==='1')return;
    form.dataset.pipelineBound='1';
    form.addEventListener('submit',()=>{
      const before=currentStored();
      const beforeSignature=JSON.stringify(before);
      ensureSavedItemCanBeSeen();
      setTimeout(()=>{
        const after=currentStored();
        const changed=JSON.stringify(after)!==beforeSignature;
        if(changed){
          if(typeof window.render==='function')window.render();
          toast('Opportunity gespeichert ✓');
          scrollToPipeline();
        }
      },100);
    },true);
  }

  function addPipelineHint(){
    const title=document.querySelector('.opportunities .panel-title');
    if(!title||$('pipelineHint'))return;
    const hint=document.createElement('div');
    hint.id='pipelineHint';
    hint.style.cssText='font-size:11px;color:#738096;margin:-8px 0 14px;line-height:1.4';
    hint.textContent='Hier erscheinen alle mit „Bewerten & speichern“ übernommenen Opportunities.';
    title.insertAdjacentElement('afterend',hint);
  }

  function install(){
    if(installed)return;installed=true;
    wrapMarketOpportunity();
    bindFormSave();
    addPipelineHint();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  window.addEventListener('load',()=>{wrapMarketOpportunity();bindFormSave();},{once:true});
})();
