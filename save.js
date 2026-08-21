const SAVE_VERSION='0.21';
(function(){
  const STORAGE_KEY='structaScoutItems';
  const $=id=>document.getElementById(id);

  function showSaveMessage(message,error=false){
    let el=$('saveStatusToast');if(el)el.remove();
    el=document.createElement('div');el.id='saveStatusToast';el.textContent=message;
    el.style.cssText=`position:fixed;z-index:2200;left:50%;bottom:24px;transform:translateX(-50%);max-width:calc(100vw - 30px);padding:11px 16px;border-radius:999px;font:800 13px/1.2 Arial,sans-serif;color:#fff;background:${error?'#963737':'#17683c'};box-shadow:0 12px 32px rgba(23,61,99,.25);white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
    document.body.appendChild(el);setTimeout(()=>el.remove(),error?4500:2600);
  }

  function storageItems(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(value)?value:[]}catch{return []}}
  function persist(items){localStorage.setItem(STORAGE_KEY,JSON.stringify(items));const check=storageItems();if(check.length!==items.length)throw new Error('Speicherprüfung fehlgeschlagen');}

  function missingMessage(x){
    const missing=[];
    if(!x.name)missing.push('Bezeichnung/Adresse');
    if(!x.area)missing.push('Grundstücksfläche');
    if(!(Number(x.price)>0))missing.push('Kaufpreis');
    return missing.length?'Fehlt: '+missing.join(', '):'';
  }

  function handleSave(event){
    event.preventDefault();event.stopImmediatePropagation();
    try{
      if(typeof formData!=='function')throw new Error('Formulardaten nicht verfügbar');
      const x=formData(),missing=missingMessage(x);if(missing){showSaveMessage(missing,true);return}
      const cantons=Array.isArray(window.STRUCTA_CANTONS)?window.STRUCTA_CANTONS:null;
      if(cantons&&!cantons.includes(x.region)){showSaveMessage('Bitte einen Schweizer Kanton auswählen.',true);return}
      const items=storageItems(),currentId=typeof editingId!=='undefined'?editingId:null;
      if(currentId){const idx=items.findIndex(i=>i.id===currentId),existing=idx>=0?items[idx]:null,updated={...(existing||{}),...x,id:currentId,pipelineStatus:existing?.pipelineStatus||'new'};if(idx>=0)items[idx]=updated;else items.unshift(updated)}
      else{const newId='opp-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);items.unshift({...x,id:newId,pipelineStatus:'new',created:new Date().toISOString()})}
      persist(items);
      if(typeof state!=='undefined'&&Array.isArray(state.items))state.items.splice(0,state.items.length,...items);
      if(typeof editingId!=='undefined')editingId=null;if(typeof pendingMarketContext!=='undefined')pendingMarketContext=null;
      if($('dialog')?.open)$('dialog').close();if(typeof render==='function')render();
      const incomplete=!(Number(x.gfa)>0&&Number(x.sellable)>0&&Number(x.saleM2)>0&&Number(x.buildM2)>0);
      showSaveMessage(incomplete?'Opportunity gespeichert · Grundlagen noch offen':'Opportunity gespeichert ✓');
      setTimeout(()=>document.querySelector('.opportunities')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    }catch(error){console.error('Structa speichern fehlgeschlagen',error);showSaveMessage('Speichern fehlgeschlagen – bitte Seite aktualisieren.',true)}
  }

  function finaliseUi(){
    const b=$('versionBadge');if(b)b.textContent='Beta 0.21 · Baupotenzial';
    const side=$('appVersion');if(side)side.textContent='Beta 0.21';
    const region=$('region');if(region&&region.dataset.oerebClearBound!=='1'){region.dataset.oerebClearBound='1';region.addEventListener('change',()=>{const box=$('oerebResult');if(box)box.innerHTML='';});}
  }

  function loadBuildPotential(){
    if(document.querySelector('script[data-build-potential-module]')){finaliseUi();return}
    const script=document.createElement('script');script.src='./build-potential.js?v='+SAVE_VERSION;script.dataset.buildPotentialModule='1';script.onload=finaliseUi;script.onerror=finaliseUi;document.body.appendChild(script);
  }
  function loadOerebModule(){
    if(document.querySelector('script[data-oereb-module]')){loadBuildPotential();return}
    const script=document.createElement('script');script.src='./oereb.js?v='+SAVE_VERSION;script.dataset.oerebModule='1';script.onload=loadBuildPotential;script.onerror=loadBuildPotential;document.body.appendChild(script);
  }
  function loadOfficialModule(){
    const existing=document.querySelector('script[data-official-module]');if(existing){loadOerebModule();return}
    const script=document.createElement('script');script.src='./official-data.js?v='+SAVE_VERSION;script.dataset.officialModule='1';script.onload=loadOerebModule;script.onerror=loadOerebModule;document.body.appendChild(script);
  }
  function loadEnhancementModules(){
    const existing=document.querySelector('script[data-accuracy-module]');if(existing){loadOfficialModule();return}
    const script=document.createElement('script');script.src='./accuracy.js?v='+SAVE_VERSION;script.dataset.accuracyModule='1';script.onload=loadOfficialModule;script.onerror=loadOfficialModule;document.body.appendChild(script);
  }
  function loadCantonModule(){
    if(document.querySelector('script[data-canton-module]')){loadEnhancementModules();return}
    const script=document.createElement('script');script.src='./swiss-cantons.js?v='+SAVE_VERSION;script.dataset.cantonModule='1';script.onload=loadEnhancementModules;script.onerror=loadEnhancementModules;document.body.appendChild(script);
  }
  function install(){const form=$('form');if(form&&form.dataset.cleanSaveBound!=='1'){form.noValidate=true;form.dataset.cleanSaveBound='1';form.addEventListener('submit',handleSave,true)}loadCantonModule();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();