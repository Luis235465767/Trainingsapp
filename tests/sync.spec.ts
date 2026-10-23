import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import { fuehreZusammen, leererStand, pruefeStand, zumHochladen } from "../src/logic/zusammenfuehren";
import { TrainingDB } from "../src/db/schema";
import { leseStand, uebernimmStand } from "../src/db/stand";
import { erzeugeSync, type Konfig } from "../src/sync/sync";
import type { FetchFn } from "../src/sync/gist";
import type { HandballEinheit, Stand } from "../src/model/types";

const hb = (id: string, geaendert: number, rpe = 5): HandballEinheit => ({ id, datum: "2026-10-20", art: "Training", dauerMin: 60, rpe, geaendert });
const stand = (teil: Partial<Stand>): Stand => ({ ...leererStand(), ...teil });

describe("Zusammenführen", () => {
  it("jüngste Änderung gewinnt, Reihenfolge egal", () => {
    const a = stand({ handballEinheiten: [hb("1", 100, 5), hb("2", 100)] });
    const b = stand({ handballEinheiten: [hb("1", 200, 8), hb("3", 50)] });
    const ab = fuehreZusammen(a, b), ba = fuehreZusammen(b, a);
    expect(ab).toEqual(ba);
    expect(ab.handballEinheiten.map(h => [h.id, h.rpe])).toEqual([["1", 8], ["2", 5], ["3", 5]]);
  });
  it("Löschmarke schlägt ältere Versionen, spätere Änderung schlägt Löschmarke", () => {
    const geloescht = stand({ geloescht: [{ id: "1", tabelle: "handballEinheiten", zeit: 150 }, { id: "2", tabelle: "handballEinheiten", zeit: 150 }] });
    const r = fuehreZusammen(stand({ handballEinheiten: [hb("1", 100), hb("2", 200)] }), geloescht);
    expect(r.handballEinheiten.map(h => h.id)).toEqual(["2"]);
    expect(r.geloescht).toHaveLength(2);
  });
  it("unveränderte Beispieldaten werden nicht hochgeladen", () => {
    const s = stand({ uebungen: [{ id: "bsp-a", name: "A", kategorie: "Brust", beispiel: true }, { id: "bsp-b", name: "B", kategorie: "Brust", beispiel: true, geaendert: 5 }, { id: "x", name: "X", kategorie: "Brust" }] });
    expect(zumHochladen(s).uebungen.map(u => u.id)).toEqual(["bsp-b", "x"]);
  });
  it("defekte Einträge einer Gerätedatei werden übersprungen", () => {
    const r = pruefeStand({ app: "trainingstagebuch", stand: { handballEinheiten: [hb("1", 1), { id: "2", datum: "kaputt" }], geloescht: [{ id: "z", tabelle: "uebungen", zeit: 3 }, { id: 1 }] } });
    expect(r?.stand.handballEinheiten.map(h => h.id)).toEqual(["1"]);
    expect(r?.stand.geloescht).toHaveLength(1);
    expect(r?.uebersprungen).toBe(2);
    expect(pruefeStand({ app: "andere" })).toBeNull();
  });
});

describe("Übernehmen in die Datenbank", () => {
  it("schreibt Neues, löscht Markiertes und behält lokale neuere Änderungen", async () => {
    const d = new TrainingDB("test-uebernehmen");
    await d.handballEinheiten.bulkPut([hb("lokal-neu", 300, 9), hb("weg", 100), hb("bleibt", 100)]);
    const n = await uebernimmStand(d, stand({
      handballEinheiten: [hb("lokal-neu", 200, 2), hb("fremd", 150)],
      geloescht: [{ id: "weg", tabelle: "handballEinheiten", zeit: 120 }],
    }));
    const s = await leseStand(d);
    expect(s.handballEinheiten.map(h => [h.id, h.rpe])).toEqual([["bleibt", 5], ["fremd", 5], ["lokal-neu", 9]]);
    expect(s.geloescht.map(m => m.id)).toEqual(["weg"]);
    expect(n).toBe(2);
    expect(await uebernimmStand(d, stand({}))).toBe(0);
  });
});

/** Ein Gist-Server im Speicher, wie die echte API ihn beantwortet. */
function fakeGitHub(gueltigesToken = "gut") {
  const gists = new Map<string, { description: string; files: Record<string, string> }>();
  let n = 0;
  const antwort = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  const fetchFn: FetchFn = async (url, init) => {
    if (init?.headers && (init.headers as Record<string, string>).Authorization !== `Bearer ${gueltigesToken}`) return antwort(401, {});
    const pfad = url.replace("https://api.github.com", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (pfad.startsWith("/gists?")) return antwort(200, [...gists].map(([id, g]) => ({ id, description: g.description })));
    if (pfad === "/gists" && init?.method === "POST") {
      const id = `g${++n}`;
      gists.set(id, { description: body.description, files: Object.fromEntries(Object.entries(body.files).map(([k, v]: [string, any]) => [k, v.content])) });
      return antwort(201, { id });
    }
    const g = gists.get(pfad.slice("/gists/".length));
    if (!g) return antwort(404, {});
    if (init?.method === "PATCH") {
      for (const [k, v] of Object.entries(body.files) as [string, any][]) g.files[k] = v.content;
      return antwort(200, {});
    }
    return antwort(200, { files: Object.fromEntries(Object.entries(g.files).map(([k, v]) => [k, { content: v, truncated: false, raw_url: "" }])) });
  };
  return { fetchFn, gists };
}

function geraet(name: string, fetchFn: FetchFn) {
  const d = new TrainingDB(`geraet-${name}-${Math.random()}`);
  const speicher = new Map<string, string>();
  const konfig: Konfig = { lies: k => speicher.get(k) ?? null, schreib: (k, v) => (v === null ? speicher.delete(k) : speicher.set(k, v), undefined) };
  const timer = { setTimeout: () => 0, clearTimeout: () => {} };
  const s = erzeugeSync({ holeStand: () => leseStand(d), uebernimm: x => uebernimmStand(d, x), konfig, fetchFn, timer });
  return { d, s };
}

describe("Synchronisierung zwischen zwei Geräten", () => {
  let gh: ReturnType<typeof fakeGitHub>;
  beforeEach(() => { gh = fakeGitHub(); });

  it("überträgt Einträge, Änderungen und Löschungen in beide Richtungen", async () => {
    const handy = geraet("handy", gh.fetchFn), pc = geraet("pc", gh.fetchFn);
    await handy.d.handballEinheiten.put(hb("1", 100));
    await handy.s.verbinde("gut");
    expect(gh.gists.size).toBe(1);

    await pc.d.handballEinheiten.put(hb("2", 110));
    await pc.s.verbinde("gut");
    expect(gh.gists.size).toBe(1); // findet das vorhandene Gist
    expect((await pc.d.handballEinheiten.toArray()).map(h => h.id).sort()).toEqual(["1", "2"]);

    await handy.s.synchronisiere();
    expect((await handy.d.handballEinheiten.toArray()).map(h => h.id).sort()).toEqual(["1", "2"]);

    // Am PC ändern, am Handy löschen
    await pc.d.handballEinheiten.put(hb("2", 200, 9));
    await handy.d.handballEinheiten.delete("1");
    await handy.d.geloescht.put({ id: "1", tabelle: "handballEinheiten", zeit: 210 });
    await pc.s.synchronisiere();
    await handy.s.synchronisiere();
    await pc.s.synchronisiere();
    for (const g of [handy, pc]) {
      const s = await leseStand(g.d);
      expect(s.handballEinheiten.map(h => [h.id, h.rpe])).toEqual([["2", 9]]);
    }
  });

  it("lokale Beispieldaten bleiben auf ihrem Gerät", async () => {
    const handy = geraet("handy", gh.fetchFn), pc = geraet("pc", gh.fetchFn);
    await handy.d.uebungen.put({ id: "bsp-x", name: "Beispiel", kategorie: "Brust", beispiel: true });
    await handy.s.verbinde("gut");
    await pc.s.verbinde("gut");
    expect(await pc.d.uebungen.count()).toBe(0);
    expect(await handy.d.uebungen.count()).toBe(1);
  });

  it("falsches Token wird abgelehnt und nicht gespeichert", async () => {
    const handy = geraet("handy", gh.fetchFn);
    await expect(handy.s.verbinde("falsch")).rejects.toThrow("Token ungültig");
    expect(handy.s.verbunden()).toBe(false);
  });

  it("ohne Netz bleibt alles lokal und es wird später erneut versucht", async () => {
    let offline = false;
    const fetchFn: FetchFn = (u, i) => (offline ? Promise.reject(new TypeError("offline")) : gh.fetchFn(u, i));
    const handy = geraet("handy", fetchFn);
    await handy.s.verbinde("gut");
    offline = true;
    await handy.d.handballEinheiten.put(hb("1", 100));
    await handy.s.synchronisiere();
    expect(handy.s.status().zustand).toBe("fehler");
    expect(handy.s.status().text).toMatch(/Offline/);
    offline = false;
    await handy.s.synchronisiere();
    expect(handy.s.status().zustand).toBe("ok");
    const datei = Object.values([...gh.gists.values()][0].files)[0];
    expect(JSON.parse(datei).stand.handballEinheiten).toHaveLength(1);
  });
});
