// Alles rund um Claude: Prompts, Anfragen, Auswertung der Antworten.
const Claude = (() => {
  const MODELS = {
    'claude-opus-5-5': 'Opus 5.5 · am genauesten',
    'claude-sonnet-5-5': 'Sonnet 5.5 · günstiger',
  };

  let seq = 0;
  const waiting = {};
  window.onClaude = (id, code, body) => {
    const w = waiting[id];
    if (!w) return;
    delete waiting[id];
    let json = null;
    try { json = JSON.parse(body); } catch (e) {}
    if (code >= 200 && code < 300 && json) w.resolve(json);
    else w.reject(new Error(errorText(code, json, body)));
  };

  function errorText(code, json, raw) {
    const msg = json && json.error && json.error.message;
    if (code === 0) return 'Keine Verbindung zu Claude. Bist du online? (' + raw + ')';
    if (code === 401) return 'Der API-Schlüssel wurde nicht akzeptiert. Bitte in den Einstellungen prüfen.';
    if (code === 400 && msg && /credit|balance/i.test(msg)) return 'Dein Guthaben bei Anthropic ist aufgebraucht. Lade es in der Console auf.';
    if (code === 404 && msg && /model/i.test(msg)) return 'Dieses Modell ist nicht verfügbar. Wähle in den Einstellungen ein anderes.';
    if (code === 429) return 'Zu viele Anfragen gerade. Versuch es in einer Minute noch einmal.';
    if (code === 529 || code >= 500) return 'Claude ist gerade überlastet. Versuch es gleich noch einmal.';
    return 'Fehler ' + code + (msg ? ': ' + msg : '');
  }

  function call(body, letterId) {
    return new Promise((resolve, reject) => {
      const id = 'c' + (++seq) + '_' + Date.now();
      waiting[id] = { resolve, reject };
      if (window.Native) Native.callClaude(JSON.stringify(body), letterId || '', id);
      else reject(new Error('Claude ist nur in der App verfügbar.'));
    });
  }

  // ---------- Abschrift ----------

  const LETTER_TOOL = {
    name: 'brief_speichern',
    description: 'Speichert die Abschrift und Auswertung eines Briefes.',
    input_schema: {
      type: 'object',
      properties: {
        datum: { type: 'string', description: 'Datum aus dem Brief im Format JJJJ-MM-TT, oder leer, wenn im Brief kein Datum steht.' },
        titel: { type: 'string', description: 'Kurzer, treffender Titel, höchstens 6 Wörter.' },
        stimmung: { type: 'string', description: 'Ein bis zwei Wörter für die Grundstimmung des Briefes.' },
        themen: { type: 'array', items: { type: 'string' }, description: '3 bis 6 Schlagwörter.' },
        zusammenfassung: { type: 'string', description: '3 bis 5 Sätze. Nennt Franky beim Namen. Gibt nur wieder, was im Brief steht.' },
        entscheidungen: { type: 'array', items: { type: 'string' }, description: 'Nur ausdrücklich getroffene Entscheidungen. Leer, wenn es keine gibt.' },
        empfehlungen: { type: 'array', items: { type: 'string' }, description: 'Ratschläge, die der Brief gibt.' },
        geistesblitze: { type: 'array', items: { type: 'string' }, description: 'Neue Einsichten oder Ideen aus dem Brief.' },
        ziele: {
          type: 'array',
          description: 'Ziele, Visionen und Vorhaben, die im Brief genannt werden. Leer, wenn es keine gibt.',
          items: {
            type: 'object',
            properties: {
              ziel: { type: 'string', description: 'Das Ziel kurz und positiv formuliert, höchstens 10 Wörter.' },
              deadline: { type: 'string', description: 'Termin im Format JJJJ-MM-TT, nur wenn im Brief ein Zeitpunkt genannt wird, sonst leer.' },
              plan: { type: 'string', description: 'Der Weg dorthin, nur wenn er im Brief beschrieben wird, sonst leer. Schritte durch Zeilenumbruch getrennt.' },
              aktion: { type: 'string', description: 'Eine konkrete nächste Handlung, nur wenn der Brief sie nennt, sonst leer.' },
            },
            required: ['ziel', 'deadline', 'plan', 'aktion'],
          },
        },
        text: { type: 'string', description: 'Vollständiger Brieftext mit Absätzen (Leerzeile dazwischen).' },
        unsicher: { type: 'integer', description: 'Anzahl der Stellen, die mit [?] markiert wurden.' },
      },
      required: ['datum', 'titel', 'stimmung', 'themen', 'zusammenfassung', 'entscheidungen', 'empfehlungen', 'geistesblitze', 'ziele', 'text', 'unsicher'],
    },
  };

  function systemPrompt(s) {
    const name = s.name || 'Franky';
    const names = (s.names || []).filter(Boolean);
    return `Du schreibst handschriftliche, deutsche Briefe ab, die ${name} an sich selbst schreibt. Er schreibt alle ein bis zwei Wochen, spricht sich darin mit "du" an, und der Schreiber nennt sich "ich". Die Briefe sind sehr persönlich. Genauigkeit ist wichtiger als alles andere: Das Archiv darf nie etwas behaupten, das ${name} nicht geschrieben hat.

So gehst du vor:
1. Lies jede Seite Zeile für Zeile, in Ruhe und vollständig. Nutze den Zusammenhang des ganzen Briefes, um schwer lesbare Wörter zu entschlüsseln. Achte auf typische Verwechslungen in Handschrift (z. B. u/n, a/o, e/c, l/t, unbewusst/bewusst).
2. Die Anrede lautet in der Regel "Lieber ${name},".${names.length ? `\n3. Personen, die in den Briefen vorkommen können: ${names.join(', ')}. Schreibe diese Namen immer genau so.` : ''}

Regeln für den Text:
- Durchgestrichene Wörter komplett weglassen.
- Rechtschreibung und Zeichensetzung korrigieren, aber Wortwahl, Satzbau und Inhalt unverändert lassen. Nichts hinzufügen, nichts kürzen, nichts glätten.
- Verneinungen ("nicht ... sondern", "kein", "un-") niemals verlieren.
- Bei einem unsicheren Wort: wahrscheinlichste Lesart schreiben und [?] direkt dahinter setzen. Bei völlig unleserlichen Stellen nur [?].
- Absätze wie im Original, mit einer Leerzeile dazwischen. Mehrere Seiten sind ein einziger Brief.
- Ignoriere Lochungen, Karos, Seitenzahlen und Randzeichen.

Regeln für die Auswertung:
- Zusammenfassung: ${name} beim Namen nennen, nur wiedergeben, was im Brief steht, nichts deuten oder bewerten.
- Entscheidungen: nur was ausdrücklich beschlossen wird ("ich habe entschieden", "ich werde", "ab jetzt"). "Ich glaube, es wäre gut ..." ist eine Empfehlung, keine Entscheidung.
- Empfehlungen: Ratschläge, die der Brief ${name} gibt, kurz und in eigenen Worten.
- Geistesblitze: neue Einsichten, Erkenntnisse oder Ideen, die im Brief stehen.
- Ziele: Visionen, Wünsche und Vorhaben für die Zukunft ("ich will", "mein Ziel", "ich möchte erreichen"). Deadline, Plan und Aktion nur eintragen, wenn sie wirklich im Brief stehen. Nichts ergänzen, die App hilft später beim Vervollständigen.
- Nichts dazuerfinden. Wenn es zu einer Liste nichts gibt, bleibt sie leer.

Speichere das Ergebnis immer mit dem Werkzeug brief_speichern. Antworte nicht mit normalem Text.`;
  }

  function transcribe(letterId, settings, hint) {
    const body = {
      model: settings.model,
      max_tokens: 8000,
      system: systemPrompt(settings),
      tools: [LETTER_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'Bitte schreibe diesen Brief ab und werte ihn aus.' + (hint ? ' ' + hint : '') }],
      }],
    };
    return call(body, letterId).then(toLetter);
  }

  function analyzeText(text, settings) {
    const body = {
      model: settings.model,
      max_tokens: 8000,
      system: systemPrompt(settings) + '\n\nDiesmal bekommst du den Brief schon als Text, nicht als Bild. Übernimm ihn in das Feld text und korrigiere nur Rechtschreibung und Zeichensetzung.',
      tools: [LETTER_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hier ist der Brief:\n\n' + text }] }],
    };
    return call(body).then(toLetter);
  }

  function toLetter(resp) {
    if (resp.stop_reason === 'max_tokens') throw new Error('Der Brief war zu lang für eine Antwort. Bitte noch einmal versuchen.');
    const block = (resp.content || []).find(b => b.type === 'tool_use');
    let i = block && block.input;
    if (!i) {
      // Falls Claude das Ergebnis als Text statt über das Werkzeug liefert
      const txt = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const a = txt.indexOf('{'), z = txt.lastIndexOf('}');
      if (a >= 0 && z > a) { try { i = JSON.parse(txt.slice(a, z + 1)); } catch (e) {} }
    }
    if (!i || !i.text) throw new Error('Claude hat keine Abschrift geliefert. Bitte noch einmal versuchen.');
    const arr = a => Array.isArray(a) ? a.map(x => String(x).trim()).filter(x => x && !/^keine?\.?$/i.test(x)) : [];
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(i.datum || '') ? i.datum : '',
      title: (i.titel || '').trim(),
      mood: (i.stimmung || '').trim(),
      themes: arr(i.themen),
      summary: (i.zusammenfassung || '').trim(),
      decisions: arr(i.entscheidungen).map(text => ({ text })),
      recommendations: arr(i.empfehlungen).map(text => ({ text, done: false })),
      insights: arr(i.geistesblitze).map(text => ({ text })),
      goals: toGoals(i.ziele),
      text: (i.text || '').trim(),
      uncertain: (String(i.text || '').match(/\[\?\]/g) || []).length,
    };
  }

  // ---------- Rückblick ----------

  function review(letters, from, to, settings) {
    const name = settings.name || 'Franky';
    const corpus = letters.map(l => {
      const open = l.recommendations.filter(r => !r.done).map(r => r.text);
      const done = l.recommendations.filter(r => r.done).map(r => r.text);
      return `<brief datum="${l.date}" titel="${l.title.replace(/"/g, "'")}">\n${l.text}\n` +
        (done.length ? `\n[Als umgesetzt abgehakt: ${done.join('; ')}]` : '') +
        (open.length ? `\n[Noch offen: ${open.join('; ')}]` : '') + `\n</brief>`;
    }).join('\n\n');
    const body = {
      model: settings.model,
      max_tokens: 4000,
      system: `${name} schreibt sich alle ein bis zwei Wochen einen Brief und spricht sich darin mit "du" an. Du schreibst ihm einen Rückblick über einen Zeitraum, warm und ehrlich, in der Du-Form, auf Deutsch. Stütze dich ausschließlich auf die Briefe. Nenne bei wichtigen Punkten das Datum des Briefes. Erfinde nichts und stelle keine Diagnosen.

Gliedere so, jede Überschrift in einer eigenen Zeile mit ## davor:
## Was dich bewegt hat
## Was sich verändert hat
## Deine Entscheidungen
## Empfehlungen, die noch offen sind
## Ein Gedanke für die nächste Zeit

Schreib in kurzen Absätzen, Aufzählungen mit "- ". Insgesamt höchstens 450 Wörter.`,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Zeitraum: ${from} bis ${to}\n\n${corpus}` }] }],
    };
    return call(body).then(resp => (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim());
  }

  function toGoals(list) {
    if (!Array.isArray(list)) return [];
    const okDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : '';
    return list.filter(g => g && String(g.ziel || '').trim()).map(g => ({
      title: String(g.ziel).trim(), deadline: okDate(g.deadline), plan: String(g.plan || '').trim(), action: String(g.aktion || '').trim(),
    }));
  }

  // Werkzeug-Antwort lesen; falls Claude stattdessen JSON als Text schickt, das nehmen
  function toolInput(resp) {
    if (resp.stop_reason === 'max_tokens') throw new Error('Die Antwort war zu lang. Bitte noch einmal versuchen.');
    const block = (resp.content || []).find(b => b.type === 'tool_use');
    if (block && block.input) return block.input;
    const txt = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const a = txt.indexOf('{'), z = txt.lastIndexOf('}');
    if (a >= 0 && z > a) { try { return JSON.parse(txt.slice(a, z + 1)); } catch (e) {} }
    throw new Error('Claude hat keine verwertbare Antwort geliefert. Bitte noch einmal versuchen.');
  }

  // ---------- Ziele ----------

  const PLAN_TOOL = {
    name: 'plan_speichern',
    description: 'Speichert einen Plan und die nächste Aktion für ein Ziel.',
    input_schema: {
      type: 'object',
      properties: {
        deadline_vorschlag: { type: 'string', description: 'Nur wenn noch keine Deadline existiert: ein realistischer Termin JJJJ-MM-TT. Sonst leer.' },
        plan: { type: 'array', items: { type: 'string' }, description: '3 bis 6 klare Etappen, jeweils ein kurzer Satz.' },
        aktion: { type: 'string', description: 'Die eine nächste Aktion: konkret, in 15 bis 60 Minuten machbar, sofort startbar.' },
        hinweis: { type: 'string', description: 'Ein ermutigender Satz in der Du-Form, höchstens 25 Wörter.' },
      },
      required: ['deadline_vorschlag', 'plan', 'aktion', 'hinweis'],
    },
  };

  function suggestPlan(goal, context, settings) {
    const name = settings.name || 'Franky';
    const body = {
      model: settings.model,
      max_tokens: 2000,
      system: `Du hilfst ${name}, aus einem Ziel einen Erfolg zu machen. Seine Formel: Ziel + Deadline + Plan + Aktion = Erfolg. Ziel + Deadline + Plan = Strategie. Ziel + Deadline = Vorhaben. Ziel ohne Deadline = Fantasie.
Ergänze, was fehlt, und behalte, was schon da ist. Sprich ihn mit "du" an, auf Deutsch, klar und bodenständig. Heute ist der ${new Date().toISOString().slice(0, 10)}. Speichere das Ergebnis mit dem Werkzeug plan_speichern.`,
      tools: [PLAN_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [{ type: 'text', text:
        `Ziel: ${goal.title}\nDeadline: ${goal.deadline || 'noch keine'}\nBisheriger Plan: ${goal.plan || 'noch keiner'}\nBisherige Aktion: ${goal.action || 'noch keine'}` +
        (context ? `\n\nAus seinem Brief dazu:\n${context.slice(0, 4000)}` : '') }] }],
    };
    return call(body).then(resp => {
      const i = toolInput(resp);
      return {
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(i.deadline_vorschlag || '') ? i.deadline_vorschlag : '',
        plan: (Array.isArray(i.plan) ? i.plan : String(i.plan || '').split('\n')).map(x => String(x).trim()).filter(Boolean).join('\n'),
        action: String(i.aktion || '').trim(),
        hint: String(i.hinweis || '').trim(),
      };
    });
  }

  const GOALS_TOOL = {
    name: 'ziele_speichern',
    description: 'Speichert Ziele, die in den Briefen vorkommen.',
    input_schema: {
      type: 'object',
      properties: {
        ziele: { type: 'array', items: { type: 'object', properties: {
          brief_datum: { type: 'string', description: 'Datum des Briefes, aus dem das Ziel stammt.' },
          ziel: { type: 'string' }, deadline: { type: 'string' }, plan: { type: 'string' }, aktion: { type: 'string' },
        }, required: ['brief_datum', 'ziel', 'deadline', 'plan', 'aktion'] } },
      },
      required: ['ziele'],
    },
  };

  function extractGoals(letters, settings) {
    const corpus = letters.map(l => `<brief datum="${l.date}">\n${l.text}\n</brief>`).join('\n\n');
    const body = {
      model: settings.model,
      max_tokens: 4000,
      system: `Finde in den Briefen von ${settings.name || 'Franky'} alle Ziele, Visionen und Vorhaben für die Zukunft. Ziel kurz und positiv formulieren, höchstens 10 Wörter. Deadline (JJJJ-MM-TT), Plan und Aktion nur eintragen, wenn sie wirklich im Brief stehen, sonst leer lassen. Keine Ratschläge oder Gefühle als Ziel ausgeben. Gibt es keine Ziele, ist die Liste leer. Speichere mit dem Werkzeug ziele_speichern.`,
      tools: [GOALS_TOOL],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: [{ type: 'text', text: corpus }] }],
    };
    return call(body).then(resp => {
      const i = toolInput(resp);
      return (i.ziele || []).map(g => ({ ...toGoals([g])[0], letterDate: g.brief_datum })).filter(g => g.title);
    });
  }

  function ping(settings) {
    return call({ model: settings.model, max_tokens: 5, messages: [{ role: 'user', content: 'Hallo' }] });
  }

  // ---------- Text im ###BRIEF###-Format (z. B. aus Gemini) ----------

  function parseBriefFormat(raw) {
    if (!raw || !/###\s*BRIEF\s*###/i.test(raw)) return null;
    let t = raw.replace(/\r/g, '').replace(/```[a-z]*\n?/gi, '').replace(/\*\*/g, '');
    t = t.slice(t.search(/###\s*BRIEF\s*###/i)).replace(/###\s*BRIEF\s*###/i, '');
    t = t.replace(/###\s*ENDE\s*###[\s\S]*$/i, '');
    const keys = ['DATUM', 'TITEL', 'STIMMUNG', 'THEMEN', 'ZUSAMMENFASSUNG', 'ENTSCHEIDUNGEN', 'EMPFEHLUNGEN', 'GEISTESBLITZE', 'TEXT'];
    const re = new RegExp('^\\s*(' + keys.join('|') + ')\\s*:?', 'gmi');
    const parts = {};
    let m, lastKey = null, lastIdx = 0;
    while ((m = re.exec(t))) {
      if (lastKey) parts[lastKey] = t.slice(lastIdx, m.index).trim();
      lastKey = m[1].toUpperCase(); lastIdx = re.lastIndex;
      if (lastKey === 'TEXT') break;
    }
    if (lastKey) parts[lastKey] = t.slice(lastIdx).trim();
    const list = s => (s || '').split('\n').map(x => x.replace(/^\s*[-*•]\s*/, '').trim()).filter(x => x && !/^keine?\.?$/i.test(x));
    let date = (parts.DATUM || '').trim();
    const dm = date.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dm) date = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';
    const text = (parts.TEXT || '').trim();
    return {
      date,
      title: (parts.TITEL || '').trim(),
      mood: (parts.STIMMUNG || '').trim(),
      themes: (parts.THEMEN || '').split(/[,;]/).map(s => s.trim()).filter(Boolean),
      summary: (parts.ZUSAMMENFASSUNG || '').trim(),
      decisions: list(parts.ENTSCHEIDUNGEN).map(text => ({ text })),
      recommendations: list(parts.EMPFEHLUNGEN).map(text => ({ text, done: false })),
      insights: list(parts.GEISTESBLITZE).map(text => ({ text })),
      text,
      uncertain: (text.match(/\[\?/g) || []).length,
    };
  }

  // Datum aus dem Dateinamen, z. B. "16-10-2026_franky.pdf" oder "2026-10-16 Brief.pdf"
  function dateFromFileName(name) {
    if (!name) return '';
    let m = name.match(/(\d{1,2})[-._](\d{1,2})[-._](\d{4})/);
    if (m) return valid(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    m = name.match(/(\d{4})[-._](\d{1,2})[-._](\d{1,2})/);
    if (m) return valid(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
    return '';
  }
  function valid(d) {
    const x = new Date(d + 'T12:00:00');
    return isNaN(x) || x.getFullYear() < 1990 || x.getFullYear() > 2100 ? '' : d;
  }

  return { MODELS, transcribe, analyzeText, review, ping, parseBriefFormat, dateFromFileName, suggestPlan, extractGoals };
})();
