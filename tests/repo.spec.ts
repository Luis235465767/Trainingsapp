import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { leseStand } from "../src/db/stand";
import { beiAenderung, legeBeispieldatenAn, loescheBeispieldaten, loescheHandball, speichereHandball, speichereKraft, stelleWiederHer } from "../src/db/repo";
import { zumHochladen } from "../src/logic/zusammenfuehren";

describe("Speichern mit Zeitstempel und Löschmarken", () => {
  it("stempelt, markiert Löschungen und meldet Änderungen", async () => {
    let meldungen = 0;
    const ab = beiAenderung(() => meldungen++);
    await speichereHandball({ id: "h1", datum: "2026-10-20", art: "Spiel", dauerMin: 60, rpe: 8 });
    const h = await db.handballEinheiten.get("h1");
    expect(h?.geaendert).toBeGreaterThan(0);
    await loescheHandball("h1");
    expect(await db.geloescht.get("h1")).toMatchObject({ tabelle: "handballEinheiten" });
    expect(meldungen).toBe(2);
    ab();
  });

  it("automatische Beispieldaten bleiben lokal, bis eine Beispiel-Übung benutzt wird", async () => {
    await legeBeispieldatenAn({ automatisch: true });
    expect(zumHochladen(await leseStand(db)).uebungen).toHaveLength(0);
    await speichereKraft({ id: "eigen", datum: "2026-10-21", eintraege: [{ uebungId: "bsp-bank", saetze: [{ wdh: 5, kg: 80 }] }] });
    expect(zumHochladen(await leseStand(db)).uebungen.map(u => u.id)).toEqual(["bsp-bank"]);
    await loescheBeispieldaten();
    const s = await leseStand(db);
    expect(s.uebungen.map(u => u.id)).toEqual(["bsp-bank"]); // wird noch gebraucht
    expect(s.kraftEinheiten.map(e => e.id)).toEqual(["eigen"]);
    expect(s.geloescht.filter(m => m.id.startsWith("bsp-")).length).toBeGreaterThan(40);
  });

  it("Wiederherstellen markiert alles Fehlende als gelöscht", async () => {
    await stelleWiederHer({ app: "trainingstagebuch", version: 1, erstellt: "", uebungen: [{ id: "u", name: "U", kategorie: "Brust" }], kraftEinheiten: [], vorlagen: [], handballEinheiten: [] });
    const s = await leseStand(db);
    expect(s.uebungen.map(u => u.id)).toEqual(["u"]);
    expect(s.uebungen[0].geaendert).toBeGreaterThan(0);
    expect(s.kraftEinheiten).toHaveLength(0);
    expect(s.geloescht.some(m => m.id === "eigen" && m.tabelle === "kraftEinheiten")).toBe(true);
  });
});
