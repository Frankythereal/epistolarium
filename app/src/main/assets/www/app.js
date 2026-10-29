// Epistolarium – deine Briefe an dich selbst.
(() => {
  'use strict';

  // ---------- Speicher ----------
  const hasNative = typeof window.Native !== 'undefined';
  const DEFAULT_SETTINGS = { name: 'Franky', names: ['Rebecca', 'Daniel'], model: 'claude-opus-5-5', calm: false };
  let S = { version: 1, letters: [], pending: [], reviews: [], settings: { ...DEFAULT_SETTINGS } };

  function load() {
    let raw = '';
    try { raw = hasNative ? Native.loadData() : (localStorage.getItem('epistolarium') || ''); } catch (e) {}
    if (raw) {
      try {
        const d = JSON.parse(raw);
        S = { ...S, ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } };
      } catch (e) { toast('Die gespeicherten Daten konnten nicht gelesen werden.'); }
    }
    // Abschriften, die beim letzten Schließen noch liefen, neu anstoßen
    S.pending.forEach(p => { if (p.status === 'working') p.status = 'queued'; });
  }
  function save() {
    const json = JSON.stringify(S);
    let ok = true;
    try { ok = hasNative ? Native.saveData(json) : (localStorage.setItem('epistolarium', json), true); } catch (e) { ok = false; }
    if (ok === false) toast('Speichern hat nicht geklappt!');
  }
  const apiKey = () => { try { return hasNative ? Native.getSecret('apiKey') : (localStorage.getItem('apiKey') || ''); } catch (e) { return ''; } };
  const setApiKey = v => { try { hasNative ? Native.setSecret('apiKey', v) : localStorage.setItem('apiKey', v); } catch (e) {} };

  // ---------- Hilfen ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const today = () => new Date().toISOString().slice(0, 10);
  const d = s => new Date((s || today()) + 'T12:00:00');
  const fmtLong = s => s ? d(s).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'ohne Datum';
  const fmtShort = s => s ? d(s).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'ohne Datum';
  const monthName = s => d(s).toLocaleDateString('de-DE', { month: 'long' });
  const weekday = s => d(s).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
  const pageUrl = (id, n) => `letter/${id}/p${n}.jpg`;
  const highlightUnsure = s => esc(s).replace(/([^\s\[\]]*\s?\[\?\])/g, '<span class="unsure">$1</span>');

  const I = {
    letters: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5 12 13l8.5-6.5"/></svg>',
    collect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 5.2L20 9l-4.3 3.8L17 18.5 12 15.6 7 18.5l1.3-5.7L4 9l5.8-.8z"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 14h8M8 17h5"/></svg>',
    paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6M11 8v6"/></svg>',
    quill: '<svg class="quill" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M27 4C17 6 10 13 8 24c5-1 9-3 12-6-2 0-3.5-.3-4.5-1 3 0 5.5-1.5 7.5-4-1.5.2-3 0-4-.5 3-1 6-4 8-8.5z"/><path d="M8 24l-3 4"/></svg>',
    decision: '<svg class="dot" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4h11l-2 4 2 4H5"/></svg>',
    insight: '<svg class="dot" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    seal: '<svg class="quill" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="6"/></svg>',
    warn: '<svg class="quill" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M16 5 3 27h26z"/><path d="M16 13v7M16 24v.5"/></svg>',
  };

  // ---------- Navigation ----------
  let tab = 'letters';
  const stack = [];           // Unterseiten: {type, ...}
  let query = '';
  let collectTab = 'recommendations';
  let collectFilter = 'open';
  let reviewRange = { preset: '3m' };
  let dirty = false;

  function render() {
    const app = $('#app');
    const top = stack[stack.length - 1];
    document.body.classList.toggle('sub-open', !!top);
    let html;
    if (top) {
      html = `<div class="view sub">${({ letter: viewLetter, edit: viewEdit, reviewText: viewReviewText })[top.type](top)}</div>`;
    } else {
      html = `<div class="view">${({ letters: viewHome, collect: viewCollect, review: viewReview, settings: viewSettings })[tab]()}</div>`;
    }
    const keepScroll = app.firstElementChild && app.dataset.key === key();
    const scroll = keepScroll ? app.firstElementChild.scrollTop : 0;
    app.innerHTML = html;
    app.dataset.key = key();
    if (keepScroll) app.firstElementChild.scrollTop = scroll;
    renderNav();
    bindAfterRender();
  }
  const key = () => { const t = stack[stack.length - 1]; return t ? t.type + ':' + (t.id || '') : tab; };

  function renderNav() {
    const b = (id, label) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${I[id]}<span>${label}</span></button>`;
    $('#nav').innerHTML = b('letters', 'Briefe') + b('collect', 'Sammlung') +
      `<button class="add" data-act="add" aria-label="Brief hinzufügen">${I.plus}</button>` +
      b('review', 'Rückblick') + b('settings', 'Einstellungen');
  }

  function go(t) { tab = t; stack.length = 0; render(); }
  function push(page) { stack.push(page); dirty = false; render(); }
  function pop() { stack.pop(); dirty = false; render(); }

  window.handleBack = () => {
    if (closeOverlay()) return true;
    if (stack.length) {
      const top = stack[stack.length - 1];
      if (top.type === 'edit' && dirty) {
        confirmSheet('Änderungen verwerfen?', 'Was du hier geändert hast, geht verloren.', 'Verwerfen', () => pop());
        return true;
      }
      pop(); return true;
    }
    if (tab !== 'letters') { go('letters'); return true; }
    return false;
  };

  // ---------- Startseite ----------
  function matches(l, q) {
    const hay = [l.title, l.mood, l.summary, l.text, (l.themes || []).join(' '),
      ...(l.decisions || []).map(x => x.text), ...(l.recommendations || []).map(x => x.text), ...(l.insights || []).map(x => x.text)]
      .join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }
  function snippet(l, q) {
    const w = q.split(/\s+/)[0];
    const t = (l.text || '').replace(/\s+/g, ' ');
    const i = t.toLowerCase().indexOf(w);
    if (i < 0) return esc(l.summary);
    const start = Math.max(0, i - 50);
    const part = (start ? '… ' : '') + t.slice(start, i + w.length + 80) + ' …';
    return esc(part).replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
  }

  function viewHome() {
    const q = query.trim().toLowerCase();
    const letters = S.letters.slice().sort(byDateDesc).filter(l => !q || matches(l, q));
    let h = `<div class="brand"><h1>Epistolarium</h1><div class="sub">Briefe an dich selbst</div><div class="orn"></div></div>`;
    h += `<div class="search">${I.search}<input id="q" type="search" placeholder="In deinen Briefen suchen" value="${esc(query)}" autocomplete="off"></div>`;

    if (!apiKey() && !S.letters.length) {
      h += `<div class="card" style="margin-top:22px">
        <div class="month" style="margin-top:0">Willkommen</div>
        <p style="margin:0 0 10px">Scanne einen Brief mit Adobe Scan und teile das PDF mit Epistolarium. Claude schreibt ihn ab und ordnet ihn für dich ein.</p>
        <p class="muted" style="margin:0 0 16px">Dafür brauchst du einmalig einen API-Schlüssel von Anthropic.</p>
        <button class="btn primary block" data-act="tab" data-tab="settings">Schlüssel eintragen</button></div>`;
    }

    if (S.pending.length && !q) {
      h += `<h3 class="section">In Arbeit</h3>`;
      S.pending.forEach(p => {
        const st = {
          queued: ['writing', I.quill, 'Wartet …'],
          working: ['writing', I.quill, `Claude liest deine Handschrift … (${p.pages} ${p.pages === 1 ? 'Seite' : 'Seiten'})`],
          review: ['', I.seal, 'Abschrift fertig, tippen zum Prüfen'],
          error: ['error', I.warn, esc(p.error || 'Fehler')],
          nokey: ['error', I.warn, 'Kein API-Schlüssel eingetragen'],
        }[p.status] || ['', I.seal, p.status];
        const title = p.draft && p.draft.title ? esc(p.draft.title) : (p.dateHint ? 'Brief vom ' + fmtShort(p.dateHint) : 'Neuer Brief');
        h += `<div class="card pending ${st[0]}" data-act="pending" data-id="${p.id}">${st[1]}<div class="ptext"><div class="ptitle">${title}</div><div class="pinfo">${st[2]}</div></div></div>`;
      });
    }

    if (!letters.length) {
      if (q) h += `<div class="empty"><div class="big">Nichts gefunden</div><p>Kein Brief enthält „${esc(query)}“.</p></div>`;
      else if (!S.pending.length) h += `<div class="empty"><div class="big">Noch keine Briefe</div><p>Tippe auf das Plus, um deinen ersten Brief abzulegen.</p><p class="muted">Oder teile ein PDF direkt aus Adobe Scan.</p></div>`;
      return h;
    }

    if (q) h += `<div class="month">${letters.length} ${letters.length === 1 ? 'Brief' : 'Briefe'} gefunden</div>`;
    let yr = null, mo = null;
    letters.forEach(l => {
      const y = l.date ? l.date.slice(0, 4) : '—', m = l.date ? l.date.slice(0, 7) : '';
      if (!q && y !== yr) { h += `<div class="year">${y}</div>`; yr = y; mo = null; }
      if (!q && m !== mo) { h += `<div class="month">${l.date ? monthName(l.date) : 'ohne Datum'}</div>`; mo = m; }
      h += `<div class="card letter" data-act="open" data-id="${l.id}">
        <div class="day"><b>${l.date ? +l.date.slice(8) : '?'}</b><span>${l.date ? (q ? fmtShort(l.date).replace(/^\d+\.\s*/, '') : weekday(l.date)) : ''}</span></div>
        <div class="body"><div class="title">${esc(l.title || 'Ohne Titel')}</div>
        ${l.mood ? `<div class="mood">${esc(l.mood)}</div>` : ''}
        <div class="sum">${q ? snippet(l, q) : esc(l.summary)}</div>
        ${(l.themes || []).length ? `<div class="chips">${l.themes.slice(0, 4).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
        </div></div>`;
    });
    return h;
  }

  // ---------- Brief ansehen ----------
  function viewLetter(page) {
    const l = S.letters.find(x => x.id === page.id);
    if (!l) return '<div class="empty">Brief nicht gefunden.</div>';
    const mode = page.mode || 'text';
    let h = `<div class="topbar"><button class="iconbtn" data-act="back">${I.back}</button><h2></h2>
      <button class="iconbtn" data-act="edit" data-id="${l.id}" aria-label="Bearbeiten">${I.edit}</button></div>`;
    h += `<div class="detail-head"><div class="date">${fmtLong(l.date)}</div><h1>${esc(l.title || 'Ohne Titel')}</h1>
      ${l.mood ? `<div class="mood">${esc(l.mood)}</div>` : ''}
      ${(l.themes || []).length ? `<div class="chips" style="margin-top:14px">${l.themes.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}</div>`;

    if (l.summary) h += `<div class="card"><div class="summary">${esc(l.summary)}</div></div>`;
    h += listSection('Entscheidungen', l, 'decisions');
    h += listSection('Empfehlungen', l, 'recommendations');
    h += listSection('Geistesblitze', l, 'insights');

    h += `<h3 class="section">Der Brief</h3>`;
    if (l.pages) h += `<div class="seg" style="margin-bottom:14px"><button data-act="mode" data-mode="text" class="${mode === 'text' ? 'on' : ''}">Abschrift</button><button data-act="mode" data-mode="pdf" class="${mode === 'pdf' ? 'on' : ''}">Original</button></div>`;
    if (mode === 'pdf' && l.pages) {
      h += `<div class="pages">${Array.from({ length: l.pages }, (_, i) => `<img src="${pageUrl(l.id, i + 1)}" data-act="viewer" data-id="${l.id}" loading="lazy" alt="Seite ${i + 1}">`).join('')}</div>`;
    } else {
      h += `<div class="paper selectable">${highlightUnsure(l.text || '')}</div>`;
      if (l.uncertain) h += `<p class="muted center" style="font-size:13px;margin-top:12px">${l.uncertain} unsichere ${l.uncertain === 1 ? 'Stelle ist' : 'Stellen sind'} markiert. Über den Stift oben kannst du sie korrigieren.</p>`;
    }
    h += `<div class="actions">${l.pages && hasNative ? `<button class="btn" data-act="redo" data-id="${l.id}">${I.redo} Neu abschreiben</button>` : ''}
      <button class="btn danger" data-act="delete" data-id="${l.id}">${I.trash} Löschen</button></div>`;
    return h;
  }

  function listSection(title, l, key) {
    const items = l[key] || [];
    if (!items.length) return '';
    return `<h3 class="section">${title}</h3><div class="card"><ul class="items">${items.map((it, i) => itemRow(l, key, it, i, false)).join('')}</ul></div>`;
  }
  function itemRow(l, key, it, i, withMeta) {
    const meta = withMeta ? `<div class="meta">${fmtShort(l.date)} · ${esc(l.title)}</div>` : '';
    if (key === 'recommendations') {
      return `<li class="${it.done ? 'done' : ''}"><button class="check" data-act="toggle" data-id="${l.id}" data-i="${i}" aria-label="Erledigt">${I.check}</button>
        <div class="txt" ${withMeta ? `data-act="open" data-id="${l.id}"` : ''}>${esc(it.text)}${meta}</div></li>`;
    }
    return `<li>${key === 'decisions' ? I.decision : I.insight}<div class="txt" ${withMeta ? `data-act="open" data-id="${l.id}"` : ''}>${esc(it.text)}${meta}</div></li>`;
  }

  // ---------- Bearbeiten / Abschrift prüfen ----------
  function viewEdit(page) {
    const src = page.draft;
    const isReview = page.mode === 'review';
    const mode = page.view || 'form';
    let h = `<div class="topbar"><button class="iconbtn" data-act="back">${I.back}</button><h2>${isReview ? 'Abschrift prüfen' : 'Bearbeiten'}</h2></div>`;
    if (page.pages) h += `<div class="seg" style="margin-bottom:18px"><button data-act="eview" data-v="form" class="${mode === 'form' ? 'on' : ''}">Abschrift</button><button data-act="eview" data-v="pdf" class="${mode === 'pdf' ? 'on' : ''}">Original</button></div>`;
    if (mode === 'pdf') {
      h += `<div class="pages">${Array.from({ length: page.pages }, (_, i) => `<img src="${pageUrl(page.id, i + 1)}" data-act="viewer" data-id="${page.id}" alt="">`).join('')}</div>`;
      h += `<button class="btn block" data-act="eview" data-v="form">Zurück zur Abschrift</button>`;
      return h;
    }
    if (isReview && src.uncertain) h += `<div class="warn">${src.uncertain} ${src.uncertain === 1 ? 'Stelle ist' : 'Stellen sind'} mit [?] markiert. Vergleiche sie kurz mit dem Original.</div>`;
    if (isReview && !src.date) h += `<div class="warn">Im Brief steht kein Datum. Bitte trag es unten ein.</div>`;
    h += `<label class="field"><span>Datum</span><input class="input" type="date" data-f="date" value="${esc(src.date)}"></label>
      <label class="field"><span>Titel</span><input class="input" data-f="title" value="${esc(src.title)}"></label>
      <div class="row"><label class="field"><span>Stimmung</span><input class="input" data-f="mood" value="${esc(src.mood)}"></label></div>
      <label class="field"><span>Themen</span><input class="input" data-f="themes" value="${esc((src.themes || []).join(', '))}"></label>
      <div class="hint">Durch Komma getrennt.</div>
      <label class="field"><span>Zusammenfassung</span><textarea class="input" data-f="summary" rows="4">${esc(src.summary)}</textarea></label>
      <label class="field"><span>Entscheidungen</span><textarea class="input" data-f="decisions" rows="3">${esc((src.decisions || []).map(x => x.text).join('\n'))}</textarea></label>
      <label class="field"><span>Empfehlungen</span><textarea class="input" data-f="recommendations" rows="3">${esc((src.recommendations || []).map(x => x.text).join('\n'))}</textarea></label>
      <label class="field"><span>Geistesblitze</span><textarea class="input" data-f="insights" rows="3">${esc((src.insights || []).map(x => x.text).join('\n'))}</textarea></label>
      <div class="hint">Bei den drei Listen gilt: ein Punkt pro Zeile.</div>
      <label class="field"><span>Brieftext</span><textarea class="input letter-text" data-f="text">${esc(src.text)}</textarea></label>
      <div class="actions"><button class="btn primary block" data-act="saveEdit">${isReview ? 'Im Archiv ablegen' : 'Speichern'}</button>
      ${isReview ? `<button class="btn block danger" data-act="discardPending" data-id="${page.id}">Verwerfen</button>` : ''}</div>`;
    return h;
  }

  function readForm(page) {
    const v = f => { const el = $(`[data-f="${f}"]`); return el ? el.value : ''; };
    const lines = f => v(f).split('\n').map(s => s.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
    const old = page.draft;
    const recDone = {};
    (old.recommendations || []).forEach(r => { recDone[r.text] = r; });
    const text = v('text').trim();
    return {
      ...old,
      date: v('date'),
      title: v('title').trim(),
      mood: v('mood').trim(),
      themes: v('themes').split(/[,;]/).map(s => s.trim()).filter(Boolean),
      summary: v('summary').trim(),
      decisions: lines('decisions').map(text => ({ text })),
      recommendations: lines('recommendations').map(text => recDone[text] ? { ...recDone[text], text } : { text, done: false }),
      insights: lines('insights').map(text => ({ text })),
      text,
      uncertain: (text.match(/\[\?\]/g) || []).length,
    };
  }

  function saveEdit() {
    const page = stack[stack.length - 1];
    const data = readForm(page);
    if (!data.date) { toast('Bitte gib ein Datum ein.'); $('[data-f="date"]').focus(); return; }
    if (!data.text) { toast('Der Brieftext ist leer.'); return; }
    if (!data.title) data.title = 'Brief vom ' + fmtShort(data.date);
    const now = Date.now();
    const i = S.letters.findIndex(l => l.id === page.id);
    if (i >= 0) {
      S.letters[i] = { ...S.letters[i], ...data, updatedAt: now };
    } else {
      S.letters.push({ ...data, id: page.id, pages: page.pages || 0, createdAt: now, updatedAt: now });
    }
    S.pending = S.pending.filter(p => p.id !== page.id);
    save();
    dirty = false;
    stack.length = 0;
    tab = 'letters';
    push({ type: 'letter', id: page.id });
    toast(page.mode === 'review' ? 'Im Archiv abgelegt' : 'Gespeichert');
  }

  // ---------- Sammlung ----------
  function viewCollect() {
    const labels = { decisions: 'Entscheidungen', recommendations: 'Empfehlungen', insights: 'Geistesblitze' };
    let h = `<div class="brand"><h1 style="font-size:36px">Sammlung</h1><div class="sub">Was deine Briefe dir sagen</div><div class="orn"></div></div>`;
    h += `<div class="seg">${Object.keys(labels).map(k => `<button data-act="ctab" data-k="${k}" class="${collectTab === k ? 'on' : ''}">${labels[k]}</button>`).join('')}</div>`;
    if (collectTab === 'recommendations') {
      const all = S.letters.flatMap(l => (l.recommendations || []));
      const open = all.filter(r => !r.done).length;
      h += `<div class="presets" style="margin-top:14px">
        <button data-act="cfilter" data-k="open" class="${collectFilter === 'open' ? 'on' : ''}">Offen (${open})</button>
        <button data-act="cfilter" data-k="done" class="${collectFilter === 'done' ? 'on' : ''}">Umgesetzt (${all.length - open})</button>
        <button data-act="cfilter" data-k="all" class="${collectFilter === 'all' ? 'on' : ''}">Alle</button></div>`;
    }
    let count = 0, body = '';
    S.letters.slice().sort(byDateDesc).forEach(l => {
      const rows = (l[collectTab] || []).map((it, i) => {
        if (collectTab === 'recommendations' && collectFilter !== 'all' && (collectFilter === 'done') !== !!it.done) return '';
        count++;
        return itemRow(l, collectTab, it, i, true);
      }).join('');
      body += rows;
    });
    if (!count) {
      const msg = { decisions: 'Noch keine ausdrücklichen Entscheidungen.', recommendations: collectFilter === 'done' ? 'Noch nichts als umgesetzt abgehakt.' : 'Keine offenen Empfehlungen.', insights: 'Noch keine Geistesblitze.' }[collectTab];
      return h + `<div class="empty"><p>${msg}</p></div>`;
    }
    return h + `<div class="card" style="margin-top:${collectTab === 'recommendations' ? 0 : 16}px"><ul class="items">${body}</ul></div>`;
  }

  // ---------- Rückblick ----------
  function rangeDates() {
    const t = new Date();
    const iso = x => x.toISOString().slice(0, 10);
    const back = (days) => { const x = new Date(t); x.setDate(x.getDate() - days); return iso(x); };
    switch (reviewRange.preset) {
      case '4w': return [back(28), iso(t)];
      case '3m': return [back(91), iso(t)];
      case 'y': return [t.getFullYear() + '-01-01', iso(t)];
      case 'all': {
        const ds = S.letters.map(l => l.date).filter(Boolean).sort();
        return [ds[0] || iso(t), iso(t)];
      }
      default: return [reviewRange.from || back(91), reviewRange.to || iso(t)];
    }
  }
  function lettersIn(from, to) { return S.letters.filter(l => l.date && l.date >= from && l.date <= to).sort((a, b) => a.date.localeCompare(b.date)); }

  function viewReview() {
    const [from, to] = rangeDates();
    const n = lettersIn(from, to).length;
    const p = (k, label) => `<button data-act="preset" data-k="${k}" class="${reviewRange.preset === k ? 'on' : ''}">${label}</button>`;
    let h = `<div class="brand"><h1 style="font-size:36px">Rückblick</h1><div class="sub">Was sich über die Zeit zeigt</div><div class="orn"></div></div>`;
    h += `<div class="card"><div class="presets">${p('4w', 'Letzte 4 Wochen')}${p('3m', 'Letzte 3 Monate')}${p('y', 'Dieses Jahr')}${p('all', 'Alles')}${p('custom', 'Eigener Zeitraum')}</div>`;
    if (reviewRange.preset === 'custom') {
      h += `<div class="row"><label class="field"><span>Von</span><input class="input" type="date" id="rfrom" value="${from}"></label><label class="field"><span>Bis</span><input class="input" type="date" id="rto" value="${to}"></label></div>`;
    }
    h += `<p class="muted" style="margin:0 0 14px">${fmtShort(from)} bis ${fmtShort(to)} · ${n} ${n === 1 ? 'Brief' : 'Briefe'}</p>
      <button class="btn primary block" data-act="makeReview" ${n ? '' : 'disabled'}>Rückblick schreiben lassen</button></div>`;
    if (S.reviews.length) {
      h += `<h3 class="section">Frühere Rückblicke</h3>`;
      S.reviews.slice().sort((a, b) => b.createdAt - a.createdAt).forEach(r => {
        h += `<div class="card letter" data-act="openReview" data-id="${r.id}"><div class="body"><div class="title">${fmtShort(r.from)} – ${fmtShort(r.to)}</div>
          <div class="mood">${r.count} ${r.count === 1 ? 'Brief' : 'Briefe'} · geschrieben am ${fmtShort(new Date(r.createdAt).toISOString().slice(0, 10))}</div></div></div>`;
      });
    }
    return h;
  }

  function md(text) {
    const out = [];
    let list = false;
    text.split('\n').forEach(line => {
      const l = line.trim();
      const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
      if (/^[-*•]\s+/.test(l)) {
        if (!list) { out.push('<ul>'); list = true; }
        out.push('<li>' + inline(l.replace(/^[-*•]\s+/, '')) + '</li>');
        return;
      }
      if (list) { out.push('</ul>'); list = false; }
      if (!l) return;
      if (/^#{1,6}\s/.test(l)) out.push('<h4>' + inline(l.replace(/^#+\s*/, '')) + '</h4>');
      else out.push('<p>' + inline(l) + '</p>');
    });
    if (list) out.push('</ul>');
    return out.join('');
  }

  function viewReviewText(page) {
    const r = S.reviews.find(x => x.id === page.id);
    if (!r) return '';
    return `<div class="topbar"><button class="iconbtn" data-act="back">${I.back}</button><h2></h2></div>
      <div class="detail-head"><div class="date">Rückblick</div><h1>${fmtShort(r.from)} – ${fmtShort(r.to)}</h1><div class="mood">${r.count} ${r.count === 1 ? 'Brief' : 'Briefe'}</div></div>
      <div class="card prose selectable">${md(r.text)}</div>
      <div class="actions"><button class="btn danger" data-act="deleteReview" data-id="${r.id}">${I.trash} Löschen</button></div>`;
  }

  async function makeReview() {
    if (!requireKey()) return;
    const [from, to] = rangeDates();
    const letters = lettersIn(from, to);
    const btn = $('[data-act="makeReview"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Claude liest deine Briefe …';
    try {
      const text = await Claude.review(letters, from, to, S.settings);
      const r = { id: uid(), from, to, count: letters.length, text, createdAt: Date.now() };
      S.reviews.push(r);
      save();
      push({ type: 'reviewText', id: r.id });
    } catch (e) {
      toast(e.message, 5000);
      render();
    }
  }

  // ---------- Einstellungen ----------
  function viewSettings() {
    const key = apiKey();
    const s = S.settings;
    let h = `<div class="brand"><h1 style="font-size:36px">Einstellungen</h1><div class="orn"></div></div>`;
    h += `<h3 class="section">Claude</h3><div class="card">
      <label class="field"><span>API-Schlüssel</span><input class="input" id="apikey" type="password" placeholder="sk-ant-…" value="${esc(key)}" autocomplete="off"></label>
      <div class="hint">Bekommst du in der <a href="#" data-act="ext" data-url="https://console.anthropic.com/settings/keys">Anthropic Console</a>. Er bleibt nur auf diesem Handy.</div>
      <label class="field"><span>Modell</span><select class="input" id="model">${Object.entries(Claude.MODELS).map(([k, v]) => `<option value="${k}" ${s.model === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <div class="row"><button class="btn" data-act="saveKey">Speichern</button><button class="btn" data-act="testKey">Verbindung testen</button></div>
      <div id="keyStatus" style="margin-top:14px"></div></div>`;
    h += `<h3 class="section">Deine Briefe</h3><div class="card">
      <label class="field"><span>Dein Name in der Anrede</span><input class="input" id="sname" value="${esc(s.name)}"></label>
      <label class="field"><span>Namen, die vorkommen können</span><input class="input" id="snames" value="${esc((s.names || []).join(', '))}"></label>
      <div class="hint">Hilft Claude, Namen in deiner Handschrift richtig zu lesen. Durch Komma getrennt.</div>
      <button class="btn" data-act="saveNames">Speichern</button></div>`;
    h += `<h3 class="section">Darstellung</h3><div class="card"><div class="toggle"><div><b style="font-weight:500">Ruhiger Modus</b><div class="muted" style="font-size:13px">Langsamerer Rauch, weniger Effekte, schont den Akku</div></div>
      <button class="switch ${s.calm ? 'on' : ''}" data-act="calm" aria-label="Ruhiger Modus"></button></div></div>`;
    h += `<h3 class="section">Sicherung</h3><div class="card">
      <p style="margin:0 0 14px" class="muted">Alle Briefe, Originale und Rückblicke in einer Datei. Speichere sie ab und zu, zum Beispiel in Google Drive.</p>
      <div class="row"><button class="btn" data-act="export">Sicherung speichern</button><button class="btn" data-act="import">Wiederherstellen</button></div></div>`;
    h += `<p class="muted center" style="font-size:12.5px;margin-top:30px">Epistolarium · ${S.letters.length} ${S.letters.length === 1 ? 'Brief' : 'Briefe'}<br>Deine Briefe werden nur zum Abschreiben an Claude geschickt und sonst nirgendwo gespeichert.</p>`;
    return h;
  }

  // ---------- Abschrift-Warteschlange ----------
  let busy = false;
  async function processQueue() {
    if (busy) return;
    const p = S.pending.find(x => x.status === 'queued');
    if (!p) return;
    if (!apiKey()) {
      S.pending.forEach(x => { if (x.status === 'queued') x.status = 'nokey'; });
      save(); refreshHome(); return;
    }
    busy = true;
    p.status = 'working'; save(); refreshHome();
    try {
      const hint = p.dateHint ? `Der Dateiname deutet auf den ${fmtLong(p.dateHint)} hin; nimm das als Datum, falls im Brief keins steht.` : '';
      const draft = await Claude.transcribe(p.id, S.settings, hint);
      if (!draft.date && p.dateHint) draft.date = p.dateHint;
      const cur = S.pending.find(x => x.id === p.id);
      if (cur) {
        cur.draft = draft; cur.status = 'review'; save();
        const onHome = !stack.length && tab === 'letters';
        if (cur.replaces) {
          openReview(cur);
        } else if (onHome && !S.pending.some(x => x.status === 'working' || x.status === 'queued')) {
          openReview(cur);
        } else {
          toast('Abschrift fertig: ' + (draft.title || 'neuer Brief'));
          refreshHome();
        }
      }
    } catch (e) {
      const cur = S.pending.find(x => x.id === p.id);
      if (cur) { cur.status = 'error'; cur.error = e.message; save(); refreshHome(); }
    }
    busy = false;
    processQueue();
  }
  function refreshHome() { if (!stack.length && tab === 'letters') render(); }
  function openReview(p) {
    stack.length = 0; tab = 'letters';
    const draft = { ...p.draft };
    const existing = p.replaces && S.letters.find(l => l.id === p.id);
    if (existing) {
      const done = new Set((existing.recommendations || []).filter(r => r.done).map(r => r.text));
      draft.recommendations = (draft.recommendations || []).map(r => ({ ...r, done: done.has(r.text) }));
      if (!draft.date) draft.date = existing.date;
    }
    push({ type: 'edit', mode: p.replaces ? 'edit' : 'review', id: p.id, pages: p.pages, draft });
    if (p.replaces) {
      // Neu abgeschriebener Brief: ersetzt den bestehenden erst beim Speichern
      S.pending = S.pending.filter(x => x.id !== p.id); save();
      toast('Neue Abschrift. Prüfen und speichern.');
    }
  }

  window.onPdfImported = r => {
    const dateHint = Claude.dateFromFileName(r.fileName);
    S.pending.push({ id: r.id, pages: r.pages, fileName: r.fileName, dateHint, status: 'queued', createdAt: Date.now() });
    save();
    closeOverlay();
    go('letters');
    processQueue();
  };
  window.onNativeError = msg => toast(msg, 5000);
  window.onSharedText = text => pasteSheet(text);
  window.onBackupDone = ok => toast(ok ? 'Sicherung gespeichert' : 'Sicherung fehlgeschlagen');
  window.onBackupRestored = raw => {
    if (!raw || raw === 'null') { toast('In der Datei war keine Sicherung.'); return; }
    try {
      const d = JSON.parse(raw);
      const ids = new Set(S.letters.map(l => l.id));
      let added = 0;
      (d.letters || []).forEach(l => { if (!ids.has(l.id)) { S.letters.push(l); added++; } });
      const rids = new Set(S.reviews.map(r => r.id));
      (d.reviews || []).forEach(r => { if (!rids.has(r.id)) S.reviews.push(r); });
      save(); go('letters');
      toast(added ? `${added} ${added === 1 ? 'Brief' : 'Briefe'} wiederhergestellt` : 'Alle Briefe waren schon da');
    } catch (e) { toast('Sicherung konnte nicht gelesen werden.'); }
  };

  function requireKey() {
    if (apiKey()) return true;
    toast('Trag zuerst deinen API-Schlüssel ein.');
    go('settings');
    return false;
  }

  // ---------- Overlays ----------
  function closeOverlay() {
    const o = document.querySelectorAll('.sheet-bg, .sheet, .viewer');
    if (!o.length) return false;
    o.forEach(x => x.remove());
    return true;
  }
  function sheet(html) {
    closeOverlay();
    const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.onclick = closeOverlay;
    const sh = document.createElement('div'); sh.className = 'sheet'; sh.innerHTML = '<div class="grab"></div>' + html;
    document.body.append(bg, sh);
    return sh;
  }
  function confirmSheet(title, text, label, fn) {
    const sh = sheet(`<h3>${esc(title)}</h3><p>${esc(text)}</p><button class="btn primary block" id="yes">${esc(label)}</button><button class="btn block" style="margin-top:10px" id="no">Abbrechen</button>`);
    $('#yes', sh).onclick = () => { closeOverlay(); fn(); };
    $('#no', sh).onclick = closeOverlay;
  }
  function addSheet() {
    const sh = sheet(`<h3>Brief hinzufügen</h3><p>Am schnellsten: In Adobe Scan auf „Teilen“ tippen und Epistolarium wählen.</p>
      <button class="opt" data-o="pdf">${I.pdf}<div><b>PDF auswählen</b><small>Ein oder mehrere gescannte Briefe</small></div></button>
      <button class="opt" data-o="paste">${I.paste}<div><b>Text einfügen</b><small>Abgetippter Brief oder ###BRIEF###-Text</small></div></button>`);
    $('[data-o="pdf"]', sh).onclick = () => { closeOverlay(); if (hasNative) Native.pickPdfs(); else toast('Nur in der App möglich.'); };
    $('[data-o="paste"]', sh).onclick = () => { let c = ''; try { c = hasNative ? Native.readClipboard() : ''; } catch (e) {} pasteSheet(c); };
  }
  function pasteSheet(text) {
    const sh = sheet(`<h3>Text einfügen</h3><p>Füge einen abgetippten Brief ein oder eine Antwort im ###BRIEF###-Format.</p>
      <textarea class="input letter-text" id="pasted" style="min-height:220px" placeholder="Lieber Franky, …">${esc(text || '')}</textarea>
      <div class="actions" style="margin-top:14px"><button class="btn primary block" id="useIt">Übernehmen</button></div>`);
    $('#useIt', sh).onclick = async () => {
      const raw = $('#pasted', sh).value.trim();
      if (!raw) { toast('Das Feld ist leer.'); return; }
      const parsed = Claude.parseBriefFormat(raw);
      if (parsed && parsed.text) {
        closeOverlay();
        push({ type: 'edit', mode: 'review', id: uid(), pages: 0, draft: parsed });
        return;
      }
      if (!requireKey()) { closeOverlay(); return; }
      const b = $('#useIt', sh);
      b.disabled = true; b.innerHTML = '<span class="spinner"></span> Claude wertet aus …';
      try {
        const draft = await Claude.analyzeText(raw, S.settings);
        closeOverlay();
        push({ type: 'edit', mode: 'review', id: uid(), pages: 0, draft });
      } catch (e) { toast(e.message, 5000); b.disabled = false; b.textContent = 'Übernehmen'; }
    };
  }
  function pendingSheet(p) {
    if (p.status === 'review') { openReview(p); return; }
    if (p.status === 'working' || p.status === 'queued') { toast('Claude liest noch. Das dauert meist unter einer Minute.'); return; }
    const sh = sheet(`<h3>Abschrift hat nicht geklappt</h3><p>${esc(p.status === 'nokey' ? 'Es ist noch kein API-Schlüssel eingetragen.' : p.error)}</p>
      <button class="btn primary block" id="retry">${p.status === 'nokey' ? 'Schlüssel eintragen' : 'Noch einmal versuchen'}</button>
      <button class="btn block" style="margin-top:10px" id="orig">Original ansehen</button>
      <button class="btn block danger" style="margin-top:10px" id="drop">Verwerfen</button>`);
    $('#retry', sh).onclick = () => {
      closeOverlay();
      if (p.status === 'nokey') { go('settings'); return; }
      p.status = 'queued'; p.error = ''; save(); render(); processQueue();
    };
    $('#orig', sh).onclick = () => viewer(p.id, p.pages);
    $('#drop', sh).onclick = () => { closeOverlay(); discardPending(p.id); };
  }
  function discardPending(id) {
    confirmSheet('Abschrift verwerfen?', 'Das gescannte PDF wird ebenfalls gelöscht.', 'Verwerfen', () => {
      S.pending = S.pending.filter(x => x.id !== id);
      if (hasNative && !S.letters.some(l => l.id === id)) Native.deleteLetterFiles(id);
      save(); dirty = false; stack.length = 0; go('letters');
    });
  }
  function viewer(id, pages) {
    closeOverlay();
    const v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = `<button class="iconbtn close">${I.close}</button><button class="iconbtn zoombtn">${I.zoom}</button>` +
      Array.from({ length: pages }, (_, i) => `<img src="${pageUrl(id, i + 1)}" alt="">`).join('');
    document.body.append(v);
    $('.close', v).onclick = closeOverlay;
    $('.zoombtn', v).onclick = () => v.classList.toggle('zoom');
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.append(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), ms);
  }

  // ---------- Klicks ----------
  function bindAfterRender() {
    const q = $('#q');
    if (q) q.oninput = () => {
      query = q.value;
      const pos = q.selectionStart;
      render();
      const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos);
    };
    document.querySelectorAll('#app [data-f]').forEach(el => el.addEventListener('input', () => { dirty = true; }));
    const rf = $('#rfrom'), rt = $('#rto');
    if (rf) rf.onchange = () => { reviewRange.from = rf.value; render(); };
    if (rt) rt.onchange = () => { reviewRange.to = rt.value; render(); };
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act], [data-tab]');
    if (!el) return;
    const act = el.dataset.act || 'tab';
    const id = el.dataset.id;
    const top = stack[stack.length - 1];
    switch (act) {
      case 'tab': go(el.dataset.tab); break;
      case 'add': addSheet(); break;
      case 'back': window.handleBack(); break;
      case 'open': push({ type: 'letter', id }); break;
      case 'pending': pendingSheet(S.pending.find(p => p.id === id)); break;
      case 'mode': top.mode = el.dataset.mode; render(); break;
      case 'eview':
        if (top.view !== 'pdf') top.draft = readForm(top);
        top.view = el.dataset.v; render(); break;
      case 'viewer': viewer(id, (S.letters.find(l => l.id === id) || top || {}).pages || 1); break;
      case 'edit': {
        const l = S.letters.find(x => x.id === id);
        push({ type: 'edit', mode: 'edit', id, pages: l.pages, draft: JSON.parse(JSON.stringify(l)) });
        break;
      }
      case 'saveEdit': saveEdit(); break;
      case 'discardPending': discardPending(id); break;
      case 'toggle': {
        const l = S.letters.find(x => x.id === id);
        const r = l.recommendations[+el.dataset.i];
        r.done = !r.done; r.doneAt = r.done ? Date.now() : null;
        l.updatedAt = Date.now(); save(); render();
        if (r.done) toast('Schön, abgehakt.');
        break;
      }
      case 'delete':
        confirmSheet('Brief löschen?', 'Abschrift und Original werden endgültig gelöscht.', 'Löschen', () => {
          S.letters = S.letters.filter(l => l.id !== id);
          if (hasNative) Native.deleteLetterFiles(id);
          save(); stack.length = 0; go('letters'); toast('Gelöscht');
        });
        break;
      case 'redo': {
        if (!requireKey()) break;
        const l = S.letters.find(x => x.id === id);
        confirmSheet('Neu abschreiben?', 'Claude liest das Original noch einmal. Deine bisherige Abschrift bleibt, bis du die neue speicherst.', 'Neu abschreiben', () => {
          S.pending = S.pending.filter(x => x.id !== id);
          S.pending.push({ id, pages: l.pages, dateHint: l.date, status: 'queued', replaces: true, createdAt: Date.now() });
          save(); stack.length = 0; go('letters'); processQueue();
        });
        break;
      }
      case 'ctab': collectTab = el.dataset.k; render(); break;
      case 'cfilter': collectFilter = el.dataset.k; render(); break;
      case 'preset': reviewRange.preset = el.dataset.k; render(); break;
      case 'makeReview': makeReview(); break;
      case 'openReview': push({ type: 'reviewText', id }); break;
      case 'deleteReview':
        confirmSheet('Rückblick löschen?', '', 'Löschen', () => { S.reviews = S.reviews.filter(r => r.id !== id); save(); pop(); });
        break;
      case 'ext': e.preventDefault(); if (hasNative) Native.openExternal(el.dataset.url); else window.open(el.dataset.url); break;
      case 'saveKey': {
        setApiKey($('#apikey').value.trim());
        S.settings.model = $('#model').value; save();
        toast('Gespeichert');
        S.pending.forEach(p => { if (p.status === 'nokey') p.status = 'queued'; });
        processQueue();
        break;
      }
      case 'testKey': {
        setApiKey($('#apikey').value.trim());
        S.settings.model = $('#model').value; save();
        const st = $('#keyStatus');
        st.innerHTML = '<span class="spinner light"></span>';
        Claude.ping(S.settings)
          .then(() => { st.innerHTML = '<div class="ok" style="margin:0">Verbindung klappt. Claude ist bereit.</div>'; S.pending.forEach(p => { if (p.status === 'nokey') p.status = 'queued'; }); processQueue(); })
          .catch(err => { st.innerHTML = `<div class="warn" style="margin:0">${esc(err.message)}</div>`; });
        break;
      }
      case 'saveNames':
        S.settings.name = $('#sname').value.trim() || 'Franky';
        S.settings.names = $('#snames').value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        save(); toast('Gespeichert'); break;
      case 'calm':
        S.settings.calm = !S.settings.calm; save(); applyCalm(); render(); break;
      case 'export': if (hasNative) Native.exportBackup('Epistolarium-Sicherung-' + today() + '.zip'); break;
      case 'import': if (hasNative) Native.importBackup(); break;
    }
  });

  function applyCalm() {
    document.body.classList.toggle('calm', !!S.settings.calm);
    if (window.Smoke) window.Smoke.setCalm(S.settings.calm);
  }

  // ---------- Start ----------
  load();
  applyCalm();
  render();
  if (hasNative) Native.ready();
  processQueue();
  window.__S = () => S; // für Tests
})();
