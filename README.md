# Trainingstagebuch

Web-App zum Aufzeichnen und Auswerten von Krafttraining und Handball. Läuft komplett im Browser, funktioniert offline und lässt sich auf dem Handy wie eine App installieren. Kein Konto, kein Server: Alle Daten liegen in IndexedDB auf dem jeweiligen Gerät.

**App:** https://luis235465767.github.io/Trainingsapp/

## Auf dem Handy installieren

- **iPhone (Safari):** Link öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
- **Android (Chrome):** Link öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

Danach startet die App vom Home-Bildschirm im Vollbild und läuft auch ohne Internet. Nach einem Update lädt sie beim nächsten Öffnen automatisch die neue Version.

## Funktionen

- **Training:** leer oder aus einer Vorlage starten. „Satz hinzufügen“ übernimmt die Werte des letzten Satzes. Zu jeder Übung steht, was beim letzten Mal geschafft wurde. Neue Bestleistungen (schwerstes Gewicht oder bestes geschätztes 1RM) werden sofort hervorgehoben. Jede Eingabe wird direkt gespeichert. Ein laufendes Training lässt sich nach dem Schließen der App fortsetzen.
- **Übungsarten:** *Gewicht* (Wdh. × kg), *Körpergewicht* (Wdh., optional Zusatzgewicht, z. B. Klimmzüge, Dips) und *Zeit* (Sekunden, optional Zusatzgewicht, z. B. Plank). Bestleistungen und Statistik richten sich nach der Art: bei Körpergewicht meiste Wiederholungen, bei Zeit längste Dauer.
- **Übungen bearbeiten:** im Tab „Übungen“ auf „Bearbeiten“ tippen oder im Training direkt auf den Namen der Übung.
- **Handball:** Training oder Spiel mit Dauer und RPE (1–10). Belastung = Session-RPE = Dauer × RPE.
- **Gesamtbelastung & Ruhetag:** Krafttraining bekommt beim Beenden Dauer (automatisch gemessen) und RPE. So ist die Belastung (Dauer × RPE) mit Handball vergleichbar und wird zusammengerechnet. Die Karte „Heute“ auf der Startseite zeigt eine Ampel: *Training ok*, *locker trainieren* oder *Ruhetag empfohlen*, mit Begründung. In der Statistik steht die Belastung pro Woche, getrennt nach Kraft und Handball.
- **Verlauf:** alle Einheiten nach Monat, antippen zum Bearbeiten oder Löschen.
- **Statistik:** Gewichtsverlauf und geschätztes 1RM pro Übung, Wochenvolumen (gesamt oder pro Übung), Bestleistungen, Trainingskalender, wöchentliche Handball-Belastung. Zeitraum: 12 Wochen, 6 Monate, 1 Jahr oder alles.
- **Übungen, Vorlagen, Daten:** Übungen und Vorlagen verwalten. Export als CSV (für Excel), vollständiges Backup als JSON, Wiederherstellen aus dem Backup.
- **Beispieldaten:** Beim ersten Start werden 12 Wochen Beispieldaten angelegt. Entfernen über den Hinweis oben oder unter Übungen › Daten. Eigene Einträge bleiben dabei erhalten.

**Wichtig:** Die Daten liegen im Browser des Geräts. Mit der Synchronisierung (unten) zusätzlich in deinem privaten Gist. Auf dem iPhone die App unbedingt auf dem Home-Bildschirm installieren, sonst kann Safari die Daten nach 7 Tagen ohne Besuch löschen.

## Synchronisieren zwischen Geräten

Die Daten werden über ein **privates Gist** in deinem GitHub-Konto zwischen Handy, Tablet und Computer abgeglichen. Kein eigener Server, kostenlos. Einmal pro Gerät:

1. [Token erstellen](https://github.com/settings/personal-access-tokens/new?name=Trainingstagebuch-Sync&description=Synchronisierung%20Trainingstagebuch%20(nur%20Gists)&expires_in=366&gists=write) – der Link füllt Name, Ablauf (1 Jahr) und die einzige nötige Berechtigung **Gists** schon aus. Ganz unten „Generate token“ und das Token kopieren. Von Hand: unter „Permissions“ auf „Add permissions“, „Gists“ anhaken (es gibt dort nur eine Stufe, sie schließt Lesen ein), bei „Repository access“ nichts ändern.
2. In der App **Übungen › Daten › Synchronisierung** das Token einfügen und „Verbinden“ tippen.

Das erste Gerät legt das Gist an, weitere Geräte finden es automatisch. Das Token der Karteikarten-App funktioniert ebenfalls, denn es braucht dieselbe Berechtigung.

**So funktioniert es:**
- Abgeglichen wird beim Öffnen der App, etwa 3 Sekunden nach jeder Änderung, alle 2 Minuten bei geöffneter App und beim Wechsel in eine andere App.
- Ohne Netz (z. B. im Keller-Gym) wird lokal gespeichert und später automatisch synchronisiert.
- Jedes Gerät schreibt nur seine eigene Datei `geraet-<Kennung>.json` ins Gist. Pro Eintrag gewinnt die jüngste Änderung. Gelöschtes wird vermerkt und taucht auf anderen Geräten nicht wieder auf.
- Ein Backup wiederherstellen ersetzt die Daten auf allen verbundenen Geräten.
- Die automatischen Beispieldaten eines neuen Geräts bleiben auf diesem Gerät und werden nicht verteilt.
- Das Token liegt nur im Browser des jeweiligen Geräts. Weil alle Seiten unter `luis235465767.github.io` sich den Browser-Speicher teilen, sollte das Token wirklich nur Gists dürfen. Läuft es ab, zeigt die App das an. Dann ein neues Token erstellen und erneut verbinden.
- Die Uhrzeit der Geräte entscheidet, welche Änderung „jünger“ ist. Bearbeitest du dieselbe Einheit gleichzeitig auf zwei Geräten, gewinnt die zuletzt gespeicherte.


### Rechenregeln

| Kennzahl | Formel |
|---|---|
| Volumen | Summe aus Wiederholungen × Gewicht (pro Satz); bei Körpergewicht nur das Zusatzgewicht, Zeitübungen zählen nicht |
| Geschätztes 1RM (Epley) | Gewicht × (1 + Wdh./30), bester Satz einer Einheit |
| Gewichtsverlauf | schwerster Satz pro Einheit (bei gleichem Gewicht der mit mehr Wdh.) |
| Session-RPE | Dauer in Minuten × RPE |
| Woche | Montag bis Sonntag, Kalenderwoche nach ISO |
| Belastung Kraft | Dauer × RPE; ohne Angabe geschätzt: 3 min pro Satz (mind. 20 min) × RPE 6 |
| Akut : chronisch | Belastung der letzten 7 Tage ÷ Wochenschnitt der letzten 28 Tage (ab ca. 3 Wochen Daten) |
| Ruhetag (rot) | Verhältnis über 1,5, oder 6+ Trainingstage in Folge, oder ein besonders harter Tag (≥ 1,5× üblich) nach einem Trainingstag |
| Locker (gelb) | Verhältnis 1,3–1,5, oder 4–5 Trainingstage in Folge, oder ein besonders harter letzter Tag |

Die Empfehlung ist ein Richtwert aus den eigenen Daten, kein medizinischer Rat.

## Entwicklung

Voraussetzung: Node 20 oder neuer.

```sh
npm install        # einmalig
npm run dev        # Entwicklungsserver: http://localhost:5173
npm test           # Tests der Rechenlogik
npm run build      # fertige App nach dist/
npm run preview    # gebaute App lokal ansehen (mit Offline-Betrieb)
```

Zum Testen auf dem Handy im selben WLAN: `npm run dev -- --host`, dann die angezeigte Netzwerk-Adresse öffnen. Installieren und offline nutzen geht erst mit HTTPS, also über die veröffentlichte Version.

| Pfad | Inhalt |
|---|---|
| `src/model/types.ts` | Datenmodell |
| `src/db/` | Datenbank (Dexie): Schema, Speichern/Laden, Live-Abfragen |
| `src/logic/` | Rechenlogik als reine Funktionen: Kennzahlen, Datum, CSV/Backup, Zusammenführen |
| `src/sync/` | Synchronisierung über ein privates Gist |
| `src/seed/` | Beispieldaten |
| `src/components/` | Bausteine der Oberfläche |
| `src/pages/` | Seiten |
| `src/charts/` | Diagramme (Recharts) und Trainingskalender |
| `tests/` | Tests (Vitest) |

## Veröffentlichen

**GitHub Pages:** Jeder Push auf `main` testet und baut die App über `.github/workflows/pages.yml` und veröffentlicht sie unter `https://luis235465767.github.io/Trainingsapp/`. Einmalig nötig: im Repo unter **Settings → Pages → Build and deployment → Source** „GitHub Actions“ wählen. Den Fortschritt siehst du unter „Actions“.

**Netlify (Alternative, ebenfalls kostenlos):** Bei netlify.com mit GitHub anmelden → „Add new site“ → „Import an existing project“ → dieses Repo wählen. Build-Befehl und Ausgabeordner kommen aus `netlify.toml`. Die App liegt dann unter `https://<name>.netlify.app/`. Das ist eine andere Adresse mit eigenem Speicher, Daten also per Backup übertragen.
