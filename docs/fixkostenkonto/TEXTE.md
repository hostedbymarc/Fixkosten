| Bereich | Schlüssel | Text | Wörter je Satz |
|---|---|---|---|
| Status | `status.setup` | Fixkosten einplanen | 2 |
| Status | `status.covered` | Alles eingeplant bis {monat}. | 4 |
| Grund | `reason.bills` | Im {monat} kommen {rechnungen}. | 4 |
| Grund | `reason.bill` | Im {monat} kommt {rechnungen}. | 4 |
| Grund | `reason.now` | Diesen Monat reicht das Geld nicht. | 6 |
| Grund | `reason.short` | Ab {monat} reicht das Geld nicht. | 6 |
| Dein Plan | `plan.spread` | Darum bis dahin {extra} extra, ab {folgemonat} {betrag}. | 8 |
| Dein Plan | `plan.lump` | Leg bis {datum} {betrag} extra zur Seite. | 7 |
| Dein Plan | `plan.lump.now` | Leg jetzt {betrag} extra zur Seite. | 6 |
| Dein Plan | `plan.when` | am {datum}, wenn dein Gehalt kommt | 6 |
| Dein Plan | `plan.when.order` | per Dauerauftrag am {datum} | 4 |
| Einladung | `invite.title` | Neu: Fixkosten einplanen. | 3 |
| Einladung | `invite.text` | Erbse sagt dir, wie viel du monatlich zur Seite legst. | 10 |
| Einrichtung | `setup.title` | Fixkosten einplanen | 2 |
| Einrichtung | `setup.progress` | Frage {n} von {gesamt} | 4 |
| Einrichtung | `setup.next` | Weiter | 1 |
| Einrichtung | `setup.back` | Zurück | 1 |
| Einrichtung | `setup.account` | Hast du ein eigenes Konto für Fixkosten? | 7 |
| Einrichtung | `setup.account.yes` | Ja | 1 |
| Einrichtung | `setup.account.no` | Nein, ich plane nur | 4 |
| Einrichtung | `setup.balance` | Wie viel hast du heute schon für Fixkosten zur Seite gelegt? | 11 |
| Einrichtung | `setup.balance.label` | Schon zur Seite gelegt | 4 |
| Einrichtung | `setup.balance.none` | Noch nichts | 2 |
| Einrichtung | `setup.order` | Läuft dein Dauerauftrag schon? | 4 |
| Einrichtung | `setup.order.yes` | Ja | 1 |
| Einrichtung | `setup.order.no` | Nein | 1 |
| Monats-Check | `check.month` | Neuer Monat. Hast du {betrag} zur Seite gelegt? | 2 · 6 |
| Monats-Check | `check.month.again` | Hast du für {monat} {betrag} zur Seite gelegt? | 8 |
| Monats-Check | `check.month.yes` | Ja | 1 |
| Monats-Check | `check.month.no` | Noch nicht | 2 |
| Monats-Check | `check.balance` | Liegen noch {betrag} für Fixkosten bereit? | 6 |
| Monats-Check | `check.balance.ok` | Stimmt | 1 |
| Monats-Check | `check.balance.other` | Anderer Betrag | 2 |
| Monats-Check | `check.balance.remind` | Trag ein, was du schon zur Seite gelegt hast. Dann rechnet Erbse genauer. | 9 · 4 |
| Monats-Check | `check.balance.save` | Speichern | 1 |
| Monats-Check | `check.later` | Später | 1 |
| Meilensteine | `milestone.firstPod` | Zum ersten Mal alles eingeplant | 5 |
| Meilensteine | `milestone.streak3` | 3 Monate in Folge | 4 |
| Meilensteine | `milestone.streak6` | 6 Monate in Folge | 4 |
| Meilensteine | `milestone.year` | Ein Jahr eingeplant | 3 |
| Meilensteine | `milestone.toast` | Geschafft: {meilenstein} | 2 |
| Sheet | `sheet.buffer` | Puffer {betrag} | 2 |
| Sheet | `sheet.month.lowest` | Gezeigt: {monat}, der Monat mit dem tiefsten Stand. Tipp auf einen Punkt für einen anderen Monat. | 8 · 8 |
| Sheet | `sheet.month.picked` | Gezeigt: {monat}. | 2 |
| Sheet | `sheet.chart` | Verlauf mit Plan | 3 |
| Sheet | `sheet.chart.info` | So entwickelt sich dein Geld, wenn du den Betrag immer am {tag} zur Seite legst. Diesen Monat zählen nur noch offene Rechnungen. | 15 · 7 |
| Sheet | `sheet.allMonths` | Alle Monate | 2 |
| Sheet | `sheet.col.deposit` | Einzahlung | 1 |
| Sheet | `sheet.col.debits` | Abbuchungen | 1 |
| Sheet | `sheet.col.end` | Stand | 1 |
| Sheet | `sheet.rising` | Dein Stand steigt in 12 Monaten um {betrag}. Der Monatsbetrag ist höher als nötig, z. B. durch die Rundung. | 8 · 7 · 1 · 3 |
| Einstellungen | `settings.title` | Fixkosten einplanen | 2 |
| Einstellungen | `settings.switch` | Fixkosten einplanen | 2 |
| Einstellungen | `settings.off` | Erbse zeigt nur deine Fixkosten. | 5 |
| Einstellungen | `settings.on` | Erbse sagt dir, wie viel du monatlich zur Seite legst. Und warnt, bevor es knapp wird. | 10 · 6 |
| Einstellungen | `settings.info` | Erbse nennt dir jeden Monat einen Betrag zum Zurücklegen. Damit kommst du nie ins Minus. Ohne Banklogin. | 9 · 6 · 2 |
| Einstellungen | `settings.balance` | Schon zur Seite gelegt | 4 |
| Einstellungen | `settings.balance.info` | So viel hast du schon für deine Fixkosten zur Seite gelegt. | 11 |
| Einstellungen | `settings.asOf` | Stand vom {datum} | 3 |
| Einstellungen | `settings.roundingOn` | Monatsbetrag runden | 2 |
| Einstellungen | `settings.rounding` | Monatsbetrag aufrunden auf | 3 |
| Einstellungen | `settings.buffer` | Sicherheitspuffer | 1 |
| Einstellungen | `settings.buffer.off` | Aus | 1 |
| Einstellungen | `settings.buffer.info` | Ein kleines Polster, falls eine Rechnung teurer wird. | 8 |
| Einstellungen | `settings.edit` | Einrichtung ändern | 2 |
| Einstellungen | `settings.walkthrough` | So funktioniert Erbse | 3 |
| Monats-Screen | `hero.done.title` | {monat} erledigt | 2 |
| Monats-Screen | `hero.done.sub` | Alle {n} Rechnungen bezahlt | 4 |
| Monats-Screen | `hero.done.sub.one` | Deine Rechnung ist bezahlt | 4 |
| Bearbeiten-Dialog | `account.question` | Woraus zahlst du das? | 4 |
| Bearbeiten-Dialog | `account.reserve` | Rücklage | 1 |
| Bearbeiten-Dialog | `account.salary` | Direkt | 1 |
| Bearbeiten-Dialog | `account.info` | Rücklage: Geld, das du jeden Monat zur Seite legst. Direkt: zahlst du sofort vom Gehalt. | 9 · 6 |
| Bearbeiten-Dialog | `unplanned.label` | Nicht einplanen | 2 |
| Bearbeiten-Dialog | `unplanned.info` | Zählt nicht zu Fixkosten, Rücklage und Aufteilung. Zum Beispiel Käufe aus deinem Spielgeld. | 7 · 6 |
| Bearbeiten-Dialog | `unplanned.chip` | nicht eingeplant | 2 |
| Einstellungen | `settings.spielgeld` | Spielgeld pro Monat | 3 |
| Einstellungen | `settings.spielgeld.info` | Dein geplantes Spielgeld. Erbse prüft, ob es neben der Rücklage passt. | 3 · 8 |
| Einstellungen | `settings.spielgeld.hint` | Leer lassen, wenn du kein Spielgeld planst. | 7 |
| Einstellungen | `settings.salary.title` | Gehalt | 1 |
| Einstellungen | `settings.planSalary` | Gehalt zum Planen | 3 |
| Einstellungen | `settings.planSalary.info` | Dein normales Netto ohne Sonderzahlungen. Lieber vorsichtig. | 5 · 2 |
| Einstellungen | `settings.planSalary.hint` | Gilt für Monate ohne eingetragenes Gehalt. | 6 |
| Analyse | `analyse.order.until` | {betrag} bis {monat}, danach {basis} | 5 |
| Walkthrough | `walk.title` | So funktioniert Erbse | 3 |
| Walkthrough | `walk.example` | Beispiel | 1 |
| Walkthrough | `walk.example.note` | Beispielzahlen. Richte „Fixkosten einplanen“ ein, dann siehst du deine. | 1 · 8 |
| Walkthrough | `walk.progress` | Karte {n} von {gesamt} | 4 |
| Walkthrough | `walk.next` | Weiter | 1 |
| Walkthrough | `walk.back` | Zurück | 1 |
| Walkthrough | `walk.done` | Fertig | 1 |
| Walkthrough | `walk.1.title` | Deine Fixkosten schwanken. | 3 |
| Walkthrough | `walk.1.sub` | Nur Rechnungen aus deiner Rücklage | 5 |
| Walkthrough | `walk.1.direct` | {n} Posten zahlst du direkt. | 5 |
| Walkthrough | `walk.1.text` | Im {teuer} zahlst du {max}, im {guenstig} nur {min}. | 9 |
| Walkthrough | `walk.2.title` | Bei Fälligkeit oder gleichmäßig. | 4 |
| Walkthrough | `walk.2.text` | Gleichmäßig sind das {betrag} pro Monat. Bei Fälligkeit zahlst du, wenn es kommt. | 6 · 7 |
| Walkthrough | `walk.3.title` | Vom Gehalt geht zuerst dein Plan weg. | 7 |
| Walkthrough | `walk.3.text` | Aufs Fixkostenkonto, direkt bezahlt, Vermögensaufbau. Der Rest ist frei für dich. | 5 · 6 |
| Walkthrough | `walk.3.app` | Spielgeld planst du nur ein. Erbse prüft, ob es passt. | 5 · 5 |
| Walkthrough | `walk.3.salary` | Gehalt | 1 |
| Walkthrough | `walk.3.pot` | Fixkostenkonto | 1 |
| Walkthrough | `walk.3.direct` | Direkt bezahlt | 2 |
| Walkthrough | `walk.3.spielgeld` | Frei für dich | 3 |
| Walkthrough | `walk.3.wealth` | Vermögensaufbau | 1 |
| Walkthrough | `walk.4.title` | Erbse empfiehlt den einfacheren Weg. | 5 |
| Walkthrough | `walk.4.rule` | Zuerst bei Fälligkeit. Reicht das nicht jeden Monat, dann gleichmäßig. | 3 · 7 |
| Walkthrough | `walk.4.due` | Für dich passt: Bei Fälligkeit. | 5 |
| Walkthrough | `walk.4.even` | Für dich passt: Gleichmäßig. | 4 |
| Walkthrough | `walk.4.none` | Fehlt etwas, zeigt dir „Dein Plan“ einen Vorschlag. | 8 |
| Walkthrough | `walk.5.title` | Dein Spielgeld ist die Prüfgröße. | 5 |
| Walkthrough | `walk.5.text` | Am {tag} kommt dein Gehalt. Erbse zeigt dir, was frei bleibt. | 5 · 6 |
| Dein Monat | `month.title` | Dein Monat | 2 |
| Dein Monat | `month.noSalary` | Trag dein Gehalt ein. Dann rechnet Erbse deinen Monat. | 4 · 5 |
| Dein Monat | `month.noSalary.action` | Gehalt eintragen | 2 |
| Dein Monat | `month.toAccount` | Aufs Fixkostenkonto | 2 |
| Dein Monat | `month.aside` | Zur Seite legen | 3 |
| Dein Monat | `month.incl.due` | inkl. {betrag} {zahlungen} | 1 · 2 |
| Dein Monat | `month.incl.save` | inkl. {betrag} für {monat} · {zahlungen} | 1 · 4 |
| Dein Monat | `month.split` | So teilt sich dein Gehalt | 5 |
| Dein Monat | `month.salary.edit` | Gehalt ändern | 2 |
| Dein Monat | `month.salary.remove` | Gehalt entfernen | 2 |
| Dein Monat | `month.salary.planned` | geplant · {wann} | 2 |
| Dein Monat | `month.planSalary.hint` | Leg dein Gehalt zum Planen fest | 6 |
| Dein Monat | `month.direct` | Direkt bezahlt | 2 |
| Dein Monat | `month.direct.more` | {n} Posten | 2 |
| Dein Monat | `month.wealth` | Vermögensaufbau | 1 |
| Dein Monat | `month.free` | Überschuss in diesem Monat | 4 |
| Dein Monat | `month.before` | Vor Spielgeld frei: {betrag} | 4 |
| Dein Monat | `month.unplanned` | Spielgeld | 1 |
| Dein Monat | `month.over` | Spielgeld {betrag} drüber | 3 |
| Dein Monat | `month.wealth.notFromNet` | {betrag} nicht vom Netto | 4 |
| Dein Monat | `month.list.save` | Für später zur Seite | 4 |
| Dein Monat | `month.list.due` | fällig {monat} | 2 |
| Dein Monat | `month.list.for` | für {monat} | 2 |
| Dein Monat | `month.list.saved` | ({betrag} schon angespart) | 3 |
| Dein Monat | `month.fromReserve` | {betrag} aus Rücklage | 3 |
| Dein Monat | `month.list.take` | Aus dem Angesparten | 3 |
| Dein Monat | `month.list.rest` | Noch nicht ausgegeben | 3 |
| Dein Monat | `month.list.empty` | Nichts in diesem Monat | 4 |
| Dein Monat | `month.list.notFromNet` | nicht vom Netto | 3 |
| Dein Monat | `month.list.other` | aus anderer Quelle | 3 |
| Dein Monat | `month.next` | {gehalt} · {wann} | 2 |
| Dein Monat | `month.next.plan` | Plan ansehen | 2 |
| Dein Monat | `month.deviation` | in diesem Monat {x} statt {y} | 6 |
| undefined | `source.label` | Bezahlt aus | 2 |
| undefined | `source.salary` | Gehalt | 1 |
| undefined | `source.other` | Andere Quelle | 2 |
| undefined | `source.info` | Andere Quelle zählt nicht gegen dein Spielgeld. | 7 |
| Dein Monat | `month.confirm.account` | {betrag} aufs Fixkostenkonto überwiesen | 4 |
| Dein Monat | `month.confirm.aside` | {betrag} zur Seite gelegt | 4 |
| Dein Monat | `month.done.account` | Überwiesen. Erledigt am {datum}. | 1 · 3 |
| Dein Monat | `month.done.aside` | Zur Seite gelegt. Erledigt am {datum}. | 3 · 3 |
| Dein Monat | `month.setup` | Richte „Fixkosten einplanen“ ein. Dann siehst du, was frei ist. | 4 · 6 |
| Dein Monat | `month.setup.action` | Einrichten | 1 |
| Dein Monat | `month.plan` | Dein Plan öffnen | 3 |
| Rechnungen-Zeile | `bills.title` | Rechnungen {monat} | 2 |
| Rechnungen-Zeile | `bills.count` | {x} von {n} bezahlt | 4 |
| Rechnungen-Zeile | `bills.count.card` | {x} von {n} Rechnungen bezahlt | 5 |
| Rechnungen-Zeile | `bills.done.sub` | Alle {n} Rechnungen bezahlt | 4 |
| Rechnungen-Zeile | `bills.done.sub.one` | Die Rechnung ist bezahlt | 4 |
| Rechnungen-Zeile | `bills.done` | {monat} erledigt | 2 |
| Rechnungen-Zeile | `bills.none` | Nichts fällig | 2 |
| Nächster großer Monat | `big.title` | Nächster großer Monat | 3 |
| Nächster großer Monat | `big.ready` | Mit deinem Plan bist du vorbereitet. | 6 |
| Nächster großer Monat | `big.short` | Geht sich nicht aus. Dir fehlen {betrag}. | 4 · 3 |
| Nächster großer Monat | `big.saved` | Schon angespart | 2 |
| Sheet „Dein Plan“ | `plan2.title` | Dein Plan | 2 |
| Sheet „Dein Plan“ | `plan2.ok` | Passt so. Dein Spielgeld bleibt jeden Monat übrig. | 2 · 6 |
| Sheet „Dein Plan“ | `plan2.save` | Passt, wenn du ansparst. | 4 |
| Sheet „Dein Plan“ | `plan2.proposal` | Spar ab {monat} {betrag} im Monat für {zahlung} an. | 9 |
| Sheet „Dein Plan“ | `plan2.proposal.even` | Spar alle großen Zahlungen gleichmäßig an. | 6 |
| Sheet „Dein Plan“ | `plan2.apply` | Übernehmen | 1 |
| Sheet „Dein Plan“ | `plan2.max` | Geht nicht ganz. Höchstens {betrag} Spielgeld sind möglich. | 3 · 5 |
| Sheet „Dein Plan“ | `plan2.max.apply` | Spielgeld auf {betrag} setzen | 4 |
| Sheet „Dein Plan“ | `plan2.short` | {monat} geht sich nicht aus. Dir fehlen {betrag}. | 5 · 3 |
| Sheet „Dein Plan“ | `plan2.none` | Leg dein Spielgeld fest. Dann prüft Erbse deinen Plan. | 4 · 5 |
| Sheet „Dein Plan“ | `plan2.noSalary` | Trag dein Gehalt ein. Dann rechnet Erbse deinen Plan. | 4 · 5 |
| Sheet „Dein Plan“ | `plan2.spielgeld` | Dein Spielgeld | 2 |
| Sheet „Dein Plan“ | `plan2.spielgeld.edit` | Spielgeld ändern | 2 |
| Sheet „Dein Plan“ | `plan2.mode` | Wie zahlst du große Zahlungen? | 5 |
| Sheet „Dein Plan“ | `plan2.mode.due` | Bei Fälligkeit | 2 |
| Sheet „Dein Plan“ | `plan2.mode.even` | Gleichmäßig | 1 |
| Sheet „Dein Plan“ | `plan2.mode.due.info` | Jede große Zahlung überweist du im Monat, in dem sie fällig ist. | 12 |
| Sheet „Dein Plan“ | `plan2.mode.even.info` | Du sparst alle großen Zahlungen vorher in gleichen Raten an. | 10 |
| Sheet „Dein Plan“ | `plan2.mode.custom.info` | Du hast Zahlungen einzeln geändert. | 5 |
| Sheet „Dein Plan“ | `plan2.custom` | Eigener Plan | 2 |
| Sheet „Dein Plan“ | `plan2.recommended` | Empfohlen | 1 |
| Sheet „Dein Plan“ | `plan2.table` | Deine nächsten Gehälter | 3 |
| Sheet „Dein Plan“ | `plan2.table.month` | Monat | 1 |
| Sheet „Dein Plan“ | `plan2.table.transfer` | aufs Konto | 2 |
| Sheet „Dein Plan“ | `plan2.table.aside` | zur Seite | 2 |
| Sheet „Dein Plan“ | `plan2.table.free` | frei für dich | 3 |
| Sheet „Dein Plan“ | `plan2.table.short` | weniger als dein Spielgeld | 4 |
| Sheet „Dein Plan“ | `plan2.table.more` | Alle 12 Monate | 3 |
| Sheet „Dein Plan“ | `plan2.table.less` | Nur 4 Monate | 3 |
| Sheet „Dein Plan“ | `plan2.table.planned` | geplant | 1 |
| Sheet „Dein Plan“ | `plan2.planned` | Ohne Eintrag geplant mit {betrag}. | 5 |
| Sheet „Dein Plan“ | `plan2.payments` | Große Zahlungen | 2 |
| Sheet „Dein Plan“ | `plan2.payments.empty` | In den nächsten 12 Monaten kommt keine große Zahlung. | 9 |
| Sheet „Dein Plan“ | `plan2.pay.due` | im {monat} zahlen | 3 |
| Sheet „Dein Plan“ | `plan2.pay.spread` | vorher ansparen: {n} × {betrag} ab {monat} | 6 |
| Sheet „Dein Plan“ | `plan2.pay.even` | gleichmäßig angespart | 2 |
| Sheet „Dein Plan“ | `plan2.pay.once` | komplett vom {gehalt} | 3 |
| Sheet „Dein Plan“ | `plan2.pay.oncePart` | {betrag} vom {gehalt}, Rest bei Fälligkeit | 6 |
| Sheet „Dein Plan“ | `plan2.pay.onceAll` | Komplett vom | 2 |
| Sheet „Dein Plan“ | `plan2.pay.oncePartLabel` | Teilbetrag vom | 2 |
| Sheet „Dein Plan“ | `plan2.pay.salary` | Von welchem Gehalt? | 3 |
| Sheet „Dein Plan“ | `plan2.pay.partAmount` | Teilbetrag | 1 |
| Sheet „Dein Plan“ | `plan2.pay.saved` | {betrag} schon angespart · {monat} noch {rest} | 6 |
| Sheet „Dein Plan“ | `plan2.pay.savedAll` | {betrag} schon angespart | 3 |
| Sheet „Dein Plan“ | `plan2.pay.edit` | ändern | 1 |
| Sheet „Dein Plan“ | `plan2.pay.when` | Wie zahlst du {zahlung}? | 4 |
| Sheet „Dein Plan“ | `plan2.pay.from` | Ansparen ab | 2 |
| Sheet „Dein Plan“ | `plan2.pay.ready` | Fertig | 1 |
| Gehalt (Auszahlungsmonat) | `salary.name` | {monat}-Gehalt | 1 |
| Gehalt (Auszahlungsmonat) | `salary.paid` | ausgezahlt am {datum} | 3 |
| Gehalt (Auszahlungsmonat) | `salary.comes` | kommt am {datum} | 3 |
| Gehalt (Auszahlungsmonat) | `salary.subtitle` | {gehalt}, {wann} | 2 |
| Gehalt (Auszahlungsmonat) | `salary.rule` | Dein Gehalt heißt nach dem Monat, in dem es kommt. | 10 |
| Einstellungen | `settings.account` | Eigenes Konto für Fixkosten | 4 |
| Einstellungen | `settings.account.yes` | Ja | 1 |
| Einstellungen | `settings.account.no` | Nein | 1 |
