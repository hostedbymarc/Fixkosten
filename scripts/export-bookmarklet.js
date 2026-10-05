// Exports the Fixkosten IndexedDB of the current site as a backup JSON file.
// For sites that run an app version without export button (e.g. old deploy previews).
// Usage: save the one-liner from docs/export-bookmarklet.txt as a bookmark URL and
// tap it while the Fixkosten page is open (in the same browser where the data was entered).
(() => {
  const TABLES = ['categories', 'positions', 'payments', 'oneOffs', 'monthClose', 'changeLog', 'reminders'];
  const req = indexedDB.open('fixkosten');
  // only fires if no database exists: abort instead of creating an empty one
  req.onupgradeneeded = () => req.transaction.abort();
  req.onerror = () => alert('Auf dieser Seite gibt es keine Fixkosten-Daten (oder sie konnten nicht geöffnet werden).');
  req.onsuccess = () => {
    const db = req.result;
    const tables = TABLES.filter((t) => db.objectStoreNames.contains(t));
    if (!tables.includes('positions')) {
      db.close();
      alert('Auf dieser Seite gibt es keine Fixkosten-Daten.');
      return;
    }
    const tx = db.transaction(tables, 'readonly');
    const data = {};
    for (const t of TABLES) data[t] = [];
    tables.forEach((t) => {
      tx.objectStore(t).getAll().onsuccess = (e) => (data[t] = e.target.result);
    });
    tx.oncomplete = () => {
      const backup = {
        format: 'fixkosten-backup',
        schemaVersion: Math.round(db.version / 10), // Dexie stores version × 10
        exportedAt: new Date().toISOString(),
        data,
      };
      db.close();
      const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fixkosten-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(
        () => alert(`Export: ${data.positions.length} Positionen, ${data.payments.length} Zahlungen, ${data.monthClose.length} Monatsabschlüsse.`),
        800,
      );
    };
  };
})();
