const SAVE_VERSION='0.17.2';
(function(){
  const STORAGE_KEY='structaScoutItems';
  const $=id=>document.getElementById(id);

  function showSaveMessage(message,error=false){
    let el=$('saveStatusToast');
    if(el)el.remove();
    el=document.createElement('div');
    el.id='saveStatusToast';
    el.textContent=message;
    el.style.cssText=`position:fixed;z-index:2200;left:50%;bottom:24px;transform:translateX(-50%);max-width:calc(100vw - 30px);padding:11px 16px;border-radius:999px;font:800 13px/1.2 Arial,sans-serif;color:#fff;background:${error?'#963737':'#17683c'};box-shadow:0 12px 32px rgba(23,61,99,.25);white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(),error?4500:2600);
  }

  function storageItems(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(value)?value:[];
    }catch{return []}
  }

  function persist(items){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(items));
    const check=storageItems();
    if(check.length!==items.length)throw new Error('Speicherprüfung fehlgeschlagen');
  }

  function handleSave(event){
    event.preventDefault();
    event.stopImmediatePropagation();

    try{
      if(typeof formData!=='function')throw new Error('Formulardaten nicht verfügbar');
      const x=formData();
      if(!x.name){showSaveMessage('Bitte Bezeichnung oder Adresse eingeben.',true);return}
      if(typeof PILOT_REGIONS!=='undefined'&&!PILOT_REGIONS.includes(x.region)){showSaveMessage('Region ist nicht im Pilotgebiet.',true);return}
      if(!x.gfa||!x.sellable||!x.saleM2||!x.buildM2){showSaveMessage('BGF, verkaufbare Fläche, Marktannahme und Baukosten prüfen.',true);return}

      const items=storageItems();
      const currentId=typeof editingId!=='undefined'?editingId:null;

      if(currentId){
        const idx=items.findIndex(i=>i.id===currentId);
        const existing=idx>=0?items[idx]:null;
        const updated={...(existing||{}),...x,id:currentId,pipelineStatus:existing?.pipelineStatus||'new'};
        if(idx>=0)items[idx]=updated;else items.unshift(updated);
      }else{
        const newId='opp-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
        items.unshift({...x,id:newId,pipelineStatus:'new',created:new Date().toISOString()});
      }

      persist(items);
      if(typeof state!=='undefined'&&Array.isArray(state.items))state.items.splice(0,state.items.length,...items);
      if(typeof editingId!=='undefined')editingId=null;
      if(typeof pendingMarketContext!=='undefined')pendingMarketContext=null;
      if($('dialog')?.open)$('dialog').close();
      if(typeof render==='function')render();
      showSaveMessage('Opportunity gespeichert ✓');
      setTimeout(()=>document.querySelector('.opportunities')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    }catch(error){
      console.error('Structa speichern fehlgeschlagen',error);
      showSaveMessage('Speichern fehlgeschlagen – bitte Seite aktualisieren.',true);
    }
  }

  function install(){
    const form=$('form');
    if(!form||form.dataset.cleanSaveBound==='1')return;
    form.dataset.cleanSaveBound='1';
    form.addEventListener('submit',handleSave,true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
