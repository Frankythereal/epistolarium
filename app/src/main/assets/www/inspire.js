// Gedanken und Impulsfragen, die beim Schreiben und Verarbeiten helfen.
const Inspire = (() => {
  const QUOTES = [
    { t: 'Habe Geduld gegen alles Ungelöste in deinem Herzen und versuche, die Fragen selbst liebzuhaben.', a: 'Rainer Maria Rilke' },
    { t: 'Das Leben kann nur rückwärts verstanden werden, muss aber vorwärts gelebt werden.', a: 'Søren Kierkegaard' },
    { t: 'Es ist nicht wenig Zeit, die wir haben, sondern es ist viel Zeit, die wir nicht nutzen.', a: 'Seneca' },
    { t: 'Das Glück deines Lebens hängt von der Beschaffenheit deiner Gedanken ab.', a: 'Marc Aurel' },
    { t: 'Wer nach außen schaut, träumt. Wer nach innen schaut, erwacht.', a: 'C. G. Jung' },
    { t: 'Auch der längste Weg beginnt mit dem ersten Schritt.', a: 'Laozi' },
    { t: 'Was du aufschreibst, muss dein Kopf nicht mehr tragen.', a: '' },
    { t: 'Du musst heute nichts lösen. Schreib einfach auf, was ist.', a: '' },
    { t: 'Sei zu dir so freundlich, wie du es zu einem guten Freund wärst.', a: '' },
    { t: 'Ein Brief an dich ist ein Gespräch mit jemandem, der dich wirklich kennt.', a: '' },
    { t: 'Kleine Schritte sind auch Schritte.', a: '' },
    { t: 'Ehrlichkeit mit dir selbst ist der Anfang von Ruhe.', a: '' },
    { t: 'Gefühle, die einen Namen bekommen, verlieren ihre Macht über dich.', a: '' },
    { t: 'Rückschritte gehören zum Weg. Sie sind kein Zeichen, dass du falsch gehst.', a: '' },
    { t: 'Du darfst gleichzeitig dankbar und traurig sein.', a: '' },
    { t: 'Abstand ist manchmal die freundlichste Antwort.', a: '' },
    { t: 'Was heute schwer ist, wird morgen ein Kapitel sein, das du verstehst.', a: '' },
    { t: 'Deine Geschichte schreibst du Seite für Seite.', a: '' },
  ];

  const PROMPTS = [
    'Was hat dich seit deinem letzten Brief am meisten bewegt?',
    'Wofür bist du gerade dankbar, auch im Kleinen?',
    'Was würdest du einem guten Freund in deiner Lage raten?',
    'Was möchtest du loslassen?',
    'Worauf bist du in letzter Zeit stolz?',
    'Was brauchst du gerade wirklich?',
    'Was hat sich verändert, seit du das letzte Mal geschrieben hast?',
    'Welches Gefühl war in den letzten Tagen am lautesten, und was wollte es dir sagen?',
    'Wo hast du dir selbst gut getan?',
    'Was hast du lange aufgeschoben, und warum?',
    'Welcher Moment der letzten Wochen soll nicht verloren gehen?',
    'Was wäre ein kleiner, machbarer nächster Schritt?',
    'Wem möchtest du etwas sagen, das du noch nicht gesagt hast?',
    'Was gibt dir gerade Kraft?',
    'Was würde der Franky von vor einem Jahr über dich heute denken?',
  ];

  const dayIndex = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);

  function quoteOfDay() { return QUOTES[dayIndex() % QUOTES.length]; }

  // Jeden zweiten Tag eine offene Empfehlung aus den eigenen Briefen aufgreifen
  function promptOfDay(letters, fmt) {
    const open = [];
    letters.forEach(l => (l.recommendations || []).forEach(r => { if (!r.done) open.push({ r, l }); }));
    const i = dayIndex();
    if (open.length && i % 2 === 0) {
      const o = open[Math.floor(i / 2) % open.length];
      return { text: `Du hast dir am ${fmt(o.l.date)} geraten: „${o.r.text}“. Wie steht es damit?`, own: true };
    }
    return { text: PROMPTS[(i * 7) % PROMPTS.length], own: false };
  }

  return { QUOTES, PROMPTS, quoteOfDay, promptOfDay };
})();
