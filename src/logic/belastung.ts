// Gesamtbelastung aus Kraft und Handball und die Ruhetag-Empfehlung. Reine Funktionen.
//
// Belastung = Dauer (min) × RPE („Session-RPE“, Foster). So sind Kraft und Handball vergleichbar.
// Für die Empfehlung werden drei bewährte Signale kombiniert:
// - Akut-zu-chronisch-Verhältnis (ACWR): Belastung der letzten 7 Tage im Vergleich zum
//   Wochenschnitt der letzten 28 Tage. Über 1,5 steigt das Überlastungsrisiko deutlich, 0,8–1,3 gilt als gut.
// - Trainingstage in Folge ohne Pause.
// - Wie hart der letzte Trainingstag im Vergleich zu einem üblichen Tag war.
// Das ist ein Richtwert aus den eigenen Daten, kein medizinischer Rat.
import type { HandballEinheit, KraftEinheit } from "../model/types";
import { plusTage, wochenStart } from "./datum";
import { gueltig, sessionRpe, wochenListe } from "./metriken";

/** Schätzung für Krafttrainings ohne Angabe: etwa 3 Minuten pro Satz, mindestens 20 Minuten, RPE 6. */
export const GESCHAETZT = { minProSatz: 3, minDauer: 20, rpe: 6 };

export function kraftBelastung(e: KraftEinheit): { wert: number; geschaetzt: boolean; dauerMin: number; rpe: number } {
  if (e.dauerMin && e.rpe) return { wert: e.dauerMin * e.rpe, geschaetzt: false, dauerMin: e.dauerMin, rpe: e.rpe };
  const saetze = e.eintraege.reduce((n, x) => n + x.saetze.filter(gueltig).length, 0);
  if (!saetze) return { wert: 0, geschaetzt: true, dauerMin: 0, rpe: 0 };
  const dauerMin = e.dauerMin || Math.max(GESCHAETZT.minDauer, saetze * GESCHAETZT.minProSatz);
  const rpe = e.rpe || GESCHAETZT.rpe;
  return { wert: dauerMin * rpe, geschaetzt: true, dauerMin, rpe };
}

export interface Tageslast { kraft: number; handball: number; gesamt: number }

export function tageslasten(kraft: KraftEinheit[], handball: HandballEinheit[]): Map<string, Tageslast> {
  const m = new Map<string, Tageslast>();
  const hole = (t: string) => m.get(t) ?? (m.set(t, { kraft: 0, handball: 0, gesamt: 0 }), m.get(t)!);
  for (const e of kraft) { const b = kraftBelastung(e).wert; const t = hole(e.datum); t.kraft += b; t.gesamt += b; }
  for (const h of handball) { const b = sessionRpe(h); const t = hole(h.datum); t.handball += b; t.gesamt += b; }
  return m;
}

/** Summe über die Tage von `von` bis `bis` (jeweils einschließlich). */
function summe(lasten: Map<string, Tageslast>, von: string, bis: string) {
  let s = 0;
  for (let t = von; t <= bis; t = plusTage(t, 1)) s += lasten.get(t)?.gesamt ?? 0;
  return s;
}

export interface WochenGesamt { woche: string; kraft: number; handball: number; gesamt: number }

export function wochenGesamt(lasten: Map<string, Tageslast>, bis: string, anzahl: number): WochenGesamt[] {
  const wochen = wochenListe(plusTage(bis, -7 * (anzahl - 1)), bis);
  const m = new Map(wochen.map(w => [w, { woche: w, kraft: 0, handball: 0, gesamt: 0 }]));
  for (const [tag, l] of lasten) {
    const w = m.get(wochenStart(tag));
    if (!w || tag > bis) continue;
    w.kraft += l.kraft; w.handball += l.handball; w.gesamt += l.gesamt;
  }
  return wochen.map(w => m.get(w)!);
}

export type Ampel = "gruen" | "gelb" | "rot";

export interface Empfehlung {
  ampel: Ampel;
  titel: string;
  gruende: string[];
  /** Für welchen Tag die Empfehlung gilt: heute (noch nicht trainiert) oder morgen (heute schon trainiert) */
  fuer: "heute" | "morgen";
  heute: Tageslast;
  akut: number;          // Summe der letzten 7 Tage
  chronisch: number;     // Wochenschnitt der letzten 28 Tage
  acwr: number | null;   // null, solange zu wenig Daten
  tageInFolge: number;
  genugDaten: boolean;
}

/**
 * Empfehlung für den nächsten Trainingstag. Hat man heute schon trainiert, gilt sie für morgen
 * und bezieht heute mit ein; sonst gilt sie für heute und schaut bis gestern.
 */
export function empfehlung(lasten: Map<string, Tageslast>, heuteTag: string): Empfehlung {
  const heute = lasten.get(heuteTag) ?? { kraft: 0, handball: 0, gesamt: 0 };
  const fuer = heute.gesamt > 0 ? "morgen" : "heute";
  const bis = fuer === "morgen" ? heuteTag : plusTage(heuteTag, -1); // letzter berücksichtigter Tag

  const akut = summe(lasten, plusTage(bis, -6), bis);
  const chronisch = summe(lasten, plusTage(bis, -27), bis) / 4;
  const ersterTag = [...lasten.entries()].filter(([, l]) => l.gesamt > 0).map(([t]) => t).sort()[0];
  const genugDaten = !!ersterTag && ersterTag <= plusTage(bis, -20) && chronisch > 0; // mindestens 3 Wochen Verlauf
  const acwr = genugDaten ? akut / chronisch : null;

  let tageInFolge = 0;
  for (let t = bis; (lasten.get(t)?.gesamt ?? 0) > 0; t = plusTage(t, -1)) tageInFolge++;

  // Wie hart war der letzte Trainingstag im Vergleich zu einem üblichen Trainingstag (28 Tage)?
  const trainingstage: number[] = [];
  for (let t = plusTage(bis, -27); t <= bis; t = plusTage(t, 1)) { const g = lasten.get(t)?.gesamt ?? 0; if (g > 0) trainingstage.push(g); }
  const ueblich = trainingstage.length ? trainingstage.reduce((a, b) => a + b, 0) / trainingstage.length : 0;
  const letzter = lasten.get(bis)?.gesamt ?? 0;
  const hart = ueblich > 0 && trainingstage.length >= 4 && letzter >= 1.5 * ueblich;

  const rot: string[] = [], gelb: string[] = [], info: string[] = [];
  const tagWort = fuer === "morgen" ? "heute" : "gestern";
  const r = (x: number) => x.toFixed(2).replace(".", ",");

  if (acwr !== null) {
    if (acwr > 1.5) rot.push(`Die letzten 7 Tage waren ${r(acwr)}× so belastend wie dein Schnitt der letzten 4 Wochen (über 1,5 = erhöhtes Überlastungsrisiko).`);
    else if (acwr > 1.3) gelb.push(`Die letzten 7 Tage lagen bei ${r(acwr)}× deinem 4-Wochen-Schnitt (ideal 0,8–1,3).`);
    else if (acwr < 0.8) info.push(`Du bist unter deinem gewohnten Niveau (${r(acwr)}×). Steigern ist möglich.`);
    else info.push(`Belastung im grünen Bereich (${r(acwr)}× dein 4-Wochen-Schnitt).`);
  }
  if (tageInFolge >= 6) rot.push(`${tageInFolge} Trainingstage in Folge ohne Pause.`);
  else if (tageInFolge >= 4) gelb.push(`${tageInFolge} Trainingstage in Folge.`);
  if (hart && tageInFolge >= 2) rot.push(`${tagWort[0].toUpperCase() + tagWort.slice(1)} war ein besonders harter Tag (${Math.round(letzter)} statt üblich ${Math.round(ueblich)}), und du hast davor auch trainiert.`);
  else if (hart) gelb.push(`${tagWort[0].toUpperCase() + tagWort.slice(1)} war ein besonders harter Tag (${Math.round(letzter)} statt üblich ${Math.round(ueblich)}).`);
  if (!genugDaten) info.push("Für den Vergleich mit deinem Durchschnitt braucht es etwa 3 Wochen Daten.");

  const ampel: Ampel = rot.length ? "rot" : gelb.length ? "gelb" : "gruen";
  const titel = ampel === "rot" ? (fuer === "morgen" ? "Morgen Ruhetag empfohlen" : "Heute Ruhetag empfohlen")
    : ampel === "gelb" ? (fuer === "morgen" ? "Morgen locker trainieren" : "Heute locker trainieren")
    : fuer === "morgen" ? "Morgen kannst du normal trainieren" : "Training ok";
  return { ampel, titel, gruende: [...rot, ...gelb, ...info], fuer, heute, akut, chronisch, acwr, tageInFolge, genugDaten };
}
