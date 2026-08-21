const ACCURACY_VERSION='0.18';

(function () {
  const SPECIAL_KEYS = [
    'demolition','hazard','contamination','ground','excavation','retrofit',
    'utilities','externalWorks','finance','marketing','otherSpecial'
  ];

  function clampValue(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function chf(value) {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency', currency: 'CHF', maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function qualityLabel(score) {
    if (score >= 80) return 'hoch';
    if (score >= 60) return 'mittel';
    return 'niedrig';
  }

  function assessDataQuality(item) {
    let score = 0;
    const gaps = [];

    if (Number(item.area) > 0) score += 4;
    if (Number(item.gfa) > 0) score += 6;
    if (Number(item.sellable) > 0) score += 5;
    if (item.geometrySource) score += 5;
    else gaps.push('BGF/Baupotenzial noch nicht verifiziert');

    if (Number(item.saleM2) > 0) score += 9;
    if (item.sourceUrl || item.source) score += 5;
    else gaps.push('Originalquelle zum Objekt fehlt');
    if (item.marketAddress || item.siteAddress) score += 3;
    if (item.marketNote) score += 3;

    if (Number(item.buildM2) > 0) score += 8;
    if (item.costBasis === 'verified') score += 15;
    else if (item.costBasis === 'detailed') score += 10;
    else {
      score += 5;
      gaps.push('Kosten sind erst grob geschätzt');
    }
    if (item.costSource) score += 2;
    else gaps.push('Kostenquelle fehlt');

    const locationConfidence = Number(item.locationAnalysis?.confidence || 0);
    if (locationConfidence > 0) score += Math.round(Math.min(20, locationConfidence * 0.20));
    else gaps.push('Standort noch nicht automatisch geprüft');

    if (Number(item.planning) > 0) score += 5;
    if (Number(item.risk) > 0) score += 4;
    if (item.strategy && item.strategy !== 'Offen / Vorprüfung') score += 3;
    else gaps.push('Projektart noch offen');
    score += 1;

    score = Math.round(clampValue(score));
    return {
      score,
      label: qualityLabel(score),
      gaps: [...new Set(gaps)].slice(0, 4)
    };
  }

  function calculateScenario(item, saleFactor, buildFactor, specialFactor) {
    const land = Number(item.price) || 0;
    const gfa = Number(item.gfa) || 0;
    const sellable = Number(item.sellable) || 0;
    const saleM2 = (Number(item.saleM2) || 0) * saleFactor;
    const buildM2 = (Number(item.buildM2) || 0) * buildFactor;
    const build = gfa * buildM2;
    const soft = build * ((Number(item.softPct) || 0) / 100);
    const reserve = build * ((Number(item.reservePct) || 0) / 100);
    const acquisition = land * ((Number(item.acqPct) || 0) / 100);
    const special = SPECIAL_KEYS.reduce((sum, key) => sum + (Number(item[key]) || 0), 0) * specialFactor;
    const invest = land + acquisition + build + soft + reserve + special;
    const revenue = sellable * saleM2;
    const profit = revenue - invest;
    const margin = invest ? (profit / invest) * 100 : 0;
    return { invest, revenue, profit, margin };
  }

  function scoreModel(base, item) {
    const location = item.locationAnalysis;
    const locationUsable = Number(location?.confidence || 0) >= 60 && Number(location?.score || 0) > 0;
    const parts = {
      economy: clampValue((Number(base.margin) + 5) * 4),
      market: clampValue(50 + Number(base.marketBuffer || 0) * 2),
      location: locationUsable ? clampValue(location.score) : 50,
      planning: clampValue(Number(item.planning) || 50),
      architecture: clampValue(Number(item.architecture) || 60),
      risk: clampValue(Number(item.risk) || 50)
    };
    const score = Math.round(
      parts.economy * 0.30 +
      parts.market * 0.15 +
      parts.location * 0.25 +
      parts.planning * 0.10 +
      parts.architecture * 0.10 +
      parts.risk * 0.10
    );
    return { score, parts, locationUsable };
  }

  if (typeof calculate === 'function') {
    const previousCalculate = calculate;

    calculate = function (item) {
      const base = previousCalculate(item);
      if (base.invest == null) return base;

      const quality = assessDataQuality(item);
      const model = scoreModel(base, item);
      const scenarios = {
        conservative: calculateScenario(item, 0.90, 1.10, 1.10),
        realistic: calculateScenario(item, 1.00, 1.00, 1.00),
        optimistic: calculateScenario(item, 1.05, 0.97, 0.95)
      };

      const locationScore = Number(item.locationAnalysis?.score || 0);
      const locationConfidence = Number(item.locationAnalysis?.confidence || 0);
      let decision = 'VERTIEFEN';
      let decisionClass = 'check';
      let reason = 'Die Erstprüfung ist interessant. Annahmen gezielt vertiefen.';

      if (base.margin < 8 || base.marketBuffer < 0 || model.score < 50) {
        decision = 'NICHT KAUFEN';
        decisionClass = 'no';
        reason = 'Wirtschaftlichkeit, Marktpuffer oder Gesamtscore sind aktuell zu schwach.';
      } else if (locationConfidence >= 60 && locationScore > 0 && locationScore < 40) {
        decision = 'NICHT KAUFEN';
        decisionClass = 'no';
        reason = 'Der geprüfte Standort ist für die vorgesehene Nutzung zu schwach.';
      } else if (scenarios.conservative.margin < 5) {
        reason = 'Das Basisszenario ist interessant, reagiert aber empfindlich auf schlechtere Markt- oder Baukostenannahmen.';
      } else if (quality.score < 70) {
        reason = `Wirtschaftlich interessant, aber Datenqualität erst ${quality.score}/100. Grundlagen vor Kaufentscheid absichern.`;
      } else if (!model.locationUsable) {
        reason = 'Wirtschaftlichkeit ist interessant, aber die Standortdaten sind noch nicht belastbar genug.';
      } else if ((item.costBasis || 'rough') !== 'verified') {
        reason = 'Standort und Wirtschaftlichkeit sind interessant; Kosten vor Kaufentscheid verifizieren.';
      } else if (
        model.score >= 70 && base.margin >= 15 && base.marketBuffer >= 8 &&
        scenarios.conservative.margin >= 8 && locationScore >= 65
      ) {
        decision = 'KAUFEN';
        decisionClass = 'buy';
        reason = 'Wirtschaftlichkeit, Standort, Kostengrundlage und Stress-Szenario sind für die Erstentscheidung belastbar.';
      }

      return {
        ...base,
        score: model.score,
        decision,
        decisionClass,
        reason,
        dataQuality: quality,
        scoreParts: model.parts,
        scenarios,
        locationScore: locationScore || base.locationScore || null,
        locationConfidence: locationConfidence || base.locationConfidence || 0
      };
    };
  }

  function addStyles() {
    if (document.getElementById('accuracyStyles')) return;
    const style = document.createElement('style');
    style.id = 'accuracyStyles';
    style.textContent = `
      .accuracy-panel{margin-top:14px;border:1px solid #dfe7f2;background:#fff;border-radius:13px;padding:14px}
      .accuracy-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
      .accuracy-head h4{margin:0;color:#173d63}
      .accuracy-quality{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:900;background:#eef5ff;color:#315d92}
      .accuracy-parts,.scenario-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:11px}
      .accuracy-part,.scenario-card{background:#f6f8fb;border-radius:9px;padding:9px}
      .accuracy-part span,.scenario-card span{display:block;font-size:9px;color:#7a8594}
      .accuracy-part strong,.scenario-card strong{display:block;margin-top:3px;font-size:12px;color:#223148}
      .accuracy-note{margin-top:10px;padding:9px 10px;border-radius:9px;background:#f7f9fc;color:#536177;font-size:10px;line-height:1.45}
      @media(max-width:650px){.accuracy-head{align-items:flex-start;flex-direction:column}.accuracy-parts,.scenario-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function renderAccuracyPanel() {
    const target = document.getElementById('previewCalc');
    if (!target || typeof formData !== 'function' || typeof calculate !== 'function') return;
    target.querySelector('.accuracy-panel')?.remove();
    const result = calculate(formData());
    if (result.invest == null || !result.dataQuality) return;

    const p = result.scoreParts;
    const s = result.scenarios;
    const q = result.dataQuality;
    const rows = [
      ['Wirtschaftlichkeit', p.economy, '30 %'],
      ['Markt', p.market, '15 %'],
      ['Standort', p.location, '25 %'],
      ['Baurecht', p.planning, '10 %'],
      ['Architektur', p.architecture, '10 %'],
      ['Risiko', p.risk, '10 %']
    ];

    const panel = document.createElement('div');
    panel.className = 'accuracy-panel';
    panel.innerHTML = `
      <div class="accuracy-head">
        <div><h4>Entscheidungsqualität</h4><small>Score, Datenqualität und Stress-Szenario zusammen betrachtet.</small></div>
        <span class="accuracy-quality">Datenqualität ${q.score}/100 · ${q.label}</span>
      </div>
      <div class="accuracy-parts">
        ${rows.map(row => `<div class="accuracy-part"><span>${row[0]} · ${row[2]}</span><strong>${Math.round(row[1])}/100</strong></div>`).join('')}
      </div>
      <div class="scenario-grid">
        <div class="scenario-card"><span>Konservativ</span><strong>${s.conservative.margin.toFixed(1)} % Marge</strong><small>Verkauf −10 % · Bau +10 %</small></div>
        <div class="scenario-card"><span>Realistisch</span><strong>${s.realistic.margin.toFixed(1)} % Marge</strong><small>Gewinn ${chf(s.realistic.profit)}</small></div>
        <div class="scenario-card"><span>Optimistisch</span><strong>${s.optimistic.margin.toFixed(1)} % Marge</strong><small>Verkauf +5 % · Bau −3 %</small></div>
      </div>
      <div class="accuracy-note"><strong>${result.decision}</strong> · ${result.reason}${q.gaps.length ? `<br><strong>Noch absichern:</strong> ${q.gaps.join(' · ')}` : ''}</div>
    `;
    target.appendChild(panel);
  }

  if (typeof updatePreview === 'function') {
    const previousPreview = updatePreview;
    updatePreview = function () {
      previousPreview();
      renderAccuracyPanel();
    };
  }

  function setVersionLabel() {
    const version = document.getElementById('versionBadge');
    if (version) version.textContent = 'Beta 0.18 · Genauigkeit';
    const side = document.getElementById('appVersion');
    if (side) side.textContent = 'Beta 0.18';
  }

  function install() {
    addStyles();
    setVersionLabel();
    renderAccuracyPanel();
    if (typeof render === 'function') render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
