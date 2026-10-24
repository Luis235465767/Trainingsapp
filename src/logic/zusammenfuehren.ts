// Zusammenführen von Datenständen mehrerer Geräte. Reine Funktionen.
//
// Regel: Pro Eintrag gewinnt die jüngste Änderung (Feld `geaendert`). Eine Löschmarke gewinnt gegen
// jede Version, die nicht später geändert wurde. Löschmarken werden nie entfernt, damit ein altes
// Gerät gelöschte Einträge nicht zurückbringt. Das Ergebnis ist unabhängig von der Reihenfolge,
// in der die Geräte abgeglichen werden.
import { TABELLEN, type Loeschmarke, type Stand, type Tabelle } from "../model/types";

type Eintrag = { id: string; geaendert?: number };

export const leererStand = (): Stand => ({ uebungen: [], kraftEinheiten: [], vorlagen: [], handballEinheiten: [], geloescht: [] });

const zeit = (x: Eintrag) => x.geaendert ?? 0;
const text = (x: unknown) => JSON.stringify(x);

/** Bei gleichem Zeitstempel entscheidet der Inhalt, damit alle Geräte zum selben Ergebnis kommen. */
function neuer<T extends Eintrag>(a: T, b: T): T {
  if (zeit(a) !== zeit(b)) return zeit(a) > zeit(b) ? a : b;
  return text(a) >= text(b) ? a : b;
}

export function fuehreZusammen(...staende: Stand[]): Stand {
  const marken = new Map<string, Loeschmarke>();
  for (const s of staende) {
    for (const m of s.geloescht) {
      const alt = marken.get(m.id);
      if (!alt || m.zeit > alt.zeit) marken.set(m.id, m);
    }
  }
  const ergebnis = leererStand();
  for (const t of TABELLEN) {
    const m = new Map<string, Eintrag>();
    for (const s of staende) for (const x of s[t] as Eintrag[]) m.set(x.id, m.has(x.id) ? neuer(m.get(x.id)!, x) : x);
    (ergebnis[t] as Eintrag[]) = [...m.values()].filter(x => {
      const marke = marken.get(x.id);
      return !marke || zeit(x) > marke.zeit;
    });
  }
  ergebnis.geloescht = [...marken.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const t of TABELLEN) (ergebnis[t] as Eintrag[]).sort((a, b) => a.id.localeCompare(b.id));
  return ergebnis;
}

/**
 * Was hochgeladen wird: unveränderte Beispieldaten (ohne Zeitstempel) bleiben auf dem Gerät.
 * So verteilt ein neues Gerät seine Beispieldaten nicht an die anderen.
 */
export function zumHochladen(s: Stand): Stand {
  const r = leererStand();
  for (const t of TABELLEN) (r[t] as Eintrag[]) = (s[t] as (Eintrag & { beispiel?: boolean })[]).filter(x => !(x.beispiel && !x.geaendert));
  r.geloescht = s.geloescht;
  return r;
}

export const gleicherStand = (a: Stand, b: Stand) => text(fuehreZusammen(a)) === text(fuehreZusammen(b));

// ---------- Synchronisierungsdatei prüfen ----------

const istText = (x: unknown): x is string => typeof x === "string";
const istZahl = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const istTag = (x: unknown) => istText(x) && /^\d{4}-\d{2}-\d{2}$/.test(x);
const optText = (x: unknown) => x === undefined || x === null || istText(x);
const optZahl = (x: unknown) => x === undefined || x === null || istZahl(x);
const satzOk = (s: any) => s && istZahl(s.wdh) && istZahl(s.kg) && optZahl(s.sek);

const PRUEFUNG: Record<Tabelle, (x: any) => boolean> = {
  uebungen: u => istText(u.name) && istText(u.kategorie) && optText(u.notiz) && (u.art === undefined || u.art === null || ["gewicht", "koerpergewicht", "zeit"].includes(u.art)),
  kraftEinheiten: e => istTag(e.datum) && optText(e.notiz) && optZahl(e.dauerMin) && optZahl(e.rpe) && optZahl(e.gestartet) && Array.isArray(e.eintraege) &&
    e.eintraege.every((x: any) => x && istText(x.uebungId) && Array.isArray(x.saetze) && x.saetze.every(satzOk)),
  vorlagen: v => istText(v.name) && Array.isArray(v.uebungen) &&
    v.uebungen.every((x: any) => x && istText(x.uebungId) && optZahl(x.zielSaetze) && optZahl(x.zielWdh) && optZahl(x.zielSek)),
  handballEinheiten: h => istTag(h.datum) && (h.art === "Training" || h.art === "Spiel") && istZahl(h.dauerMin) && istZahl(h.rpe) && optText(h.notiz),
};

/** Liest den Stand aus einer Gerätedatei. Ungültige Einträge werden übersprungen, nicht die ganze Datei. */
export function pruefeStand(daten: unknown): { stand: Stand; uebersprungen: number } | null {
  if (!daten || typeof daten !== "object") return null;
  const d = daten as Record<string, any>;
  if (d.app !== "trainingstagebuch" || !d.stand || typeof d.stand !== "object") return null;
  const stand = leererStand();
  let uebersprungen = 0;
  for (const t of TABELLEN) {
    const liste = Array.isArray(d.stand[t]) ? d.stand[t] : [];
    for (const x of liste) {
      if (x && typeof x === "object" && istText(x.id) && optZahl(x.geaendert) && PRUEFUNG[t](x)) (stand[t] as unknown[]).push(x);
      else uebersprungen++;
    }
  }
  for (const m of Array.isArray(d.stand.geloescht) ? d.stand.geloescht : []) {
    if (m && istText(m.id) && TABELLEN.includes(m.tabelle) && istZahl(m.zeit)) stand.geloescht.push(m);
    else uebersprungen++;
  }
  return { stand, uebersprungen };
}
