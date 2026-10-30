// Epistolarium – deine Briefe an dich selbst.
(() => {
  'use strict';

  // ---------- Speicher ----------
  const hasNative = typeof window.Native !== 'undefined';
  const DEFAULT_SETTINGS = { name: 'Franky', names: ['Rebecca', 'Daniel'], model: 'claude-opus-5-5', calm: false, reminder: { on: false, days: 14, time: '19:00' } };
  let S = { version: 1, letters: [], pending: [], reviews: [], goals: [], settings: { ...DEFAULT_SETTINGS } };

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
    if (!S.settings.reminder) S.settings.reminder = { on: false, days: 14, time: '19:00' };
    if (!Array.isArray(S.goals)) S.goals = [];
  }
  function save() {
    const json = JSON.stringify(S);
    let ok = true;
    try { ok = hasNative ? Native.saveData(json) : (localStorage.setItem('epistolarium', json), true); } catch (e) { ok = false; }
    if (ok === false) toast('Speichern hat nicht geklappt!');
    syncNative();
    if (hasNative && Native.getAutoBackup) maybeAutoBackup();
  }
  function autoBackupInfo() {
    try { return hasNative && Native.getAutoBackup ? JSON.parse(Native.getAutoBackup()) : {}; } catch (e) { return {}; }
  }
  function fmtWhen(ms) {
    const t = new Date(ms), now = new Date();
    const time = t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (t.toDateString() === now.toDateString()) return 'heute, ' + time + ' Uhr';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (t.toDateString() === y.toDateString()) return 'gestern, ' + time + ' Uhr';
    return t.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + time + ' Uhr';
  }
  // Nur sichern, wenn sich Briefe oder Rückblicke wirklich geändert haben
  let contentSig = null, backupTimer = null;
  function sig() {
    const str = JSON.stringify([S.letters, S.reviews]);
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return str.length + ':' + h;
  }
  function maybeAutoBackup() {
    const now = sig();
    if (contentSig === null) { contentSig = now; return; }
    if (now === contentSig) return;
    contentSig = now;
    if (!autoBackupInfo().on) return;
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => Native.autoBackupNow(), 8000);
  }
  window.onAutoBackup = ok => {
    if (!ok) toast('Sicherung nach Drive hat nicht geklappt.', 4000);
    if (tab === 'settings' && !stack.length) render();
  };

  function lastLetterDate() { return S.letters.map(l => l.date).filter(Boolean).sort().pop() || ''; }
  function syncNative() {
    if (!hasNative || !Native.syncState) return;
    const r = S.settings.reminder || {};
    try {
      Native.syncState(JSON.stringify({
        remOn: !!r.on, remDays: r.days || 14, remTime: r.time || '19:00', lastLetter: lastLetterDate(),
        quotes: Inspire.QUOTES.map(q => q.t + (q.a ? ' – ' + q.a : '')), prompts: Inspire.PROMPTS,
      }));
    } catch (e) {}
  }
  function daysUntilDue() {
    const r = S.settings.reminder || {};
    if (!r.on) return null;
    const base = lastLetterDate() || r.since || today();
    const due = d(base); due.setDate(due.getDate() + (r.days || 14));
    return Math.round((due - d(today())) / 86400000);
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
  const UNSURE_RE = /([^\s\[\]]*\s?\[\?\])/g;
  const highlightUnsure = s => esc(s).replace(UNSURE_RE, '<span class="unsure">$1</span>');
  const backdropUnsure = s => esc(s).replace(UNSURE_RE, '<mark>$1</mark>') + '\n ';

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
    goals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
    warnSmall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.3"/></svg>',
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
      html = `<div class="view sub">${({ letter: viewLetter, edit: viewEdit, reviewText: viewReviewText, goal: viewGoal })[top.type](top)}</div>`;
    } else {
      const gear = tab === 'settings' ? '' : `<button class="iconbtn gear" data-tab="settings" aria-label="Einstellungen">${I.settings}</button>`;
      html = `<div class="view">${gear}${({ letters: viewHome, goals: viewGoals, collect: viewCollect, review: viewReview, settings: viewSettings })[tab]()}</div>`;
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
    $('#nav').innerHTML = b('letters', 'Briefe') + b('goals', 'Ziele') +
      `<button class="add" data-act="add" aria-label="Brief hinzufügen">${I.plus}</button>` +
      b('collect', 'Sammlung') + b('review', 'Rückblick');
  }

  function go(t) { tab = t; stack.length = 0; render(); }
  function push(page) { stack.push(page); dirty = false; render(); }
  function pop() { stack.pop(); dirty = false; render(); }

  window.handleBack = () => {
    if (document.body.classList.contains('locked')) return false;
    if (closeOverlay()) return true;
    if (stack.length) {
      const top = stack[stack.length - 1];
      if ((top.type === 'edit' || top.type === 'goal') && dirty) {
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

  function goalNudge() {
    const open = S.goals.filter(g => g.status !== 'done' && goalLevel(g).key !== 'success');
    if (!open.length) return '';
    const g = open[Math.floor(Date.now() / 86400000) % open.length];
    const lv = goalLevel(g);
    return `<div class="imp" data-act="openGoal" data-id="${g.id}"><span>Dein Ziel</span>„${esc(g.title)}“ ist noch ${lv.key === 'intent' ? 'ein' : 'eine'} ${lv.name}. <b style="color:var(--gold);font-weight:500">${lv.next} ›</b></div>`;
  }

  function viewHome() {
    const q = query.trim().toLowerCase();
    const letters = S.letters.slice().sort(byDateDesc).filter(l => !q || matches(l, q));
    let h = `<div class="brand"><img class="logo" src="logo.png" alt=""><h1>epistolarium</h1><div class="sub">Briefe an dich selbst</div></div>`;
    h += `<div class="search">${I.search}<input id="q" type="search" placeholder="In deinen Briefen suchen" value="${esc(query)}" autocomplete="off"></div>`;

    if (!apiKey() && !S.letters.length) {
      h += `<div class="card" style="margin-top:22px">
        <div class="month" style="margin-top:0">Willkommen</div>
        <p style="margin:0 0 10px">Scanne einen Brief mit Adobe Scan und teile das PDF mit Epistolarium. Claude schreibt ihn ab und ordnet ihn für dich ein.</p>
        <p class="muted" style="margin:0 0 16px">Dafür brauchst du einmalig einen API-Schlüssel von Anthropic.</p>
        <button class="btn primary block" data-act="tab" data-tab="settings">Schlüssel eintragen</button>
        <button class="btn block" style="margin-top:10px" data-act="import">Sicherung importieren</button></div>`;
    }

    if (!q && (S.letters.length || apiKey())) {
      const qd = Inspire.quoteOfDay();
      const pr = Inspire.promptOfDay(S.letters, fmtShort);
      const left = daysUntilDue();
      let status = '';
      if (left !== null) status = left <= 0 ? '<div class="due">Zeit für einen neuen Brief</div>'
        : `<div class="due soft">Nächster Brief ${left === 1 ? 'morgen' : 'in ' + left + ' Tagen'}</div>`;
      h += `<div class="card inspire">${status}<div class="q">„${esc(qd.t)}“</div>${qd.a ? `<div class="qa">${esc(qd.a)}</div>` : ''}
        <div class="imp"><span>${pr.own ? 'Aus deinen Briefen' : 'Impuls für deinen Brief'}</span>${esc(pr.text)}</div>${goalNudge()}</div>`;
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
      else if (!S.pending.length) h += `<div class="empty"><div class="big">Noch keine Briefe</div><p>Tippe auf das Plus, um deinen ersten Brief abzulegen.</p><p class="muted">Oder teile ein PDF direkt aus Adobe Scan.</p><button class="btn" style="margin-top:14px" data-act="import">Sicherung importieren</button></div>`;
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

    if (l.summary) h += `<div class="note"><div class="note-label">Zusammenfassung</div><div class="handwriting">${esc(l.summary)}</div></div>`;
    h += listSection('Entscheidungen', l, 'decisions');
    h += listSection('Empfehlungen', l, 'recommendations');
    h += listSection('Geistesblitze', l, 'insights');
    const lg = S.goals.filter(g => g.letterId === l.id);
    if (lg.length) h += `<h3 class="section">Ziele &amp; Visionen</h3><div class="card"><ul class="items">${lg.map(g => {
      const lv = goalLevel(g);
      return `<li data-act="openGoal" data-id="${g.id}">${I.goals.replace('<svg', '<svg class="dot"')}<div class="txt">${esc(g.title)}<div class="meta"><span class="lvl lvl-${lv.key}">${lv.name}</span></div></div></li>`;
    }).join('')}</ul></div>`;

    h += `<h3 class="section">Der Brief</h3>`;
    if (l.pages) h += `<div class="seg" style="margin-bottom:14px"><button data-act="mode" data-mode="text" class="${mode === 'text' ? 'on' : ''}">Abschrift</button><button data-act="mode" data-mode="pdf" class="${mode === 'pdf' ? 'on' : ''}">Original</button></div>`;
    if (mode === 'pdf' && l.pages) {
      h += `<div class="pages">${Array.from({ length: l.pages }, (_, i) => `<img src="${pageUrl(l.id, i + 1)}" data-act="viewer" data-id="${l.id}" loading="lazy" alt="Seite ${i + 1}">`).join('')}</div>`;
    } else {
      if (l.uncertain) h += `<button class="unsure-chip" data-act="jumpUnsure">${I.warnSmall} ${l.uncertain} unsichere ${l.uncertain === 1 ? 'Stelle' : 'Stellen'} · zeigen</button>`;
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
    if (src.uncertain) h += `<div class="warn">${src.uncertain} ${src.uncertain === 1 ? 'Stelle ist' : 'Stellen sind'} unsicher und unten im Text farbig markiert. Vergleiche sie kurz mit dem Original.<button class="btn small" data-act="nextUnsure">Zur ersten Stelle</button></div>`;
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
      <label class="field"><span>Brieftext</span></label>
      <div class="hl-wrap"><div class="input letter-text hl-back" aria-hidden="true">${backdropUnsure(src.text)}</div><textarea class="input letter-text hl-text" data-f="text" spellcheck="false">${esc(src.text)}</textarea></div>
      <div class="unsure-bar" id="unsureBar">${src.uncertain ? `<button class="unsure-chip" data-act="nextUnsure">${I.warnSmall}<span>Nächste unsichere Stelle (${src.uncertain})</span></button>` : ''}</div>
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
    const newGoals = addGoals(data.goals || [], page.id);
    save();
    dirty = false;
    stack.length = 0;
    if (newGoals) setTimeout(() => toast(`${newGoals} ${newGoals === 1 ? 'neues Ziel' : 'neue Ziele'} unter „Ziele“`), 2800);
    tab = 'letters';
    push({ type: 'letter', id: page.id });
    toast(page.mode === 'review' ? 'Im Archiv abgelegt' : 'Gespeichert');
  }

  // ---------- Sammlung ----------
  // ---------- Ziele: Ziel + Deadline + Plan + Aktion = Erfolg ----------
  const LEVELS = {
    fantasy: { key: 'fantasy', name: 'Fantasie', formula: 'Ziel ohne Deadline', text: 'Ein schöner Gedanke, aber ohne Termin bleibt er ein Traum. Gib ihm eine Deadline.', next: 'Deadline festlegen' },
    intent: { key: 'intent', name: 'Vorhaben', formula: 'Ziel + Deadline', text: 'Du weißt, was und bis wann. Jetzt fehlt der Weg dorthin: ein Plan.', next: 'Plan machen' },
    strategy: { key: 'strategy', name: 'Strategie', formula: 'Ziel + Deadline + Plan', text: 'Der Weg steht. Was fehlt, ist die erste konkrete Aktion.', next: 'Aktion festlegen' },
    success: { key: 'success', name: 'Erfolg', formula: 'Ziel + Deadline + Plan + Aktion', text: 'Alles da. Jetzt heißt es: tun. Erledige deine Aktion und leg dann die nächste fest.', next: '' },
  };
  function goalLevel(g) {
    if (!g.deadline) return LEVELS.fantasy;
    if (!g.plan) return LEVELS.intent;
    if (!g.action) return LEVELS.strategy;
    return LEVELS.success;
  }
  const stepsOf = g => [!!g.title, !!g.deadline, !!g.plan, !!g.action];
  function addGoals(list, letterId) {
    let n = 0;
    list.forEach(g => {
      const t = (g.title || '').trim();
      if (!t || S.goals.some(x => x.title.toLowerCase() === t.toLowerCase())) return;
      S.goals.push({ id: uid(), title: t, deadline: g.deadline || '', plan: g.plan || '', action: g.action || '', actionDone: false,
        status: 'active', letterId: letterId || '', createdAt: Date.now() });
      n++;
    });
    return n;
  }
  function deadlineInfo(g) {
    if (!g.deadline) return '';
    const days = Math.round((d(g.deadline) - d(today())) / 86400000);
    if (g.status === 'done') return `Deadline war ${fmtShort(g.deadline)}`;
    if (days < 0) return `<span class="late">Deadline überschritten seit ${-days} ${days === -1 ? 'Tag' : 'Tagen'}</span>`;
    if (days === 0) return '<span class="late">Deadline ist heute</span>';
    return `bis ${fmtShort(g.deadline)} · noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`;
  }
  let goalFilter = 'active';
  let showFormula = true;

  function formulaCard() {
    const row = (lv, parts) => `<div class="f-row"><div class="f-parts">${parts.map(x => `<span class="f-p ${x ? '' : 'off'}">${x || ''}</span>`).join('')}</div><span class="lvl lvl-${lv.key}">${lv.name}</span></div>`;
    return `<div class="card formula"><div class="f-head" data-act="toggleFormula"><span>Die Erfolgsformel</span><span class="muted">${showFormula ? 'ausblenden' : 'anzeigen'}</span></div>
      ${showFormula ? `<div class="f-rows">
        ${row(LEVELS.success, ['Ziel', 'Deadline', 'Plan', 'Aktion'])}
        ${row(LEVELS.strategy, ['Ziel', 'Deadline', 'Plan', ''])}
        ${row(LEVELS.intent, ['Ziel', 'Deadline', '', ''])}
        ${row(LEVELS.fantasy, ['Ziel', '', '', ''])}
      </div><p class="muted" style="font-size:13.5px;margin:14px 0 0">Eine Vision wird erst zum Erfolg, wenn sie einen Termin, einen Weg und einen ersten Schritt hat. Bei jedem Ziel siehst du, was noch fehlt.</p>` : ''}</div>`;
  }

  function goalCard(g) {
    const lv = goalLevel(g);
    const st = stepsOf(g);
    const labels = ['Ziel', 'Deadline', 'Plan', 'Aktion'];
    let foot = '';
    if (g.status === 'done') foot = '<div class="g-next done">Erreicht</div>';
    else if (lv.next) foot = `<div class="g-next">Nächster Schritt: <b>${lv.next}</b></div>`;
    else if (g.actionDone) foot = '<div class="g-next">Aktion erledigt. <b>Leg die nächste fest</b></div>';
    else foot = `<div class="g-next">Jetzt: <b>${esc(g.action)}</b></div>`;
    return `<div class="card goal ${g.status === 'done' ? 'is-done' : ''}" data-act="openGoal" data-id="${g.id}">
      <div class="g-top"><span class="lvl lvl-${lv.key}">${g.status === 'done' ? 'Erreicht' : lv.name}</span><span class="g-dl">${deadlineInfo(g)}</span></div>
      <div class="g-title">${esc(g.title)}</div>
      <div class="track">${st.map((on, i) => `<div class="tr ${on ? 'on' : ''}"><i></i><span>${labels[i]}</span></div>`).join('')}</div>
      ${foot}</div>`;
  }

  function viewGoals() {
    let h = `<div class="brand"><img class="logo small" src="logo.png" alt=""><h1 style="font-size:28px;text-transform:none">Ziele</h1><div class="sub">Vom Traum zum Erfolg</div></div>`;
    h += formulaCard();
    const active = S.goals.filter(g => g.status !== 'done');
    const done = S.goals.filter(g => g.status === 'done');
    h += `<div class="row" style="margin:16px 0 4px"><button class="btn" data-act="newGoal">${I.plus} Neues Ziel</button>
      <button class="btn" data-act="findGoals" id="findGoalsBtn">${I.sparkle} In Briefen suchen</button></div>`;
    h += `<div class="presets" style="margin-top:14px"><button data-act="gfilter" data-k="active" class="${goalFilter === 'active' ? 'on' : ''}">Aktiv (${active.length})</button>
      <button data-act="gfilter" data-k="done" class="${goalFilter === 'done' ? 'on' : ''}">Erreicht (${done.length})</button></div>`;
    const order = { success: 0, strategy: 1, intent: 2, fantasy: 3 };
    const list = (goalFilter === 'done' ? done : active).slice().sort((a, b) =>
      (a.deadline || '9999').localeCompare(b.deadline || '9999') || order[goalLevel(a).key] - order[goalLevel(b).key]);
    if (!list.length) {
      h += `<div class="empty"><p>${goalFilter === 'done' ? 'Noch kein Ziel als erreicht markiert.' : 'Noch keine Ziele. Leg eins an oder lass Claude in deinen Briefen danach suchen.'}</p></div>`;
      return h;
    }
    return h + list.map(goalCard).join('');
  }

  function viewGoal(page) {
    const g = page.draft;
    const lv = goalLevel(g);
    const src = S.letters.find(l => l.id === g.letterId);
    let h = `<div class="topbar"><button class="iconbtn" data-act="back">${I.back}</button><h2></h2></div>`;
    h += `<div class="detail-head"><div class="date">${g.status === 'done' ? 'Erreicht' : 'Stufe: ' + lv.name}</div><h1>${esc(g.title || 'Neues Ziel')}</h1></div>`;
    h += `<div class="card lvl-border-${lv.key}"><div class="track big">${stepsOf(g).map((on, i) => `<div class="tr ${on ? 'on' : ''}"><i></i><span>${['Ziel', 'Deadline', 'Plan', 'Aktion'][i]}</span></div>`).join('')}</div>
      <p style="margin:14px 0 0"><b style="font-weight:500">${lv.formula} = ${lv.name}.</b> ${lv.text}</p></div>`;
    if (page.hint) h += `<div class="ok" style="margin-top:12px">${esc(page.hint)}</div>`;
    h += `<div style="margin-top:20px">
      <label class="field"><span>Ziel</span><input class="input" data-g="title" value="${esc(g.title)}" placeholder="Was willst du erreichen?"></label>
      <label class="field"><span>Deadline</span><input class="input" type="date" data-g="deadline" value="${esc(g.deadline)}"></label>
      <label class="field"><span>Plan</span><textarea class="input" data-g="plan" rows="5" placeholder="Die Etappen dorthin, eine pro Zeile">${esc(g.plan)}</textarea></label>
      <label class="field"><span>Nächste Aktion</span><input class="input" data-g="action" value="${esc(g.action)}" placeholder="Was tust du als Nächstes, ganz konkret?"></label>
      ${g.action ? `<div class="toggle" style="margin:-4px 4px 18px"><span class="muted">Aktion erledigt</span><button class="switch ${g.actionDone ? 'on' : ''}" data-act="actionDone" aria-label="Aktion erledigt"></button></div>` : ''}
      <button class="btn block" data-act="planWithClaude" id="planBtn">${I.sparkle} Mit Claude vervollständigen</button>
      <div class="hint" style="margin-top:8px">Claude schlägt vor, was fehlt. Du kannst alles anpassen, bevor du speicherst.</div>
      ${src ? `<p class="muted" style="font-size:13px">Aus deinem Brief vom <a href="#" data-act="open" data-id="${src.id}">${fmtShort(src.date)}</a></p>` : ''}
      <div class="actions"><button class="btn primary block" data-act="saveGoal">Speichern</button>
      ${S.goals.some(x => x.id === g.id) ? `<button class="btn block" data-act="goalDone">${g.status === 'done' ? 'Wieder aktiv setzen' : 'Ziel erreicht'}</button>
      <button class="btn block danger" data-act="deleteGoal">${I.trash} Löschen</button>` : ''}</div></div>`;
    return h;
  }
  function readGoalForm(page) {
    const v = f => { const el = $(`[data-g="${f}"]`); return el ? el.value.trim() : ''; };
    const g = page.draft;
    const action = v('action');
    return { ...g, title: v('title'), deadline: v('deadline'), plan: v('plan'), action, actionDone: action === g.action ? g.actionDone : false };
  }
  function saveGoal(close = true) {
    const page = stack[stack.length - 1];
    const g = readGoalForm(page);
    if (!g.title) { toast('Wie heißt dein Ziel?'); return false; }
    page.draft = g;
    const i = S.goals.findIndex(x => x.id === g.id);
    if (i >= 0) S.goals[i] = { ...g, updatedAt: Date.now() }; else S.goals.push({ ...g, createdAt: Date.now() });
    save();
    dirty = false;
    if (close) { pop(); toast(goalLevel(g).key === 'success' ? 'Gespeichert. Jetzt: tun!' : 'Gespeichert'); }
    return true;
  }
  async function planWithClaude() {
    if (!requireKey()) return;
    const page = stack[stack.length - 1];
    page.draft = readGoalForm(page);
    if (!page.draft.title) { toast('Schreib zuerst dein Ziel hin.'); return; }
    const b = $('#planBtn');
    b.disabled = true; b.innerHTML = '<span class="spinner light"></span> Claude denkt mit …';
    try {
      const src = S.letters.find(l => l.id === page.draft.letterId);
      const r = await Claude.suggestPlan(page.draft, src ? src.text : '', S.settings);
      const g = page.draft;
      if (!g.deadline && r.deadline) g.deadline = r.deadline;
      if (!g.plan && r.plan) g.plan = r.plan;
      if ((!g.action || g.actionDone) && r.action) { g.action = r.action; g.actionDone = false; }
      page.hint = (r.hint ? r.hint + ' ' : '') + 'Prüf die Vorschläge und tipp auf Speichern.';
      dirty = true;
      render();
    } catch (e) { toast(e.message, 5000); b.disabled = false; b.innerHTML = I.sparkle + ' Mit Claude vervollständigen'; }
  }
  async function findGoals() {
    if (!requireKey()) return;
    if (!S.letters.length) { toast('Noch keine Briefe da.'); return; }
    const b = $('#findGoalsBtn');
    b.disabled = true; b.innerHTML = '<span class="spinner light"></span> Sucht …';
    try {
      const found = await Claude.extractGoals(S.letters.slice().sort((a, c) => (a.date || '').localeCompare(c.date || '')), S.settings);
      let n = 0;
      found.forEach(g => {
        const l = S.letters.find(x => x.date === g.letterDate);
        n += addGoals([g], l ? l.id : '');
      });
      save(); render();
      toast(n ? `${n} ${n === 1 ? 'Ziel' : 'Ziele'} gefunden` : 'Keine neuen Ziele in deinen Briefen gefunden', 4000);
    } catch (e) { toast(e.message, 5000); render(); }
  }

  function viewCollect() {
    const labels = { decisions: 'Entscheidungen', recommendations: 'Empfehlungen', insights: 'Geistesblitze' };
    let h = `<div class="brand"><img class="logo small" src="logo.png" alt=""><h1 style="font-size:28px;text-transform:none">Sammlung</h1><div class="sub">Was deine Briefe dir sagen</div><div class="orn"></div></div>`;
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
    let h = `<div class="brand"><img class="logo small" src="logo.png" alt=""><h1 style="font-size:28px;text-transform:none">Rückblick</h1><div class="sub">Was sich über die Zeit zeigt</div><div class="orn"></div></div>`;
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
    let h = `<div class="brand"><img class="logo small" src="logo.png" alt=""><h1 style="font-size:28px;text-transform:none">Einstellungen</h1><div class="orn"></div></div>`;
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
    const r = s.reminder || { on: false, days: 14, time: '19:00' };
    const left = daysUntilDue();
    h += `<h3 class="section">Erinnerung</h3><div class="card"><div class="toggle"><div><b style="font-weight:500">An meinen Brief erinnern</b><div class="muted" style="font-size:13px">Mit einem Impuls und einem Gedanken für den Tag</div></div>
      <button class="switch ${r.on ? 'on' : ''}" data-act="reminder" aria-label="Erinnerung"></button></div>
      ${r.on ? `<div class="row" style="margin-top:16px"><label class="field"><span>Turnus</span><select class="input" id="remDays">
        ${[[7, 'Jede Woche'], [14, 'Alle 2 Wochen'], [21, 'Alle 3 Wochen'], [28, 'Alle 4 Wochen']].map(([v, t]) => `<option value="${v}" ${r.days === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label><label class="field"><span>Uhrzeit</span><input class="input" type="time" id="remTime" value="${esc(r.time)}"></label></div>
        <div class="hint" style="margin-top:-4px">Gezählt wird ab deinem letzten Brief. Schreibst du früher, verschiebt sich die Erinnerung von selbst. Wenn du noch nicht dazu gekommen bist, erinnere ich dich alle zwei Tage sanft noch einmal.${left !== null ? `<br><b style="color:var(--gold);font-weight:500">${left <= 0 ? 'Dein nächster Brief ist fällig.' : 'Nächster Brief ' + (left === 1 ? 'morgen' : 'in ' + left + ' Tagen') + '.'}</b>` : ''}</div>
        <button class="btn" data-act="testReminder">Test-Erinnerung senden</button>` : ''}</div>`;
    const lockOn = hasNative && Native.getLockEnabled() && Native.canLock();
    h += `<h3 class="section">Datenschutz</h3><div class="card"><div class="toggle"><div><b style="font-weight:500">Sperre mit Fingerabdruck</b><div class="muted" style="font-size:13px">Beim Öffnen und nach einer Minute im Hintergrund. Klappt der Fingerabdruck nicht, geht auch deine PIN.</div></div>
      <button class="switch ${lockOn ? 'on' : ''}" data-act="lock" aria-label="Sperre mit Fingerabdruck"></button></div></div>`;
    h += `<h3 class="section">Darstellung</h3><div class="card"><div class="toggle"><div><b style="font-weight:500">Ruhiger Modus</b><div class="muted" style="font-size:13px">Langsamerer Rauch, weniger Effekte, schont den Akku</div></div>
      <button class="switch ${s.calm ? 'on' : ''}" data-act="calm" aria-label="Ruhiger Modus"></button></div></div>`;
    const ab = autoBackupInfo();
    h += `<h3 class="section">Sicherung</h3><div class="card">
      <div class="toggle"><div><b style="font-weight:500">Automatisch in Google Drive sichern</b><div class="muted" style="font-size:13px">Nach jeder Änderung, mit allen Briefen und Originalen</div></div>
      <button class="switch ${ab.on ? 'on' : ''}" data-act="autoBackup" aria-label="Automatische Sicherung"></button></div>
      ${ab.on ? `<div class="backup-state ${ab.error ? 'bad' : ''}">${ab.error ? esc(ab.error)
        : `Datei: <b>${esc(ab.name || 'Epistolarium-Sicherung.zip')}</b><br>Zuletzt gesichert: ${ab.last ? fmtWhen(ab.last) : 'noch nie'}`}</div>
        <div class="row" style="margin-top:12px"><button class="btn" data-act="autoNow" id="autoNowBtn">Jetzt sichern</button><button class="btn" data-act="autoPick">Ordner ändern</button></div>` : ''}
      <div style="border-top:1px solid var(--line);margin:18px 0 14px"></div>
      <p style="margin:0 0 14px" class="muted">Von Hand sichern oder eine Sicherung importieren, zum Beispiel aus Google Drive auf ein neues Handy. Beim Import kommen nur fehlende Briefe dazu, nichts wird überschrieben.</p>
      <div class="row"><button class="btn" data-act="export">Sicherung speichern</button><button class="btn" data-act="import">Importieren</button></div></div>`;
    h += `<p class="muted center" style="font-size:12.5px;margin-top:30px">Epistolarium · ${S.letters.length} ${S.letters.length === 1 ? 'Brief' : 'Briefe'}<br>Deine Briefe gehen nur zum Abschreiben an Claude${ab.on ? ' und als Sicherung in dein Google Drive' : ''}.</p>`;
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
      toast(added ? `${added} ${added === 1 ? 'Brief' : 'Briefe'} importiert` : 'Alle Briefe waren schon da');
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
  function drivePickSheet() {
    if (!hasNative) return;
    const sh = sheet(`<h3>Sicherung in Google Drive</h3>
      <p>Gleich öffnet sich die Dateiauswahl. So wählst du den Ordner:</p>
      <ol class="steps"><li>Oben links auf das Menü <b>☰</b> tippen</li><li><b>Drive</b> wählen und in deinen Wunsch-Ordner gehen. Mit dem Ordner-Symbol oben kannst du auch einen neuen anlegen.</li><li>Unten auf <b>Speichern</b> tippen</li></ol>
      <p class="muted" style="font-size:13px">Danach sichert die App nach jeder Änderung von selbst in diesen Ordner. Du brauchst dafür die Google-Drive-App auf dem Handy.</p>
      <button class="btn primary block" id="go">Ordner auswählen</button>`);
    $('#go', sh).onclick = () => { closeOverlay(); Native.chooseAutoBackup(); };
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
    document.querySelectorAll('#app [data-f], #app [data-g]').forEach(el => el.addEventListener('input', () => { dirty = true; }));
    const ta = $('.hl-text'), back = $('.hl-back');
    if (ta && back) {
      const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      const sync = () => {
        back.innerHTML = backdropUnsure(ta.value);
        const n = (ta.value.match(/\[\?\]/g) || []).length;
        const bar = $('#unsureBar');
        if (bar) bar.innerHTML = n ? `<button class="unsure-chip" data-act="nextUnsure">${I.warnSmall}<span>Nächste unsichere Stelle (${n})</span></button>` : '<div class="ok-small">Keine unsicheren Stellen mehr</div>';
        grow();
      };
      ta.addEventListener('input', sync);
      requestAnimationFrame(grow);
    }
    const rem = $('#remTime');
    if (rem) rem.onchange = () => { S.settings.reminder.time = rem.value || '19:00'; save(); render(); };
    const remDays = $('#remDays');
    if (remDays) remDays.onchange = () => { S.settings.reminder.days = +remDays.value; save(); render(); };
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
      case 'lock': {
        if (!hasNative) break;
        const want = !(Native.getLockEnabled() && Native.canLock());
        if (want && !Native.canLock()) { toast('Richte zuerst in den Android-Einstellungen eine Displaysperre mit Fingerabdruck oder PIN ein.', 5000); break; }
        Native.setLockEnabled(want);
        toast(want ? 'Sperre ist an' : 'Sperre ist aus');
        render(); break;
      }
      case 'openGoal': {
        const g = S.goals.find(x => x.id === id);
        if (g) push({ type: 'goal', id, draft: { ...g } });
        break;
      }
      case 'newGoal': { const nid = uid(); push({ type: 'goal', id: nid, draft: { id: nid, title: '', deadline: '', plan: '', action: '', actionDone: false, status: 'active', letterId: '' } }); break; }
      case 'saveGoal': saveGoal(); break;
      case 'planWithClaude': planWithClaude(); break;
      case 'findGoals': findGoals(); break;
      case 'gfilter': goalFilter = el.dataset.k; render(); break;
      case 'toggleFormula': showFormula = !showFormula; render(); break;
      case 'actionDone': {
        top.draft = readGoalForm(top);
        top.draft.actionDone = !top.draft.actionDone;
        const on = top.draft.actionDone;
        if (saveGoal(false)) { render(); toast(on ? 'Stark! Was ist die nächste Aktion?' : 'Wieder offen'); }
        break;
      }
      case 'goalDone': {
        top.draft = readGoalForm(top);
        top.draft.status = top.draft.status === 'done' ? 'active' : 'done';
        if (top.draft.status === 'done') top.draft.doneAt = Date.now();
        const reached = top.draft.status === 'done';
        if (saveGoal(false)) { pop(); toast(reached ? `Ziel erreicht. Glückwunsch, ${S.settings.name || 'Franky'}!` : 'Wieder aktiv'); }
        break;
      }
      case 'deleteGoal':
        confirmSheet('Ziel löschen?', 'Das Ziel verschwindet aus deiner Liste.', 'Löschen', () => { S.goals = S.goals.filter(x => x.id !== top.id); save(); dirty = false; pop(); });
        break;
      case 'jumpUnsure': {
        const spans = [...document.querySelectorAll('.paper .unsure')];
        if (!spans.length) break;
        jumpIdx = (jumpIdx + 1) % spans.length;
        spans.forEach(x => x.classList.remove('flash'));
        const sp = spans[jumpIdx];
        sp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        void sp.offsetWidth; sp.classList.add('flash');
        break;
      }
      case 'nextUnsure': nextUnsure(); break;
      case 'reminder': {
        const r = S.settings.reminder;
        if (r.on) { r.on = false; save(); render(); toast('Erinnerung ist aus'); break; }
        const enable = () => { r.on = true; r.since = today(); save(); render(); toast('Erinnerung ist an'); };
        if (!hasNative || Native.canNotify()) { enable(); break; }
        window.onNotifPermission = ok => { if (ok) enable(); else toast('Ohne Erlaubnis für Benachrichtigungen kann ich dich nicht erinnern. Du findest sie in den Android-Einstellungen der App.', 6000); };
        Native.requestNotify();
        break;
      }
      case 'autoBackup': {
        if (autoBackupInfo().on) {
          confirmSheet('Automatische Sicherung ausschalten?', 'Die Datei in Google Drive bleibt erhalten, wird aber nicht mehr aktualisiert.', 'Ausschalten', () => { Native.disableAutoBackup(); render(); toast('Automatische Sicherung ist aus'); });
          break;
        }
        drivePickSheet();
        break;
      }
      case 'autoPick': drivePickSheet(); break;
      case 'autoNow': {
        const b = $('#autoNowBtn');
        if (b) { b.disabled = true; b.innerHTML = '<span class="spinner light"></span> Sichert …'; }
        Native.autoBackupNow();
        break;
      }
      case 'testReminder': if (hasNative) { Native.testReminder(); toast('Test-Erinnerung gesendet'); } break;
      case 'unlock': $('#lockMsg').textContent = ''; if (hasNative) Native.unlock(); break;
      case 'export': if (hasNative) Native.exportBackup('Epistolarium-Sicherung-' + today() + '.zip'); break;
      case 'import': if (hasNative) { Native.importBackup(); } break;
    }
  });

  function applyCalm() {
    document.body.classList.toggle('calm', !!S.settings.calm);
    if (window.Smoke) window.Smoke.setCalm(S.settings.calm);
  }

  let jumpIdx = -1;
  function nextUnsure() {
    const ta = $('.hl-text');
    if (!ta) return;
    const v = ta.value;
    const from = ta.selectionEnd || 0;
    let i = v.indexOf('[?]', from);
    if (i < 0) i = v.indexOf('[?]');
    if (i < 0) { toast('Keine unsicheren Stellen mehr'); return; }
    let st = i;
    while (st > 0 && v[st - 1] === ' ') st--;
    while (st > 0 && !/\s/.test(v[st - 1])) st--;
    const marks = [...document.querySelectorAll('.hl-back mark')];
    const idx = (v.slice(0, i).match(/\[\?\]/g) || []).length;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(st, i + 3);
    const m = marks[idx];
    if (m) setTimeout(() => m.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  }

  // ---------- Sperre ----------
  const lockEl = document.createElement('div');
  lockEl.id = 'lock';
  lockEl.innerHTML = `<div class="lock-inner"><img class="logo" src="logo.png" alt=""><h1>epistolarium</h1><div class="sub">Deine Briefe sind geschützt</div>
    <button class="fp" data-act="unlock" aria-label="Entsperren"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v3a8 8 0 0 0 1.5 4.6"/><path d="M8.5 9.5A3.5 3.5 0 0 1 15.5 11v2a12 12 0 0 0 .8 4.2"/><path d="M6 17.5A10 10 0 0 1 5 13v-2a7 7 0 0 1 11.6-5.3"/><path d="M19 9.2c.6 1.1 1 2.4 1 3.8v.5"/><path d="M9 21a14 14 0 0 1-1.5-6.5V11"/></svg></button>
    <div class="hint-lock">Zum Entsperren tippen</div><div id="lockMsg" class="lock-msg"></div></div>`;
  document.body.append(lockEl);
  window.setLocked = v => {
    document.body.classList.toggle('locked', !!v);
    if (v) { closeOverlay(); $('#lockMsg').textContent = ''; }
  };
  window.onUnlockFailed = msg => { $('#lockMsg').textContent = msg || ''; };

  // ---------- Start ----------
  if (hasNative && Native.isLocked()) window.setLocked(true);
  load();
  applyCalm();
  render();
  syncNative();
  contentSig = sig();
  if (hasNative) Native.ready();
  processQueue();
  window.__S = () => S; // für Tests
})();
