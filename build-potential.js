const BUILD_POTENTIAL_VERSION='0.21';

(function(){
  const $=id=>document.getElementById(id);
  const escP=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const intP=value=>new Intl.NumberFormat('de-CH',{maximumFractionDigits:0}).format(Number(value)||0);

  function normaliseRatio(value){
    let n=Number(String(value??'').replace(',','.').replace(/[^0-9.]/g,''));
    if(!Number.isFinite(n)||n<=0)return null;
    if(n>5)n=n/100;
    return n>0&&n<=5?n:null;
  }

  function ratioFromText(text){
    const source=String(text||'');
    const patterns=[
      /(?:Ausnützungsziffer|Ausnuetzungsziffer|AZ)\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)\s*(%?)/i,
      /(?:Geschossflächenziffer|Geschossflaechenziffer|GFZ)\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)\s*(%?)/i,
      /(?:Nutzungsziffer)\s*[:=]?\s*([0-9]+(?:[.,][0-9]+)?)\s*(%?)/i
    ];
    for(const pattern of patterns){
      const m=source.match(pattern);if(!m)continue;
      let n=Number(m[1].replace(',','.'));if(!Number.isFinite(n)||n<=0)continue;
      if(m[2]==='%'||n>5)n/=100;
      if(n>0&&n<=5)return n;
    }
    return null;
  }

  function officialRatio(item){
    const attrs=item?.locationAnalysis?.officialData?.zone?.attributes||{};
    for(const [key,value] of Object.entries(attrs)){
      const k=String(key).toLowerCase();
      if(!/(ausnutz|gfz|geschossfl|nutzungsziffer)/.test(k))continue;
      const n=normaliseRatio(value);if(n)return {ratio:n,source:'Amtliches Zonenattribut',verified:true};
    }
    const zoneLabel=item?.locationAnalysis?.officialData?.zone?.label||'';
    const fromLabel=ratioFromText(zoneLabel);
    if(fromLabel)return {ratio:fromLabel,source:'Amtliche Zonenbezeichnung',verified:true};
    return null;
  }

  function detectedRatio(item){
    const official=officialRatio(item);if(official)return official;
    const sources=[
      [item?.zone,'Inserat / Objektquelle'],
      [item?.marketNote,'Inserat / Objektbeschreibung'],
      [item?.geometrySource,'Scout-Übernahme aus Quelle']
    ];
    for(const [text,label] of sources){const n=ratioFromText(text);if(n)return {ratio:n,source:label,verified:false}}
    return null;
  }

  function zoneCategory(item){
    const text=`${item?.locationAnalysis?.officialData?.zone?.label||''} ${item?.zone||''}`.toLowerCase();
    if(/wohn/.test(text))return 'Wohnzone';
    if(/misch|wohn.*gewerb|gewerb.*wohn/.test(text))return 'Mischzone';
    if(/zentrum|kern/.test(text))return 'Zentrums-/Kernzone';
    if(/arbeits|gewerb|industrie/.test(text))return 'Arbeits-/Gewerbezone';
    if(/öffentlich|oeffentlich/.test(text))return 'Zone für öffentliche Nutzung';
    if(/touris|hotel/.test(text))return 'Tourismuszone';
    return item?.locationAnalysis?.officialData?.zone?.found===false?'Keine harmonisierte Bauzone erkannt':'Zonentyp noch nicht eindeutig';
  }

  function sourceMeta(item){
    const manual=normaliseRatio(item?.densityRatio);
    const kind=item?.densitySource||'unknown';
    if(manual){
      const labels={regulation:'Kommunales Zonenreglement',official:'Amtlicher Auszug / ÖREB',listing:'Inserat / Verkaufsunterlagen',manual:'Manuelle Projektannahme',unknown:'Manuell eingetragen'};
      return {ratio:manual,source:labels[kind]||labels.unknown,verified:kind==='regulation'||kind==='official'};
    }
    return detectedRatio(item);
  }

  function assess(item){
    const area=Number(item?.area)||0,gfa=Number(item?.gfa)||0,sellable=Number(item?.sellable)||0;
    const density=sourceMeta(item),ratio=density?.ratio||null;
    const theoretical=area&&ratio?Math.round(area*ratio):null;
    const implied=area&&gfa?gfa/area:null;
    const utilisation=theoretical&&gfa?gfa/theoretical*100:null;
    const zone=zoneCategory(item);
    const egrid=Boolean(item?.locationAnalysis?.oerebData?.egrid);
    const zoneFound=item?.locationAnalysis?.officialData?.zone?.found===true;
    let status='BAURECHT VERTIEFEN',statusClass='check',message='Für eine belastbare BGF fehlt noch eine verifizierte Ausnützungs-/Geschossflächenziffer.';
    if(ratio&&theoretical&&!gfa){status='BGF ABLEITBAR';message=`Aus der vorliegenden Nutzungsziffer ergibt sich rechnerisch eine BGF von rund ${intP(theoretical)} m².`;}
    else if(ratio&&theoretical&&gfa){
      if(gfa>theoretical*1.05){status='BGF PRÜFEN';statusClass='warn';message=`Die eingetragene BGF liegt über der aus der Nutzungsziffer rechnerisch ableitbaren Fläche. Bonus-, Sondernutzungs- oder Messregeln müssen geprüft werden.`;}
      else{status='PLAUSIBEL';statusClass='ok';message='Die eingetragene BGF liegt innerhalb der rechnerisch ableitbaren Grössenordnung. Weitere Bauvorschriften bleiben zu prüfen.';}
    }
    if(item?.locationAnalysis?.officialData?.zone?.found===false){status='BAUZONE PRÜFEN';statusClass='warn';message='Am geprüften Punkt wurde im harmonisierten Bundesdatensatz keine Bauzone erkannt. Vor einer Projektannahme ist die aktuelle kommunale Nutzungsplanung zu prüfen.';}
    const missing=[];
    if(!zoneFound)missing.push('aktuellen Zonenplan bestätigen');
    if(!egrid)missing.push('Parzelle/EGRID bestätigen');
    if(!ratio)missing.push('AZ/GFZ bzw. Nutzungsziffer');
    missing.push('Gebäudehöhe/Geschosse','Grenz- und Gebäudeabstände');
    const completeness=Math.min(100,(area?15:0)+(zoneFound?20:0)+(egrid?15:0)+(ratio?25:0)+(density?.verified?15:0)+(gfa?5:0)+(sellable?5:0));
    return {area,gfa,sellable,zone,egrid,zoneFound,density,ratio,theoretical,implied,utilisation,status,statusClass,message,missing:[...new Set(missing)].slice(0,5),completeness};
  }

  function injectInputs(){
    if($('buildPotentialInputs'))return;
    const firstSection=document.querySelector('#form .form-section');if(!firstSection)return;
    const section=document.createElement('div');section.id='buildPotentialInputs';section.className='form-section';
    section.innerHTML=`<div class="section-title-row"><div><h4>1a · Baupotenzial</h4><p class="section-note">Der Scout übernimmt eine Nutzungsziffer nur, wenn eine Quelle vorhanden ist. Ohne Quelle bleibt die BGF eine zu verifizierende Annahme.</p></div></div><div class="form-grid"><label><span>AZ / GFZ / Nutzungsziffer</span><input id="densityRatio" type="number" min="0" max="5" step="0.01" placeholder="z. B. 0.60"></label><label><span>Quelle Nutzungsziffer</span><select id="densitySource"><option value="unknown">noch nicht verifiziert</option><option value="regulation">Kommunales Zonenreglement</option><option value="official">Amtlicher Auszug / ÖREB</option><option value="listing">Inserat / Verkaufsunterlagen</option><option value="manual">Manuelle Projektannahme</option></select></label></div><div class="build-potential-action"><button type="button" class="btn secondary" id="usePotentialGfaBtn" disabled>Rechnerische BGF übernehmen</button><small id="potentialInputHint">Wird automatisch aus vorhandenen Quellen ergänzt, wenn eine AZ/GFZ erkannt wird.</small></div>`;
    firstSection.insertAdjacentElement('afterend',section);
  }

  function ensureResult(){
    let box=$('buildPotentialResult');if(box)return box;
    const anchor=$('oerebResult')||$('officialDataResult')||$('locationResult');if(!anchor)return null;
    box=document.createElement('div');box.id='buildPotentialResult';box.className='build-potential-result';anchor.insertAdjacentElement('afterend',box);return box;
  }

  function injectStyles(){
    if($('buildPotentialStyles'))return;
    const s=document.createElement('style');s.id='buildPotentialStyles';s.textContent=`
      .build-potential-action{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}.build-potential-action small{color:#738096}
      .build-potential-result{margin-top:12px}.build-potential-card{border:1px solid #dfe7f2;background:#fff;border-radius:12px;padding:12px}.build-potential-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.build-potential-head strong{color:#173d63}.build-potential-badge{font-size:9px;font-weight:900;border-radius:999px;padding:4px 7px;background:#eef5ff;color:#315d92}.build-potential-badge.ok{background:#e9f8ef;color:#17683c}.build-potential-badge.warn{background:#fff2df;color:#8a5517}.build-potential-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.build-potential-grid div{background:#f6f8fb;border-radius:9px;padding:9px}.build-potential-grid span{display:block;color:#7a8594;font-size:9px}.build-potential-grid strong{display:block;color:#223148;font-size:11px;margin-top:3px;line-height:1.35}.build-potential-message{margin-top:10px;font-size:10px;line-height:1.45;color:#536177}.build-potential-missing{margin-top:8px;font-size:9px;color:#7a8594}.build-potential-source{margin-top:8px;font-size:9px;color:#7a8594}.build-potential-quality{margin-top:9px;height:6px;background:#edf1f6;border-radius:999px;overflow:hidden}.build-potential-quality i{display:block;height:100%;background:#315d92;border-radius:999px}@media(max-width:650px){.build-potential-grid{grid-template-columns:1fr 1fr}.build-potential-head{align-items:flex-start;flex-direction:column}}
    `;document.head.appendChild(s);
  }

  function currentItem(){
    if(typeof formData!=='function')return null;
    try{return formData()}catch{return null}
  }

  function renderPotential(item=currentItem()){
    const box=ensureResult();if(!box||!item)return;
    const p=assess(item);
    const ratioText=p.ratio?p.ratio.toFixed(2):'offen';
    const theoretical=p.theoretical?`${intP(p.theoretical)} m²`:'noch nicht bestimmbar';
    const implied=p.implied?p.implied.toFixed(2):'–';
    const utilisation=p.utilisation!=null?`${p.utilisation.toFixed(0)} %`:'–';
    box.innerHTML=`<div class="build-potential-card"><div class="build-potential-head"><div><strong>Baupotenzial & Plausibilität</strong><div class="build-potential-source">${escP(p.zone)}</div></div><span class="build-potential-badge ${p.statusClass}">${escP(p.status)}</span></div><div class="build-potential-grid"><div><span>Nutzungsziffer</span><strong>${escP(ratioText)}</strong></div><div><span>Rechnerische BGF</span><strong>${escP(theoretical)}</strong></div><div><span>BGF-Annahme / implizite AZ</span><strong>${p.gfa?`${intP(p.gfa)} m² / ${implied}`:'offen'}</strong></div><div><span>Auslastung rechnerische BGF</span><strong>${utilisation}</strong></div></div><div class="build-potential-message">${escP(p.message)}</div><div class="build-potential-missing"><strong>Noch prüfen:</strong> ${p.missing.map(escP).join(' · ')}</div><div class="build-potential-source"><strong>Quelle Nutzungsziffer:</strong> ${escP(p.density?.source||'keine belastbare Quelle erkannt')} ${p.density?.verified?'· verifiziert':'· vorläufig'}</div><div class="build-potential-quality"><i style="width:${p.completeness}%"></i></div></div>`;
    const use=$('usePotentialGfaBtn');if(use){use.disabled=!p.theoretical;use.dataset.gfa=p.theoretical||''}
    const hint=$('potentialInputHint');if(hint)hint.textContent=p.ratio?`Erkannte Nutzungsziffer ${p.ratio.toFixed(2)} · ${p.density?.source||'Quelle offen'}`:'Keine AZ/GFZ automatisch erkannt – bitte aus Zonenreglement/ÖREB ergänzen.';
    if(!$('densityRatio')?.value&&p.ratio&&p.density){$('densityRatio').value=p.ratio.toFixed(2);$('densitySource').value=p.density.verified?'official':'listing';}
  }

  function wrapFormData(){
    if(typeof formData!=='function'||formData.__buildPotential21)return;
    const base=formData;
    const wrapped=function(){return {...base(),densityRatio:normaliseRatio($('densityRatio')?.value)||0,densitySource:$('densitySource')?.value||'unknown'};};
    wrapped.__buildPotential21=true;formData=wrapped;
  }

  function wrapCalculate(){
    if(typeof calculate!=='function'||calculate.__buildPotential21)return;
    const base=calculate;
    const wrapped=function(item){
      const result=base(item),potential=assess(item);
      let out={...result,buildPotential:potential};
      if(result?.dataQuality){
        let boost=0;if(potential.ratio)boost+=5;if(potential.density?.verified)boost+=7;if(potential.egrid)boost+=3;
        const score=Math.min(100,Number(result.dataQuality.score||0)+boost);
        const gaps=[...(result.dataQuality.gaps||[])].filter(x=>!String(x).includes('BGF/Baupotenzial'));
        if(!potential.density?.verified)gaps.unshift('Baupotenzial / Nutzungsziffer noch nicht verifiziert');
        out.dataQuality={...result.dataQuality,score,label:score>=80?'hoch':score>=60?'mittel':'niedrig',gaps:[...new Set(gaps)].slice(0,4)};
      }
      if(out.decision==='KAUFEN'&&!potential.density?.verified){out.decision='VERTIEFEN';out.decisionClass='check';out.reason='Wirtschaftlichkeit ist attraktiv, aber das Baupotenzial ist noch nicht durch eine belastbare Nutzungsziffer verifiziert.';}
      if(out.decision==='KAUFEN'&&potential.theoretical&&potential.gfa>potential.theoretical*1.05){out.decision='VERTIEFEN';out.decisionClass='check';out.reason='Die angesetzte BGF überschreitet die rechnerisch ableitbare BGF. Baurecht und mögliche Bonus-/Sonderregelungen zuerst verifizieren.';}
      return out;
    };
    wrapped.__buildPotential21=true;calculate=wrapped;
  }

  function wrapPreview(){
    if(typeof updatePreview!=='function'||updatePreview.__buildPotential21)return;
    const base=updatePreview;
    const wrapped=function(){base();renderPotential();};wrapped.__buildPotential21=true;updatePreview=wrapped;
  }

  function wrapExisting(){
    if(typeof populateExisting!=='function'||populateExisting.__buildPotential21)return;
    const base=populateExisting;
    const wrapped=function(item){const r=base(item);setTimeout(()=>{if($('densityRatio'))$('densityRatio').value=item?.densityRatio||'';if($('densitySource'))$('densitySource').value=item?.densitySource||'unknown';renderPotential(item)},40);return r;};wrapped.__buildPotential21=true;populateExisting=wrapped;
  }

  function wrapMarket(){
    if(typeof window.openMarketOpportunity!=='function'||window.openMarketOpportunity.__buildPotential21)return;
    const base=window.openMarketOpportunity;
    const wrapped=function(item){const r=base(item);setTimeout(()=>{if($('densityRatio'))$('densityRatio').value='';if($('densitySource'))$('densitySource').value='unknown';renderPotential()},120);return r;};wrapped.__buildPotential21=true;window.openMarketOpportunity=wrapped;
  }

  function bindActions(){
    const use=$('usePotentialGfaBtn');if(use&&use.dataset.bound!=='1'){use.dataset.bound='1';use.addEventListener('click',()=>{const v=Number(use.dataset.gfa)||0;if(!v)return;if($('gfa'))$('gfa').value=Math.round(v);if(typeof updatePreview==='function')updatePreview();});}
    ['area','gfa','sellable','densityRatio','densitySource','region','strategy'].forEach(id=>{const el=$(id);if(el&&el.dataset.potentialBound!=='1'){el.dataset.potentialBound='1';el.addEventListener('input',()=>setTimeout(renderPotential,0));el.addEventListener('change',()=>setTimeout(renderPotential,0));}});
    const add=$('addBtn');if(add&&add.dataset.potentialNewBound!=='1'){add.dataset.potentialNewBound='1';add.addEventListener('click',()=>setTimeout(()=>{if(typeof editingId!=='undefined'&&editingId)return;if($('gfa'))$('gfa').value='';if($('sellable'))$('sellable').value='';if($('densityRatio'))$('densityRatio').value='';if($('densitySource'))$('densitySource').value='unknown';if(typeof updatePreview==='function')updatePreview();},40));}
    const observer=new MutationObserver(()=>renderPotential());const a=$('officialDataResult'),o=$('oerebResult');if(a)observer.observe(a,{childList:true,subtree:true});if(o)observer.observe(o,{childList:true,subtree:true});
  }

  function setVersion(){
    const apply=()=>{const b=$('versionBadge');if(b)b.textContent='Beta 0.21 · Baupotenzial';const side=$('appVersion');if(side)side.textContent='Beta 0.21';};
    apply();window.addEventListener('load',()=>setTimeout(apply,0),{once:true});
  }

  function install(){injectStyles();injectInputs();wrapFormData();wrapCalculate();wrapPreview();wrapExisting();wrapMarket();bindActions();setVersion();renderPotential();if(typeof render==='function')render();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
