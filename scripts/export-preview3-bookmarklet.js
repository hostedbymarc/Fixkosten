// Bookmarklet: exports the Fixkosten data of the current site (e.g. the Deploy
// Preview of PR #3, which has no export button) in exactly the format of
// exportBackup() on main. Reads only content tables, never `meta` (settings/flags).
// No libraries, no network. Build the one-liner with: node scripts/make-bookmarklet.mjs
(() => {
  const T = ['categories', 'positions', 'payments', 'oneOffs', 'monthClose', 'changeLog', 'reminders'];
  const L = { categories: 'Kategorien', positions: 'Positionen', payments: 'Zahlungen', oneOffs: 'Einmalbeträge', monthClose: 'Monatsabschlüsse', changeLog: 'Änderungen', reminders: 'Erinnerungen' };
  const NODB = 'Keine Fixkosten-Datenbank gefunden – bist du auf der Preview-3-Seite in Safari, nicht in der Home-Bildschirm-App?';
  // a bookmark tapped in an empty tab runs in about:blank, where IndexedDB is blocked
  const go = () => {
    alert('Das war ein leerer Tab. Ich öffne jetzt die Preview-3-Seite – sobald deine Monatsansicht da ist, das Lesezeichen dort nochmal antippen.');
    location.href = 'https://deploy-preview-3--fixkosten.netlify.app/';
  };
  if (!/^https?:$/.test(location.protocol)) return go();
  let r;
  try {
    r = indexedDB.open('fixkosten');
  } catch (e) {
    return go();
  }
  // only fires if there is no database: abort instead of creating an empty one
  r.onupgradeneeded = () => r.transaction.abort();
  r.onerror = () => alert(NODB);
  r.onsuccess = () => {
    const db = r.result;
    const v = Math.round(db.version / 10);
    if (v < 2 || v > 3) {
      db.close();
      return alert('Datenbank-Version ' + v + ' nicht unterstützt. Richtige Seite?');
    }
    if (!T.every((t) => db.objectStoreNames.contains(t))) {
      db.close();
      return alert(NODB);
    }
    const x = db.transaction(T, 'readonly');
    const got = {};
    T.forEach((t) => (x.objectStore(t).getAll().onsuccess = (e) => (got[t] = e.target.result)));
    x.onerror = () => alert('Export fehlgeschlagen: ' + x.error);
    x.oncomplete = () => {
      db.close();
      const data = {};
      T.forEach((t) => (data[t] = got[t]));
      const n = new Date();
      const p = (k) => String(k).padStart(2, '0');
      const file = { format: 'fixkosten-backup', schemaVersion: v, exportedAt: n.toISOString(), data };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
      a.download = 'fixkosten-preview3-' + n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate()) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => alert('Export: ' + T.map((t) => data[t].length + ' ' + L[t]).join(', ')), 800);
    };
  };
})();
