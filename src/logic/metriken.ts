// Kennzahlen fürs Krafttraining und Handball. Reine Funktionen ohne Datenbank.
import type { HandballEinheit, Id, KraftEinheit, Satz, UebungsArt } from "../model/types";
import { plusTage, wochenStart } from "./datum";

/** Geschätztes 1RM nach Epley: Gewicht × (1 + Wdh/30). */
export const epley = (kg: number, wdh: number) => (wdh > 0 && kg > 0 ? kg * (1 + wdh / 30) : 0);

export const satzVolumen = (s: Satz) => s.wdh * s.kg;

export const volumen = (saetze: Satz[]) => saetze.reduce((summe, s) => summe + satzVolumen(s), 0);

export const sessionRpe = (h: Pick<HandballEinheit, "dauerMin" | "rpe">) => h.dauerMin * h.rpe;

/** Ein Satz zählt, wenn mindestens eine Wiederholung oder eine Dauer eingetragen ist. */
export const gueltig = (s: Satz) => s.wdh > 0 || (s.sek ?? 0) > 0;

const zahlFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

/** Dauer lesbar: 45 s, 1:30 min */
export const fmtSek = (sek: number) => (sek < 60 ? `${sek} s` : `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, "0")} min`);

/** Satz als kurzer Text je nach Übungsart: „5×100 kg“, „12 Wdh. (+10 kg)“, „45 s“. */
export function satzText(s: Satz, art: UebungsArt = "gewicht") {
  const zusatz = s.kg > 0 ? ` (+${zahlFmt.format(s.kg)} kg)` : "";
  if (art === "zeit") return fmtSek(s.sek ?? 0) + zusatz;
  if (art === "koerpergewicht") return `${s.wdh} Wdh.${zusatz}`;
  return `${s.wdh}×${zahlFmt.format(s.kg)} kg`;
}

/** Schwerster Satz: höchstes Gewicht, bei Gleichstand mehr Wiederholungen. */
export function schwersterSatz(saetze: Satz[]): Satz | undefined {
  let best: Satz | undefined;
  for (const s of saetze.filter(gueltig)) {
    if (!best || s.kg > best.kg || (s.kg === best.kg && s.wdh > best.wdh)) best = s;
  }
  return best;
}

export const bestesE1rm = (saetze: Satz[]) => Math.max(0, ...saetze.filter(gueltig).map(s => epley(s.kg, s.wdh)));

const nachDatum = <T extends { datum: string }>(a: T[]) => [...a].sort((x, y) => x.datum.localeCompare(y.datum));

/** Sätze einer Übung in einer Einheit (mehrfach aufgeführte Übungen werden zusammengefasst). */
export const saetzeVon = (e: KraftEinheit, uebungId: Id) =>
  e.eintraege.filter(x => x.uebungId === uebungId).flatMap(x => x.saetze).filter(gueltig);

export interface VerlaufsPunkt {
  datum: string;
  einheitId: Id;
  maxKg: number;
  wdhBeiMax: number;
  e1rm: number;
  volumen: number;
  /** meiste Wiederholungen in einem Satz */
  maxWdh: number;
  summeWdh: number;
  /** längste Dauer eines Satzes in Sekunden */
  maxSek: number;
  summeSek: number;
}

/** Ein Punkt pro Einheit, in der die Übung vorkommt, nach Datum sortiert. */
export function verlauf(einheiten: KraftEinheit[], uebungId: Id): VerlaufsPunkt[] {
  const punkte: VerlaufsPunkt[] = [];
  for (const e of nachDatum(einheiten)) {
    const saetze = saetzeVon(e, uebungId);
    const top = schwersterSatz(saetze);
    if (!top) continue;
    punkte.push({
      datum: e.datum, einheitId: e.id, maxKg: top.kg, wdhBeiMax: top.wdh, e1rm: bestesE1rm(saetze), volumen: volumen(saetze),
      maxWdh: Math.max(...saetze.map(x => x.wdh)), summeWdh: saetze.reduce((a, x) => a + x.wdh, 0),
      maxSek: Math.max(...saetze.map(x => x.sek ?? 0)), summeSek: saetze.reduce((a, x) => a + (x.sek ?? 0), 0),
    });
  }
  return punkte;
}

export interface Bestleistung {
  maxKg?: { kg: number; wdh: number; datum: string };
  e1rm?: { wert: number; kg: number; wdh: number; datum: string };
  volumen?: { wert: number; datum: string };
  /** meiste Wiederholungen in einem Satz (bei gleicher Zahl das höhere Zusatzgewicht) */
  maxWdh?: { wdh: number; kg: number; datum: string };
  /** längste Dauer in einem Satz */
  maxSek?: { sek: number; kg: number; datum: string };
  einheiten: number;
}

export function bestleistungen(einheiten: KraftEinheit[], uebungId: Id): Bestleistung {
  const r: Bestleistung = { einheiten: 0 };
  for (const e of nachDatum(einheiten)) {
    const saetze = saetzeVon(e, uebungId);
    if (!saetze.length) continue;
    r.einheiten++;
    for (const s of saetze) {
      if (!r.maxKg || s.kg > r.maxKg.kg || (s.kg === r.maxKg.kg && s.wdh > r.maxKg.wdh)) r.maxKg = { kg: s.kg, wdh: s.wdh, datum: e.datum };
      const w = epley(s.kg, s.wdh);
      if (!r.e1rm || w > r.e1rm.wert) r.e1rm = { wert: w, kg: s.kg, wdh: s.wdh, datum: e.datum };
      if (s.wdh > 0 && (!r.maxWdh || s.wdh > r.maxWdh.wdh || (s.wdh === r.maxWdh.wdh && s.kg > r.maxWdh.kg))) r.maxWdh = { wdh: s.wdh, kg: s.kg, datum: e.datum };
      const sek = s.sek ?? 0;
      if (sek > 0 && (!r.maxSek || sek > r.maxSek.sek || (sek === r.maxSek.sek && s.kg > r.maxSek.kg))) r.maxSek = { sek, kg: s.kg, datum: e.datum };
    }
    const v = volumen(saetze);
    if (!r.volumen || v > r.volumen.wert) r.volumen = { wert: v, datum: e.datum };
  }
  return r;
}

/**
 * Letzte frühere Einheit mit dieser Übung (vor oder am selben Tag, ohne die aktuelle Einheit).
 */
export function letztesMal(einheiten: KraftEinheit[], uebungId: Id, aktuelleId: Id, bisDatum: string) {
  const kandidaten = einheiten
    .filter(e => e.id !== aktuelleId && e.datum <= bisDatum && saetzeVon(e, uebungId).length)
    .sort((a, b) => b.datum.localeCompare(a.datum));
  const e = kandidaten[0];
  return e ? { datum: e.datum, saetze: saetzeVon(e, uebungId) } : undefined;
}

export interface Rekord {
  /** schwerstes Gewicht bzw. Zusatzgewicht */
  gewicht: boolean;
  /** bestes geschätztes 1RM (nur Gewichtsübungen) */
  e1rm: boolean;
  /** meiste Wiederholungen bei mindestens gleichem Zusatzgewicht (Körpergewicht) */
  wdh: boolean;
  /** längste Dauer bei mindestens gleichem Zusatzgewicht (Zeit) */
  zeit: boolean;
}

export const istRekord = (r?: Rekord) => !!r && (r.gewicht || r.e1rm || r.wdh || r.zeit);

/**
 * Prüft, ob ein Satz eine neue Bestleistung ist, verglichen mit allen früheren Einheiten und den
 * vorherigen Sätzen derselben Übung in dieser Einheit. Was zählt, hängt von der Übungsart ab.
 * Ohne frühere Daten gibt es keine Bestleistung (sonst wäre jeder erste Satz eine).
 */
export function pruefeRekord(satz: Satz, frueher: Satz[], vorherInEinheit: Satz[], art: UebungsArt = "gewicht"): Rekord {
  const r = { gewicht: false, e1rm: false, wdh: false, zeit: false };
  const vorher = frueher.filter(gueltig);
  if (!gueltig(satz) || !vorher.length) return r;
  const alle = [...vorher, ...vorherInEinheit.filter(gueltig)];
  const maxKg = Math.max(0, ...alle.map(s => s.kg));
  r.gewicht = satz.kg > 0 && satz.kg > maxKg;
  if (art === "gewicht") {
    if (satz.kg <= 0) return { ...r, gewicht: false };
    const maxE = Math.max(0, ...alle.map(s => epley(s.kg, s.wdh)));
    r.e1rm = epley(satz.kg, satz.wdh) > maxE + 1e-9;
  } else if (art === "koerpergewicht") {
    const vergleich = alle.filter(s => s.kg >= satz.kg);
    r.wdh = satz.wdh > Math.max(0, ...vergleich.map(s => s.wdh));
  } else {
    const vergleich = alle.filter(s => s.kg >= satz.kg);
    r.zeit = (satz.sek ?? 0) > Math.max(0, ...vergleich.map(s => s.sek ?? 0));
  }
  return r;
}

/** Text zur Bestleistung, z. B. „schwerstes Gewicht · bestes 1RM“. */
export function rekordText(r: Rekord, art: UebungsArt = "gewicht") {
  const teile: string[] = [];
  if (r.gewicht) teile.push(art === "gewicht" ? "schwerstes Gewicht" : "höchstes Zusatzgewicht");
  if (r.e1rm) teile.push("bestes 1RM");
  if (r.wdh) teile.push("meiste Wiederholungen");
  if (r.zeit) teile.push("längste Dauer");
  return teile.join(" · ");
}

/** Alle Sätze einer Übung aus Einheiten vor der aktuellen (früheres Datum oder gleicher Tag, andere Einheit). */
export function fruehereSaetze(einheiten: KraftEinheit[], uebungId: Id, aktuelleId: Id, bisDatum: string) {
  return einheiten.filter(e => e.id !== aktuelleId && e.datum <= bisDatum).flatMap(e => saetzeVon(e, uebungId));
}

/** Lückenlose Liste von Wochenanfängen (Montage) von bis einschließlich. */
export function wochenListe(vonTag: string, bisTag: string): string[] {
  const r: string[] = [];
  for (let w = wochenStart(vonTag), ende = wochenStart(bisTag); w <= ende; w = plusTage(w, 7)) r.push(w);
  return r;
}

export interface WochenVolumen {
  woche: string;
  volumen: number;
}

/**
 * Summe pro Woche über die letzten `anzahl` Wochen bis `bis`; uebungId = null für alle Übungen.
 * Standard ist das Volumen (Wdh. × kg). Mit `wert` lassen sich z. B. Wiederholungen oder Sekunden summieren.
 */
export function wochenVolumen(einheiten: KraftEinheit[], uebungId: Id | null, bis: string, anzahl: number, wert: (s: Satz) => number = satzVolumen): WochenVolumen[] {
  const wochen = wochenListe(plusTage(bis, -7 * (anzahl - 1)), bis);
  const summen = new Map(wochen.map(w => [w, 0]));
  for (const e of einheiten) {
    const w = wochenStart(e.datum);
    if (!summen.has(w)) continue;
    const saetze = uebungId ? saetzeVon(e, uebungId) : e.eintraege.flatMap(x => x.saetze).filter(gueltig);
    summen.set(w, summen.get(w)! + saetze.reduce((summe, x) => summe + wert(x), 0));
  }
  return wochen.map(w => ({ woche: w, volumen: summen.get(w)! }));
}

export interface WochenBelastung {
  woche: string;
  training: number;
  spiel: number;
  gesamt: number;
}

export function wochenBelastung(einheiten: HandballEinheit[], bis: string, anzahl: number): WochenBelastung[] {
  const wochen = wochenListe(plusTage(bis, -7 * (anzahl - 1)), bis);
  const m = new Map(wochen.map(w => [w, { woche: w, training: 0, spiel: 0, gesamt: 0 }]));
  for (const h of einheiten) {
    const eintrag = m.get(wochenStart(h.datum));
    if (!eintrag) continue;
    const last = sessionRpe(h);
    if (h.art === "Spiel") eintrag.spiel += last;
    else eintrag.training += last;
    eintrag.gesamt += last;
  }
  return wochen.map(w => m.get(w)!);
}

export interface Kalendertag {
  kraft: number;
  handball: number;
}

export function kalender(kraft: KraftEinheit[], handball: HandballEinheit[]): Map<string, Kalendertag> {
  const m = new Map<string, Kalendertag>();
  const hole = (t: string) => m.get(t) ?? (m.set(t, { kraft: 0, handball: 0 }), m.get(t)!);
  kraft.forEach(e => hole(e.datum).kraft++);
  handball.forEach(h => hole(h.datum).handball++);
  return m;
}

export const runde = (x: number, stellen = 1) => Math.round(x * 10 ** stellen) / 10 ** stellen;

const zahl = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
export const fmt = (x: number) => zahl.format(x);
