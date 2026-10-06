var T = ['categories', 'positions', 'payments', 'oneOffs', 'monthClose', 'changeLog', 'reminders'];
var r = indexedDB.open('fixkosten');
r.onupgradeneeded = function () { r.transaction.abort(); };
r.onerror = function () { completion('FEHLER: Keine Fixkosten-Daten. Kurzbefehl auf der Preview-3-Seite über Teilen starten.'); };
r.onsuccess = function () {
  var db = r.result;
  var v = Math.round(db.version / 10);
  var x = db.transaction(T, 'readonly');
  var got = {};
  T.forEach(function (t) { x.objectStore(t).getAll().onsuccess = function (e) { got[t] = e.target.result; }; });
  x.onerror = function () { completion('FEHLER: ' + x.error); };
  x.oncomplete = function () {
    db.close();
    var data = {};
    T.forEach(function (t) { data[t] = got[t]; });
    completion(JSON.stringify({ format: 'fixkosten-backup', schemaVersion: v, exportedAt: new Date().toISOString(), data: data }));
  };
};
