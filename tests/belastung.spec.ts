import { describe, expect, it } from "vitest";
import { empfehlung, kraftBelastung, tageslasten, wochenGesamt, type Tageslast } from "../src/logic/belastung";
import { plusTage } from "../src/logic/datum";
import type { KraftEinheit } from "../src/model/types";

const HEUTE = "2026-10-24";
const kraft = (datum: string, dauerMin?: number, rpe?: number, saetze = 9): KraftEinheit => ({
  id: datum, datum, dauerMin, rpe, eintraege: [{ uebungId: "u", saetze: Array.from({ length: saetze }, () => ({ wdh: 5, kg: 100 })) }],
});
/** Gleichmäßiges Training: jeden zweiten Tag `last`, über `tage` Tage bis einschließlich `bis`. */
function verlauf(bis: string, tage: number, last: number, abstand = 2) {
  const m = new Map<string, Tageslast>();
  for (let i = 0; i < tage; i += abstand) m.set(plusTage(bis, -i), { kraft: last, handball: 0, gesamt: last });
  return m;
}

describe("Belastung", () => {
  it("Kraft mit Angaben: Dauer × RPE", () => {
    expect(kraftBelastung(kraft(HEUTE, 60, 7))).toMatchObject({ wert: 420, geschaetzt: false });
  });
  it("Kraft ohne Angaben wird aus der Satzzahl geschätzt", () => {
    expect(kraftBelastung(kraft(HEUTE, undefined, undefined, 12))).toEqual({ wert: 36 * 6, geschaetzt: true, dauerMin: 36, rpe: 6 });
    expect(kraftBelastung(kraft(HEUTE, undefined, undefined, 3)).dauerMin).toBe(20);
    expect(kraftBelastung(kraft(HEUTE, undefined, undefined, 0)).wert).toBe(0);
  });
  it("Tages- und Wochensummen aus Kraft und Handball", () => {
    const l = tageslasten([kraft("2026-10-20", 60, 7)], [{ id: "h", datum: "2026-10-20", art: "Spiel", dauerMin: 60, rpe: 8 }]);
    expect(l.get("2026-10-20")).toEqual({ kraft: 420, handball: 480, gesamt: 900 });
    expect(wochenGesamt(l, HEUTE, 1)).toEqual([{ woche: "2026-10-19", kraft: 420, handball: 480, gesamt: 900 }]);
  });
});

describe("Ruhetag-Empfehlung", () => {
  it("gleichmäßiges Training ist grün", () => {
    const e = empfehlung(verlauf(plusTage(HEUTE, -1), 42, 400), HEUTE);
    expect(e.ampel).toBe("gruen");
    expect(e.fuer).toBe("heute");
    expect(e.acwr).toBeGreaterThan(0.8);
    expect(e.acwr).toBeLessThan(1.3);
  });
  it("starker Anstieg der letzten Woche ergibt Ruhetag", () => {
    const l = verlauf(plusTage(HEUTE, -1), 42, 300);
    for (let i = 1; i <= 7; i++) l.set(plusTage(HEUTE, -i), { kraft: 600, handball: 0, gesamt: 600 }); // jeden Tag hart
    const e = empfehlung(l, HEUTE);
    expect(e.ampel).toBe("rot");
    expect(e.titel).toBe("Heute Ruhetag empfohlen");
    expect(e.tageInFolge).toBeGreaterThanOrEqual(7);
  });
  it("vier Tage in Folge: locker trainieren", () => {
    const l = verlauf(plusTage(HEUTE, -6), 42, 400); // Tag -5 ist Pause
    for (let i = 1; i <= 4; i++) l.set(plusTage(HEUTE, -i), { kraft: 400, handball: 0, gesamt: 400 });
    const e = empfehlung(l, HEUTE);
    expect(e.tageInFolge).toBe(4);
    expect(["gelb", "rot"]).toContain(e.ampel);
  });
  it("heute schon trainiert: Empfehlung gilt für morgen", () => {
    const l = verlauf(HEUTE, 42, 400);
    expect(empfehlung(l, HEUTE).fuer).toBe("morgen");
    expect(empfehlung(l, HEUTE).titel).toMatch(/^Morgen/);
  });
  it("zu wenig Daten: kein Verhältnis, aber Hinweis", () => {
    const e = empfehlung(verlauf(plusTage(HEUTE, -1), 6, 400), HEUTE);
    expect(e.acwr).toBeNull();
    expect(e.genugDaten).toBe(false);
    expect(e.gruende.join(" ")).toMatch(/3 Wochen/);
  });
  it("keine Daten: grün ohne Fehler", () => {
    const e = empfehlung(new Map(), HEUTE);
    expect(e).toMatchObject({ ampel: "gruen", akut: 0, tageInFolge: 0 });
  });
});
